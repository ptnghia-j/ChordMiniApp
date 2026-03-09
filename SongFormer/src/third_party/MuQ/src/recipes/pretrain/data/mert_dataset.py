# Copyright (c) Facebook, Inc. and its affiliates.
#
# This source code is licensed under the MIT license found in the
# LICENSE file in the root directory of this source tree.

import itertools
import logging
import os
import sys
from typing import Any, List, Optional, Union

import numpy as np
from typing import Tuple
import torch
import torch.nn.functional as F
from fairseq.data import data_utils
from fairseq.data.fairseq_dataset import FairseqDataset
from fairseq.data.audio.audio_utils import (
    parse_path,
    read_from_stored_zip,
)

import math
import io
import torchaudio
# this is in the user_dir
from nnAudio import features as nnAudioFeatures

# from tqdm import tqdm
import tqdm
import json
import random
import traceback
from einops import rearrange
# from scripts.prepare_codecs_from_manifest import *

logger = logging.getLogger(__name__)

class model_cqt_pred(torch.nn.Module):
    def __init__(self, n_bins=84, sr=16000, freq=50):
        super().__init__()
        self.epsilon=1e-10
        # Getting Mel Spectrogram on the fly
        self.spec_layer = nnAudioFeatures.cqt.CQT(sr=sr, hop_length=sr//freq, fmin=32.7, 
                                           fmax=None, n_bins=n_bins, bins_per_octave=n_bins//7, 
                                           filter_scale=1, norm=1, window='hann', center=True, 
                                           pad_mode='constant', trainable=False, 
                                           output_format='Magnitude', verbose=True)

        # self.fc = nn.Linear(input_dim, n_bins)

        # self.criterion = nn.MSELoss()
        self.forward_dict = {
            # 'masked_transformer_output': self.plain_forward
            'compute_cqt': self.compute_cqt
        }
    def compute_cqt(self, x):
        '''
        convert waveform to CQT -> [batch, bins, len] -> transpose
        '''
        # align with the padding of HuBERT model, 
        # the truncation is calculated by bruteforce search since the nnAudio padding strategy and fairseq models are different
        # x = x[..., :-560] 
        return torch.transpose(self.spec_layer(x), -1, -2)

    def forward(self, x, forward_type='masked_transformer_output'):
        '''
        take input from transformer hidden states: [batch, len_seq, channel]
        output: [batch, len_seq, n_bins]
        '''
    
        return self.forward_dict[forward_type](x)

def load_audio_by_json(json_path, max_keep, min_keep, tgt_sample_rate, clip_secs=5):
    # read json file
    print(json_path)
    datas = []
    inds = []
    sizes = []
    with open(json_path) as fp:
        for ind,line in  enumerate(fp):
            data = json.loads(line)
            if 'duration' in data and min_keep is not None and tgt_sample_rate*data['duration'] < min_keep:
                continue
            datas.append(data)
            inds.append(ind)
            # sz = int(data['duration'] * data['sample_rate'])
            if clip_secs > 0:
                sz = int(tgt_sample_rate * clip_secs)
            else:
                sz = int(tgt_sample_rate * data['duration'])
            sizes.append(sz)
    tot = ind + 1 
    return datas,inds,tot,sizes
def load_audio(manifest_path, max_keep, min_keep):
    print(manifest_path)
    
    n_long, n_short = 0, 0
    names, inds, sizes = [], [], []
    with open(manifest_path) as f:
        root = f.readline().strip()
        for ind, line in enumerate(f):
            items = line.strip().split("\t")
            assert len(items) == 2, line
            sz = int(items[1])
            if min_keep is not None and sz < min_keep:
                n_short += 1
            elif max_keep is not None and sz > max_keep:
                n_long += 1
            else:
                names.append(items[0])
                inds.append(ind)
                sizes.append(sz)
    tot = ind + 1
    logger.info(
        (
            f"max_keep={max_keep}, min_keep={min_keep}, "
            f"loaded {len(names)}, skipped {n_short} short and {n_long} long, "
            f"longest-loaded={max(sizes)}, shortest-loaded={min(sizes)}"
        )
    )
    return root, names, inds, tot, sizes


