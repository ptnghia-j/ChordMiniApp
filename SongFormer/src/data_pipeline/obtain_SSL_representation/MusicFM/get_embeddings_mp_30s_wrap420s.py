import argparse
import multiprocessing as mp
import os
import pdb
import time
import traceback
from argparse import Namespace
from collections import defaultdict
from pathlib import Path

import librosa
import numpy as np
import torch
from loguru import logger
from musicfm.model.musicfm_25hz import MusicFM25Hz
from tqdm import tqdm

mp.set_start_method("spawn", force=True)


def get_processed_ids(output_path):
    if not os.path.exists(output_path):
        return set()
    ids = os.listdir(output_path)
    ret = []
    for x in ids:
        if x.endswith(".npy"):
            ret.append(x.replace(".npy", ""))

    ret = ["_".join(x.split("_")[:-1]) for x in ret if x.split("_")[-1] == "0"]
    return set(ret)


def get_processing_ids(input_path, processed_ids_set):
    # return []
    ret = []
    with open(input_path) as f:
        for line in f:
            if line.strip() and Path(line.strip()).stem not in processed_ids_set:
                ret.append(line.strip())

    return ret


def inference(rank, queue_input: mp.Queue, queue_output: mp.Queue, args):
    device = f"cuda:{rank}"

    # load MusicFM
    musicfm = MusicFM25Hz(
        is_flash=False,
        stat_path=os.path.join(
            "..", "SongFormer", "ckpts", "MusicFM", "msd_stats.json"
        ),
        model_path=os.path.join(
            "..", "SongFormer", "ckpts", "MusicFM", "pretrained_msd.pt"
        ),
    )
    musicfm = musicfm.to(device)

    sampling_rate = 24000
    WIN_SIZE = 30  # seconds
    HOP_SIZE = 30  # seconds
    WRAP_SIZE = 420
    assert WRAP_SIZE % WIN_SIZE == 0
    assert WRAP_SIZE % HOP_SIZE == 0
    logger.warning("WIN_SIZE, HOP_SIZE is fixed!")
    logger.warning(
        f"WIN_SIZE: {WIN_SIZE}, HOP_SIZE: {HOP_SIZE}, WRAP_SIZE: {WRAP_SIZE}"
    )

    output_dir = args.output_path
    with torch.no_grad():
        while True:
            item = queue_input.get()
            if not item:
                queue_output.put(None)
                break

            try:
                wav_path = item
                wav = librosa.load(wav_path, sr=24000)[0]

                wav = torch.from_numpy(wav).float()
                wav = wav.unsqueeze(0)
                # to GPUs
                wav = wav.to(device)
                musicfm.eval()

                for i in range(0, 10000, WRAP_SIZE):
                    if i * sampling_rate >= wav.shape[-1]:
                        break
                    layer_embd = defaultdict(list)
                    for j in range(0, WRAP_SIZE, HOP_SIZE):
                        start_idx = (i + j) * sampling_rate
                        end_idx = min((i + j + WIN_SIZE) * sampling_rate, wav.shape[-1])
                        if start_idx >= wav.shape[-1]:
                            break
                        audio_seg = wav[:, start_idx:end_idx]
                        if audio_seg.shape[-1] < 1025:
                            break
                        if audio_seg.numel() == 0:
                            continue
                        _, hidden_states = musicfm.get_predictions(audio_seg)
                        for tmp in [10]:
                            layer_embd[tmp].append(
                                hidden_states[tmp].detach().cpu().float().numpy()
                            )
                    for z in layer_embd:
                        emdb_list = layer_embd[z]
                        # [1, T, D=1024]
                        emdb_list = np.concatenate(emdb_list, axis=1)
                        assert emdb_list.ndim == 3
                        assert emdb_list.shape[0] == 1
                        assert emdb_list.shape[2] == 1024

                        os.makedirs(
                            os.path.join(args.output_dir, f"layer_{z}"), exist_ok=True
                        )
                        embeddings_output_dir = os.path.join(
                            args.output_dir, f"layer_{z}", f"{Path(item).stem}_{i}.npy"
                        )

                        np.save(
                            embeddings_output_dir,
                            emdb_list,
                        )
                    del hidden_states, audio_seg, emdb_list
                    torch.cuda.empty_cache()
                queue_output.put(None)

            except Exception:
                tb_str = traceback.format_exc()
                logger.error(f"process {rank} error\n{item}\n{tb_str}")
                queue_output.put(None)
                continue


def deal_with_output(output_path, queue_output, length):
    pbar = tqdm(range(length), desc="get inference output")
    for _ in pbar:
        data = queue_output.get()
        if not data:
            continue


def main(args):
    input_path = args.input_path
    output_path = args.output_path
    gpu_num = args.gpu_num
    num_thread_per_gpu = args.num_thread_per_gpu
    debug = args.debug

    processed_ids = get_processed_ids(output_path=os.path.join(output_path, "layer_10"))
    processing_ids = get_processing_ids(input_path, processed_ids)

    num_threads = num_thread_per_gpu * gpu_num

    queue_input: mp.Queue = mp.Queue()
    queue_output: mp.Queue = mp.Queue()

    init_args = Namespace(
        output_path=output_path, output_dir=output_path, win_size=420, hop_size=420
    )

    processes = []

    if debug:
        queue_input.put(processing_ids[0])
        queue_input.put(None)

        inference(0, queue_input, queue_output, init_args)

        pdb.set_trace()

        print("debug exit")
        exit(0)

    for thread_num in range(num_threads):
        rank = thread_num % gpu_num
        print(f"num_threads: {thread_num} on GPU {rank}")
        time.sleep(0.2)  # Slow start to prevent graphics card crash
        p = mp.Process(
            target=inference,
            args=(rank, queue_input, queue_output, init_args),
            daemon=True,
        )
        p.start()
        processes.append(p)

    for wav_id in tqdm(processing_ids, desc="add data to queue"):
        queue_input.put(wav_id)

    for _ in range(num_threads):
        queue_input.put(None)

    deal_with_output(output_path, queue_output, len(processing_ids))

    for p in processes:
        p.join()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()

    # Input/Output arguments
    parser.add_argument(
        "--input_path",
        "-i",
        type=str,
        required=True,
        help="Path to the input audio list file",
    )
    parser.add_argument(
        "--output_path",
        "-o",
        type=str,
        required=True,
        help="Path to the output directory",
    )

    # GPU and thread configuration
    parser.add_argument(
        "--gpu_num",
        "-gn",
        type=int,
        default=1,
        help="Number of GPUs to use (default: 1)",
    )
    parser.add_argument(
        "--num_thread_per_gpu",
        "-tn",
        type=int,
        default=2,
        help="Number of threads per GPU (default: 2)",
    )

    # Debug mode
    parser.add_argument("--debug", action="store_true", help="Enable debug mode")

    args = parser.parse_args()
    main(args=args)
