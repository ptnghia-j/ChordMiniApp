from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Any, Callable

import librosa
import numpy as np
import torch


@dataclass(slots=True)
class ProcessAudioStats:
    total_seconds: float
    audio_load_seconds: float
    num_420_windows: int
    num_30s_chunks: int
    num_30s_full_chunks: int
    num_30s_tail_chunks: int
    num_30s_batches: int
    muq_420_seconds: float
    musicfm_420_seconds: float
    muq_30_seconds: float
    musicfm_30_seconds: float
    msa_infer_seconds: float


@dataclass(slots=True)
class ProcessAudioResult:
    msa_output: Any
    stats: ProcessAudioStats


def process_audio_sequential(
    audio_path: str,
    *,
    device: torch.device,
    ensure_models_initialized: Callable[[], Any],
    run_muq_hidden_state_batch: Callable[[torch.Tensor], torch.Tensor],
    run_musicfm_hidden_state_batch: Callable[[torch.Tensor], torch.Tensor],
    clear_accelerator_cache_if_available: Callable[[], None],
    msa_model: Any,
    dataset_id_allowed_label_ids: dict[int, list[int]],
    dataset_label_to_dataset_id: dict[str, int],
    dataset_label: str,
    dataset_ids: list[int],
    time_dur: int,
    input_sampling_rate: int,
    after_downsampling_frame_rates: float,
    min_audio_samples: int,
    chunk_30s_duration_seconds: int,
    batch_30s_enabled: bool,
    batch_30s_size: int,
    num_classes: int,
    win_size: int,
    hop_size: int,
    postprocess_functional_structure: Callable[[dict[str, torch.Tensor], Any], Any],
) -> ProcessAudioResult:
    process_start = time.perf_counter()
    hp = ensure_models_initialized()

    audio_load_start = time.perf_counter()
    wav, _sr = librosa.load(audio_path, sr=input_sampling_rate)
    audio = torch.tensor(wav, dtype=torch.float32, device=device)
    audio_load_seconds = time.perf_counter() - audio_load_start

    total_len = ((audio.shape[0] // input_sampling_rate) // time_dur * time_dur) + time_dur
    total_frames = math.ceil(total_len * after_downsampling_frame_rates)
    logits = {
        "function_logits": np.zeros([total_frames, num_classes], dtype=np.float32),
        "boundary_logits": np.zeros([total_frames], dtype=np.float32),
    }
    logits_num = {
        "function_logits": np.zeros([total_frames, num_classes], dtype=np.float32),
        "boundary_logits": np.zeros([total_frames], dtype=np.float32),
    }

    dataset_id2label_mask: dict[int, np.ndarray] = {}
    for key, allowed_ids in dataset_id_allowed_label_ids.items():
        dataset_id2label_mask[key] = np.ones(num_classes, dtype=bool)
        dataset_id2label_mask[key][allowed_ids] = False

    lens = 0
    i = 0
    num_420_windows = 0
    num_30s_chunks = 0
    num_30s_full_chunks = 0
    num_30s_tail_chunks = 0
    num_30s_batches = 0
    muq_420_seconds = 0.0
    musicfm_420_seconds = 0.0
    muq_30_seconds = 0.0
    musicfm_30_seconds = 0.0
    msa_infer_seconds = 0.0
    full_chunk_sample_count = chunk_30s_duration_seconds * input_sampling_rate

    with torch.no_grad():
        while True:
            start_idx = i * input_sampling_rate
            end_idx = min((i + win_size) * input_sampling_rate, audio.shape[-1])
            if start_idx >= audio.shape[-1]:
                break
            if end_idx - start_idx < min_audio_samples:
                i += hop_size
                continue

            audio_seg = audio[start_idx:end_idx]
            num_420_windows += 1

            muq_420_start = time.perf_counter()
            muq_embd_420s = run_muq_hidden_state_batch(audio_seg.unsqueeze(0))
            muq_420_seconds += time.perf_counter() - muq_420_start
            clear_accelerator_cache_if_available()

            musicfm_420_start = time.perf_counter()
            musicfm_embd_420s = run_musicfm_hidden_state_batch(audio_seg.unsqueeze(0))
            musicfm_420_seconds += time.perf_counter() - musicfm_420_start
            clear_accelerator_cache_if_available()

            audio_chunks_30s: list[torch.Tensor] = []
            for idx_30s in range(i, i + hop_size, chunk_30s_duration_seconds):
                start_idx_30s = idx_30s * input_sampling_rate
                end_idx_30s = min(
                    (idx_30s + chunk_30s_duration_seconds) * input_sampling_rate,
                    audio.shape[-1],
                    (i + hop_size) * input_sampling_rate,
                )
                if start_idx_30s >= audio.shape[-1]:
                    break
                if end_idx_30s - start_idx_30s < min_audio_samples:
                    continue

                num_30s_chunks += 1
                audio_chunk_30s = audio[start_idx_30s:end_idx_30s]
                audio_chunks_30s.append(audio_chunk_30s)
                if audio_chunk_30s.shape[-1] == full_chunk_sample_count:
                    num_30s_full_chunks += 1
                else:
                    num_30s_tail_chunks += 1

            wrapped_muq_embd_30s: list[torch.Tensor | None] = [None] * len(audio_chunks_30s)
            wrapped_musicfm_embd_30s: list[torch.Tensor | None] = [None] * len(audio_chunks_30s)

            full_chunk_indices = [
                chunk_idx
                for chunk_idx, audio_chunk_30s in enumerate(audio_chunks_30s)
                if audio_chunk_30s.shape[-1] == full_chunk_sample_count
            ]

            if batch_30s_enabled and full_chunk_indices:
                for batch_start_idx in range(0, len(full_chunk_indices), batch_30s_size):
                    batch_chunk_indices = full_chunk_indices[batch_start_idx:batch_start_idx + batch_30s_size]
                    batch_audio = torch.stack([audio_chunks_30s[idx] for idx in batch_chunk_indices], dim=0)
                    num_30s_batches += 1

                    muq_30_start = time.perf_counter()
                    muq_hidden_batch = run_muq_hidden_state_batch(batch_audio)
                    muq_30_seconds += time.perf_counter() - muq_30_start
                    for batch_item_idx, chunk_idx in enumerate(batch_chunk_indices):
                        wrapped_muq_embd_30s[chunk_idx] = muq_hidden_batch[batch_item_idx:batch_item_idx + 1]
                    del muq_hidden_batch
                    clear_accelerator_cache_if_available()

                    musicfm_30_start = time.perf_counter()
                    musicfm_hidden_batch = run_musicfm_hidden_state_batch(batch_audio)
                    musicfm_30_seconds += time.perf_counter() - musicfm_30_start
                    for batch_item_idx, chunk_idx in enumerate(batch_chunk_indices):
                        wrapped_musicfm_embd_30s[chunk_idx] = musicfm_hidden_batch[batch_item_idx:batch_item_idx + 1]
                    del musicfm_hidden_batch
                    clear_accelerator_cache_if_available()

            for chunk_idx, audio_chunk_30s in enumerate(audio_chunks_30s):
                if wrapped_muq_embd_30s[chunk_idx] is not None and wrapped_musicfm_embd_30s[chunk_idx] is not None:
                    continue

                single_chunk_batch = audio_chunk_30s.unsqueeze(0)

                muq_30_start = time.perf_counter()
                wrapped_muq_embd_30s[chunk_idx] = run_muq_hidden_state_batch(single_chunk_batch)
                muq_30_seconds += time.perf_counter() - muq_30_start
                clear_accelerator_cache_if_available()

                musicfm_30_start = time.perf_counter()
                wrapped_musicfm_embd_30s[chunk_idx] = run_musicfm_hidden_state_batch(single_chunk_batch)
                musicfm_30_seconds += time.perf_counter() - musicfm_30_start
                clear_accelerator_cache_if_available()

            if wrapped_muq_embd_30s and wrapped_musicfm_embd_30s:
                all_embds = [
                    torch.concatenate([embd for embd in wrapped_musicfm_embd_30s if embd is not None], dim=1),
                    torch.concatenate([embd for embd in wrapped_muq_embd_30s if embd is not None], dim=1),
                    musicfm_embd_420s,
                    muq_embd_420s,
                ]
                min_embd_len = min(x.shape[1] for x in all_embds)
                embd = torch.concatenate([x[:, :min_embd_len, :] for x in all_embds], axis=-1)

                msa_infer_start = time.perf_counter()
                _msa_info, chunk_logits = msa_model.infer(
                    input_embeddings=embd,
                    dataset_ids=torch.tensor(dataset_ids, device=device, dtype=torch.long),
                    label_id_masks=torch.tensor(
                        dataset_id2label_mask[dataset_label_to_dataset_id[dataset_label]],
                        device=device,
                        dtype=torch.bool,
                    ).unsqueeze(0).unsqueeze(0),
                    with_logits=True,
                )
                msa_infer_seconds += time.perf_counter() - msa_infer_start

                start_frame = int(i * after_downsampling_frame_rates)
                end_frame = start_frame + min(
                    math.ceil(hop_size * after_downsampling_frame_rates),
                    chunk_logits["boundary_logits"][0].shape[0],
                )
                logits["function_logits"][start_frame:end_frame, :] += chunk_logits["function_logits"][0].detach().cpu().numpy()
                logits["boundary_logits"][start_frame:end_frame] = chunk_logits["boundary_logits"][0].detach().cpu().numpy()
                logits_num["function_logits"][start_frame:end_frame, :] += 1
                logits_num["boundary_logits"][start_frame:end_frame] += 1
                lens += end_frame - start_frame

            i += hop_size

    logits["function_logits"] /= np.maximum(logits_num["function_logits"], 1)
    logits["boundary_logits"] /= np.maximum(logits_num["boundary_logits"], 1)
    logits["function_logits"] = torch.from_numpy(logits["function_logits"][:lens]).unsqueeze(0)
    logits["boundary_logits"] = torch.from_numpy(logits["boundary_logits"][:lens]).unsqueeze(0)

    return ProcessAudioResult(
        msa_output=postprocess_functional_structure(logits, hp),
        stats=ProcessAudioStats(
            total_seconds=time.perf_counter() - process_start,
            audio_load_seconds=audio_load_seconds,
            num_420_windows=num_420_windows,
            num_30s_chunks=num_30s_chunks,
            num_30s_full_chunks=num_30s_full_chunks,
            num_30s_tail_chunks=num_30s_tail_chunks,
            num_30s_batches=num_30s_batches,
            muq_420_seconds=muq_420_seconds,
            musicfm_420_seconds=musicfm_420_seconds,
            muq_30_seconds=muq_30_seconds,
            musicfm_30_seconds=musicfm_30_seconds,
            msa_infer_seconds=msa_infer_seconds,
        ),
    )