def load_label(label_path, inds, tot):
    with open(label_path) as f:
        labels = []
        for line in tqdm.tqdm(f):
            labels.append(line.rstrip())
        # labels = [line.rstrip() ]
        assert (
            len(labels) == tot
        ), f"number of labels does not match ({len(labels)} != {tot})"
        labels = [labels[i] for i in inds]
    return labels

def load_numpy_label(label_path, inds, tot):
    labels = np.load(label_path, mmap_mode='r')
    assert (labels.shape[0] == tot), f"number of labels does not match ({labels.shape[0]} != {tot})"
    return labels

def verify_label_lengths(
    audio_sizes,
    audio_rate,
    label_path,
    label_rate,
    inds,
    tot,
    tol=0.1,  # tolerance in seconds
):
    if label_rate < 0:
        logger.info(f"{label_path} is sequence label. skipped")
        return

    with open(label_path) as f:
        lengths = []
        for line in tqdm.tqdm(f):
            lengths.append(len(line.rstrip().split()))
        assert len(lengths) == tot
        lengths = [lengths[i] for i in inds]
    num_invalid = 0
    for i, ind in enumerate(inds):
        dur_from_audio = audio_sizes[i] / audio_rate
        dur_from_label = lengths[i] / label_rate
        if abs(dur_from_audio - dur_from_label) > tol:
            logger.warning(
                (
                    f"audio and label duration differ too much "
                    f"(|{dur_from_audio} - {dur_from_label}| > {tol}) "
                    f"in line {ind+1} of {label_path}. Check if `label_rate` "
                    f"is correctly set (currently {label_rate}). "
                    f"num. of samples = {audio_sizes[i]}; "
                    f"label length = {lengths[i]}"
                )
            )
            num_invalid += 1
    if num_invalid > 0:
        logger.warning(
            f"total {num_invalid} (audio, label) pairs with mismatched lengths"
        )

class Read_and_PadCrop_Normalized_T(torch.nn.Module):
    def __init__(self, n_samples: int, sample_rate: int, randomize: bool = True):
        
        super().__init__()
        
        self.n_samples = n_samples
        self.sample_rate = sample_rate
        self.randomize = randomize


    def __call__(self, filename: str, duration: float, cur_sample_rate: int, fixed_offset_duration=None) -> Tuple[torch.Tensor, float, float, int, int]:
        if self.n_samples is None:
            chunk, cur_sample_rate = torchaudio.load(filename)
            t_start = 0.
            t_end = 1.0
            offset = 0
        elif(duration<(float(self.n_samples)/self.sample_rate+1)):
            chunk, _ = torchaudio.load(filename, frame_offset=0, num_frames=-1)
            t_start = 0.
            t_end = min(1.0, float(self.n_samples) / float(self.sample_rate) / duration)
            offset = 0
        else:
            if fixed_offset_duration is None:
                offset = np.random.randint(0,int(duration*cur_sample_rate)-int(float(self.n_samples)/self.sample_rate*cur_sample_rate))
            else:
                offset = int(cur_sample_rate*fixed_offset_duration)
            t_start = offset / float(cur_sample_rate) / duration
            t_end = t_start + float(self.n_samples) / float(self.sample_rate) / duration
            chunk, _ = torchaudio.load(filename, frame_offset=offset, num_frames=int(float(self.n_samples)/self.sample_rate*cur_sample_rate))
        # Pad with silence if necessary.
        if(chunk.shape[0]>1):
            chunk = chunk[torch.randint(chunk.shape[0], size=(1,)),:].float()
        else:
            chunk = chunk[[0],:].float()
        if(cur_sample_rate!=self.sample_rate):
            chunk = torchaudio.functional.resample(chunk, cur_sample_rate, self.sample_rate)
        if self.n_samples is None:
            pass
        elif chunk.shape[-1] < self.n_samples:
            chunk = torch.cat([chunk, torch.zeros((1, self.n_samples - chunk.shape[-1],))],-1)
        else:
            chunk = chunk[:,0:self.n_samples]
        seconds_start = math.floor(offset / cur_sample_rate)
        seconds_total = math.floor(duration)

        return (
            chunk,
            t_start,
            t_end,
            seconds_start,
            seconds_total
        )


class MERTDataset(FairseqDataset):
    def __init__(
        self,
        manifest_path: str,
        sample_rate: float,
        label_paths: List[str],
        label_rates: Union[List[float], float],  # -1 for sequence labels
        pad_list: List[str],
        eos_list: List[str],
        label_scp_path: Optional[str] = None,
        label_scp_clip_duration: float = -1,
        label_processors: Optional[List[Any]] = None,
        max_keep_sample_size: Optional[int] = None,
        min_keep_sample_size: Optional[int] = None,
        max_sample_size: Optional[int] = None,
        shuffle: bool = True,
        pad_audio: bool = False,
        normalize: bool = False,
        store_labels: bool = True,
        npmemmap: bool = False,
        random_crop: bool = False,
        single_target: bool = False,
        augmentation_effects: List[str] = [],
        augmentation_probs: List[float] = [],
        inbatch_noise_augment_len_range: List[int] = [8000, 24000],
        inbatch_noise_augment_number_range: List[int] = [1, 3],
        inbatch_noise_augment_volume: float = 1.0,
        cqt_prediction_bin: int = -1,
        dataset_len:int = 128*3000,
        clip_secs = 5,
    ):
        self.sample_rate = sample_rate
        self.shuffle = shuffle
        self.random_crop = random_crop
        self.datas,inds,tot,self.sizes = load_audio_by_json(manifest_path,max_keep_sample_size,min_keep_sample_size, self.sample_rate, clip_secs)
        self.inds = inds

        self.num_labels = len(label_paths)
        self.pad_list = pad_list
        self.eos_list = eos_list
        self.label_processors = label_processors
        self.single_target = single_target
        self.label_rates = (
            [label_rates for _ in range(len(label_paths))]
            if isinstance(label_rates, float)
            else label_rates
        )
        self.store_labels = store_labels
        self.npmemmap = npmemmap
        self.label_scp_path = label_scp_path
        self.label_scp_clip_duration = label_scp_clip_duration


        if self.label_scp_path is not None:
            from kaldiio import load_scp
            self.label_scp = load_scp(self.label_scp_path)

        # self.dataset_len = dataset_len
        self.dataset_len = len(self.datas)
        logger.info('preparing labels')
        logger.info('========dataset len: {}=========='.format(self.dataset_len))
        if store_labels:
            if self.npmemmap:
                self.label_list = [load_numpy_label(p+'.npy', inds, tot) for p in label_paths] 
            else:
                self.label_list = [load_label(p, inds, tot) for p in label_paths]        
        else:
            self.label_paths = label_paths
            # self.label_offsets_list = [
            #     load_label_offset(p, inds, tot) for p in label_paths
            # ]
        assert label_processors is None or len(label_processors) == self.num_labels
        # logger.info('skip verify labels and audio lengths')
        # for label_path, label_rate in zip(label_paths, self.label_rates):
        #     verify_label_lengths(
        #         self.sizes, sample_rate, label_path, label_rate, inds, tot
        #     )

        self.max_sample_size = (
            max_sample_size if max_sample_size is not None else sys.maxsize
        )
        self.pad_audio = pad_audio
        self.normalize = normalize
        logger.info(
            f"pad_audio={pad_audio}, random_crop={random_crop}, "
            f"normalize={normalize}, max_sample_size={self.max_sample_size}"
        )

        self.augmentation_effects = augmentation_effects
        self.augmentation_probs = augmentation_probs
        # if len(self.augmentation_effects) > 0:
            # self.augmentor_init()
            # self.apply_augmentation = self.augmentation_factry(sample_rate)

        self.inbatch_noise_augment_len_range = inbatch_noise_augment_len_range
        self.inbatch_noise_augment_number_range = inbatch_noise_augment_number_range
        self.inbatch_noise_augment_volume = inbatch_noise_augment_volume
        

        self.cqt_prediction_bin = cqt_prediction_bin
        if self.cqt_prediction_bin > 0:
            self.encoder_cqt_model = model_cqt_pred(n_bins=self.cqt_prediction_bin)
            logger.info('preparing cqt loss objective in dataloader with cpu')

        self.epoch = -1

        self.reader = Read_and_PadCrop_Normalized_T(n_samples=clip_secs*sample_rate if clip_secs>0 else None, sample_rate = self.sample_rate)


            
    @property
    def can_reuse_epoch_itr_across_epochs(self):
        """
        Whether we can reuse the :class:`fairseq.data.EpochBatchIterator` for
        this dataset across epochs.

        This needs to return ``False`` if the sample sizes can change across
        epochs, in which case we may need to regenerate batches at each epoch.
        If your dataset relies in ``set_epoch`` then you should consider setting
        this to ``False``.
        """
        return False
    def set_epoch(self, epoch):
        """Will receive the updated epoch number at the beginning of the epoch."""
        self.epoch = epoch
        
    def inbatch_noise_augment(self, 
        target_audio: torch.Tensor, target_audio_idx: int , 
        batch_audios: torch.Tensor, # [bsz, audio_lengths]
        noise_len_min: int, noise_len_max: int, 
        n_noise_min: int, n_noise_max: int,
        noise_vol: float = 1.0):
        '''
        augmenation that leverages in-batch noise audios.
        noise_len_min and noise_len_max are the range of the lengths of noises (counted as samples)
        n_noise_min and n_noise_max are the range of number of noises,
        '''    
        # assert noise_len_max <= target_audio.shape[0] and noise_len_min >= 1 # should assert this outside?

        augmented_audio = torch.clone(target_audio)
        if noise_vol <= 0:
            return augmented_audio

        # exclude the target audio and use the rest as noise candidates
        noise_pool = torch.cat( batch_audios[:target_audio_idx] + batch_audios[target_audio_idx+1:], dim=0).view(-1)

        n_noise = np.random.randint(n_noise_min, n_noise_max)
        # n_noise
        random_start_idxs = np.random.randint(0, noise_pool.shape[0] - noise_len_max, size=(n_noise,))
        random_durations = np.random.randint(noise_len_min, noise_len_max, size=(n_noise,))

        for noise_idx in range(n_noise):
            augmentation_position = np.random.randint(0, target_audio.shape[0] - random_durations[noise_idx], size=None)
            # assign noise to the original audio
            augmented_audio[augmentation_position:augmentation_position+random_durations[noise_idx]] += \
                noise_vol * noise_pool[random_start_idxs[noise_idx]: random_start_idxs[noise_idx]+random_durations[noise_idx]]
                
        return augmented_audio
    
    def get_audio_by_slice(self,index):
        
        metas = self.datas[index]
        wav_path = metas['path']
        # print(wav_path)

        if 'sample_rate' in metas and 'duration' in metas:
            origin_sample_rate = metas['sample_rate']
            origin_duration = metas['duration']
        else:
            audio_info =  torchaudio.info(wav_path)
            origin_sample_rate = audio_info.sample_rate
            origin_duration = audio_info.num_frames / origin_sample_rate
        
        if self.label_scp_path is not None:
            if origin_duration < self.label_scp_clip_duration:
                raise ValueError(f"origin duration {origin_duration} too small")
            max_n_step = min(int(origin_duration//self.label_scp_clip_duration), 10) 
            step = int(math.floor(random.random() * max_n_step)) % max_n_step 
            ind = self.inds[index]
            scp_key = f'{ind}:{step}'
            if scp_key not in self.label_scp:
                raise KeyError(scp_key)
            label = torch.from_numpy(self.label_scp[scp_key])
            label = rearrange(label, "(n s) -> n s", n=8) 
            wav, *ignored = self.reader(wav_path, origin_duration, origin_sample_rate, fixed_offset_duration=step*self.label_scp_clip_duration)
        else:
            wav, *ignored = self.reader(wav_path, origin_duration, origin_sample_rate)
            label = None
        wav = wav.float()

        wav = wav.permute(1,0)
        wav = self.postprocess(wav, self.sample_rate)
        return wav, label
    def get_audio(self, index):
        import soundfile as sf

        # wav_path = os.path.join(self.audio_root, self.audio_names[index])
        wav_path = os.path.join('/apdcephfs/share_1316500/cloudezhou/MERT/MERT/converted', self.audio_names[index])
        _path, slice_ptr = parse_path(wav_path)
        # original way
        if len(slice_ptr) == 0:
            wav, cur_sample_rate = sf.read(_path)
        else:
            assert _path.endswith(".zip")
            data = read_from_stored_zip(_path, slice_ptr[0], slice_ptr[1])
            f = io.BytesIO(data)
            wav, cur_sample_rate = sf.read(f)
        wav = torch.from_numpy(wav).float()
        
        wav = self.postprocess(wav, cur_sample_rate)
        return wav

    def get_label(self, index, label_idx):

        if self.store_labels and (not self.npmemmap):
            label = self.label_list[label_idx][index]
        elif self.store_labels and self.npmemmap:
            label = self.label_list[label_idx][index]
        else:
            with open(self.label_paths[label_idx]) as f:
                offset_s, offset_e = self.label_offsets_list[label_idx][index]
                f.seek(offset_s)
                label = f.read(offset_e - offset_s)

        if self.label_processors is not None:
            label = self.label_processors[label_idx](label)
        return 0

    def get_labels(self, index):
        return [self.get_label(index, i) for i in range(self.num_labels)]

    def __getitem__(self, i):
        index = i
        item = None
        while item is None:
            try:
                wav, label = self.get_audio_by_slice(index)
                item = {"id": index, "source": wav}
                if label is not None:
                    item['label'] = label
            except Exception as e:
                traceback.print_exc()
                print(f'skip damaged data {index}')
                index = np.random.randint(0,len(self.sizes)-1)
        return item

    def __len__(self):
        return self.dataset_len

    def crop_to_max_size(self, wav, target_size):
        size = len(wav)
        diff = size - target_size
        if diff <= 0:
            return wav, 0

        start, end = 0, target_size
        if self.random_crop:
            start = np.random.randint(0, diff + 1)
            end = size - diff + start
        return wav[start:end], start

    def collater(self, samples):
        samples = [s for s in samples if s["source"] is not None]
        if len(samples) == 0:
            return {}
        
        audios = [s["source"] for s in samples]
        audio_sizes = [len(s) for s in audios]
        # print("Audio sizes in batch:", audio_sizes, "Ids:", [s["id"] for s in samples])
        if self.pad_audio:
            audio_size = min(max(audio_sizes), self.max_sample_size)
        else:
            audio_size = min(min(audio_sizes), self.max_sample_size)
        collated_audios, padding_mask, audio_starts, collated_cqt_labels = self.collater_audio(
            audios, audio_size
        )


        net_input = {"source": collated_audios, "padding_mask": padding_mask, "cqt_labels": collated_cqt_labels}
        if len(samples) > 0 and 'label' in samples[0]:
            net_input['label'] = torch.stack([s['label'] for s in samples])

        batch = {
            "id": torch.LongTensor([s["id"] for s in samples]),
            "net_input": net_input,
        }

        if self.single_target:
            batch["target_lengths"] = None
            batch["ntokens"] = None
            batch["target"] = None
        else:
            batch["target_lengths_list"] = None
            batch["ntokens_list"] = None
            batch["target_list"] = None
        return batch

    def collater_audio(self, audios, audio_size):
        collated_audios = audios[0].new_zeros(len(audios), audio_size)
        padding_mask = (
            torch.BoolTensor(collated_audios.shape).fill_(False)
        )
        audio_starts = [0 for _ in audios]

        for i, audio in enumerate(audios):
            diff = len(audio) - audio_size
            if diff == 0:
                collated_audios[i] = audio
            elif diff < 0:
                assert self.pad_audio
                collated_audios[i] = torch.cat([audio, audio.new_full((-diff,), 0.0)])
                padding_mask[i, diff:] = True
            else:
                collated_audios[i], audio_starts[i] = self.crop_to_max_size(
                    audio, audio_size
                )

        cqt_labels = None
        if self.cqt_prediction_bin > 0:
            cqt_labels = self.encoder_cqt_model(collated_audios.float(), forward_type='compute_cqt')

        for i, _ in enumerate(audios):
            # compute cqt labels in advance
            # cqt_labels

            # apply audio augmentation effects here
            # the audio should be as the type torch.Tensor, in the shape [1, length] TODO?
            if len(self.augmentation_effects) > 0:
                with torch.no_grad():
                    for effect, prob in zip(self.augmentation_effects, self.augmentation_probs):
                        if torch.rand(1).item() > prob:
                            if effect == 'composed_augmentation_v1':
                                # collated_audios[i] = self.composed_augment_v1(collated_audios[i])
                                pass
                            elif effect == 'inbatch_noise_augment':
                                assert len(audios) > 1
                                collated_audios[i] = self.inbatch_noise_augment(
                                    target_audio = collated_audios[i], target_audio_idx = i, batch_audios = audios,
                                    noise_len_min = self.inbatch_noise_augment_len_range[0], noise_len_max = self.inbatch_noise_augment_len_range[1], 
                                    n_noise_min = self.inbatch_noise_augment_number_range[0], n_noise_max = self.inbatch_noise_augment_number_range[1],
                                    noise_vol = self.inbatch_noise_augment_volume)
                            else:
                                raise NotImplementedError()        


        return collated_audios, padding_mask, audio_starts, cqt_labels

    def collater_frm_label(self, targets, audio_size, audio_starts, label_rate, pad):
        assert label_rate > 0
        s2f = label_rate / self.sample_rate  # 0.00625 for 100Hz and 16k sr
        frm_starts = [int(round(s * s2f)) for s in audio_starts] # should be all 0 if the audios are not croped
        frm_size = int(round(audio_size * s2f)) # this is the expected total number of given pseudo labels
        if not self.pad_audio:
            rem_size = [len(t) - s for t, s in zip(targets, frm_starts)]
            frm_size = min(frm_size, *rem_size)
        targets = [t[s : s + frm_size] for t, s in zip(targets, frm_starts)]
        logger.debug(f"audio_starts={audio_starts}")
        logger.debug(f"frame_starts={frm_starts}")
        logger.debug(f"frame_size={frm_size}")

        lengths = torch.LongTensor([len(t) for t in targets])
        ntokens = lengths.sum().item()
        targets = data_utils.collate_tokens(targets, pad_idx=pad, left_pad=False)
        return targets, lengths, ntokens

    def collater_seq_label(self, targets, pad):
        lengths = torch.LongTensor([len(t) for t in targets])
        ntokens = lengths.sum().item()
        targets = data_utils.collate_tokens(targets, pad_idx=pad, left_pad=False)
        return targets, lengths, ntokens

    def collater_label(self, targets_by_label, audio_size, audio_starts):
        targets_list, lengths_list, ntokens_list = [], [], []
        itr = zip(targets_by_label, self.label_rates, self.pad_list)
        for targets, label_rate, pad in itr:
            if label_rate == -1.0:
                targets, lengths, ntokens = self.collater_seq_label(targets, pad)
            else:
                targets, lengths, ntokens = self.collater_frm_label(
                    targets, audio_size, audio_starts, label_rate, pad
                )
            targets_list.append(targets)
            lengths_list.append(lengths)
            ntokens_list.append(ntokens)
        return targets_list, lengths_list, ntokens_list

    def num_tokens(self, index):
        return self.size(index)

    def size(self, index):
        if self.pad_audio:
            return self.sizes[index]
        return min(self.sizes[index], self.max_sample_size)

    def ordered_indices(self):
        if self.shuffle:
            try:
                print("========Local rank :",torch.distributed.get_rank(),"========")
                WORLD_SIZE = int(torch.distributed.get_world_size())
                WORLD_RANK = int(torch.distributed.get_rank())
                np.random.seed(self.epoch * WORLD_SIZE + WORLD_RANK)
                order = np.random.permutation(len(self.sizes))
                print("==================multinode multigpu shuffle==================")
            except:
                print("==================singlenode shuffle==================")
                order = np.random.permutation(len(self.sizes))
        else:
            order = np.arange(len(self.sizes))

        return order

    def postprocess(self, wav, cur_sample_rate):
        if wav.dim() == 2:
            wav = wav.mean(-1)
        assert wav.dim() == 1, wav.dim()

        if cur_sample_rate != self.sample_rate:
            raise Exception(f"sr {cur_sample_rate} != {self.sample_rate}")

        if self.normalize:
            with torch.no_grad():
                wav = F.layer_norm(wav, wav.shape)
        return wav
