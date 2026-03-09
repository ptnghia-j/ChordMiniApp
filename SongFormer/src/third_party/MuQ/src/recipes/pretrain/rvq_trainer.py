import sys, os
import argparse


from muq.muq.modules.rvq import *
from muq.muq.modules.features import MelSTFT
import fairseq
import torch
from torch.utils.data import Dataset, DataLoader
import json, traceback
import torchaudio
import math
import torch.nn as nn

from typing import List, Tuple, Dict, Any

CLIPSECS = 5 # 5 for rvq, 30 for model


def load_audio_by_json(json_path, max_keep, min_keep, tgt_sample_rate):
    # read json file
    print(json_path)
    datas = []
    inds = []
    sizes = []
    with open(json_path) as fp:
        for ind,line in  enumerate(fp):
            data = json.loads(line)
            datas.append(data)
            inds.append(ind)
            # sz = int(data['duration'] * data['sample_rate'])
            sz = int(tgt_sample_rate * CLIPSECS)
            sizes.append(sz)
    tot = ind + 1 
    return datas,inds,tot,sizes

class Read_and_PadCrop_Normalized_T(torch.nn.Module):
    def __init__(self, n_samples: int, sample_rate: int, randomize: bool = True):
        
        super().__init__()
        
        self.n_samples = n_samples
        self.sample_rate = sample_rate
        self.randomize = randomize


    def __call__(self, filename: str, duration: float, cur_sample_rate: int) -> Tuple[torch.Tensor, float, float, int, int]:
        if(duration<(float(self.n_samples)/self.sample_rate+1)):
            # print(duration,(float(self.n_samples)/self.sample_rate+1))
            chunk, _ = torchaudio.load(filename, frame_offset=0, num_frames=-1)
            t_start = 0.
            t_end = min(1.0, float(self.n_samples) / float(self.sample_rate) / duration)
            offset = 0
            # print('c1:',chunk.shape)
        else:
            offset = np.random.randint(0,int(duration*cur_sample_rate)-int(float(self.n_samples)/self.sample_rate*cur_sample_rate))
            t_start = offset / float(cur_sample_rate) / duration
            t_end = t_start + float(self.n_samples) / float(self.sample_rate) / duration
            chunk, _ = torchaudio.load(filename, frame_offset=offset, num_frames=int(float(self.n_samples)/self.sample_rate*cur_sample_rate))
            # print('offset:',offset)
            # print('c0:',chunk.shape)
        # Pad with silence if necessary.
        if(chunk.shape[0]>1):
            chunk = chunk[torch.randint(chunk.shape[0], size=(1,)),:].float()
        else:
            chunk = chunk[[0],:].float()
        if(cur_sample_rate!=self.sample_rate):
            # print('a:',cur_sample_rate,chunk.shape)
            chunk = torchaudio.functional.resample(chunk, cur_sample_rate, self.sample_rate)
            # print('b:',self.sample_rate,chunk.shape)
        if chunk.shape[-1] < self.n_samples:
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

class RVQDataset(Dataset):
    def __init__(
        self,
        manifest_path: str,
        sample_rate: float,
        normalize: bool = False,
    ):
        self.sample_rate = sample_rate
        self.datas,inds,tot,self.sizes = load_audio_by_json(manifest_path, None, None, self.sample_rate)
        self.dataset_len = len(self.datas)

        self.reader = Read_and_PadCrop_Normalized_T(n_samples=CLIPSECS*sample_rate,sample_rate = self.sample_rate)
        self.normalize = normalize
    

    def __getitem__(self, i):
        index = i
        item = None
        while item is None:
            try:
                wav = self.get_audio_by_slice(index)
                item = {"id": index, "source": wav}
            except Exception as e:
                # print(e)
                traceback.print_exc()
                print(f'skip damaged data {index}')
                index = np.random.randint(0,len(self.sizes)-1)
        return item

    def __len__(self):
        return self.dataset_len
    
    def get_audio_by_slice(self,index):
        
        wav_path = self.datas[index]['path']
        audio_info =  torchaudio.info(wav_path)
        origin_sample_rate = audio_info.sample_rate
        origin_duration = audio_info.num_frames / origin_sample_rate

        wav, *ignored = self.reader(wav_path, origin_duration,origin_sample_rate)
        wav = wav.float()
        
        wav = wav.permute(1,0)
        wav = self.postprocess(wav, self.sample_rate)
        return wav
    
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

class Preprocessor(nn.Module):
    def __init__(self, 
            codebook_dim=16,
            codebook_size=4096,
            hop_length=240,
            n_mels=128,
            stat_path=None,
            is_spec_wise=False,
            s=4,
        ) -> None:
        super().__init__()

        self.features=["melspec_2048"]
        self.s = s

        # load feature mean / std stats
        import os
        if stat_path is not None and os.path.exists(stat_path):
            with open(stat_path, "r") as f:
                self.stat = json.load(f)
        else:
            # print("No stats file found at `{}`, use default from msd.".format(stat_path))
            self.stat = {"spec_256_cnt": 14394344256, "spec_256_mean": -23.34296658431829, "spec_256_std": 26.189295587132637, "spec_512_cnt": 28677104448, "spec_512_mean": -21.31267396860235, "spec_512_std": 26.52644536245769, "spec_1024_cnt": 57242624832, "spec_1024_mean": -18.852271129208273, "spec_1024_std": 26.443154583585663, "spec_2048_cnt": 114373665600, "spec_2048_mean": -15.638743433896792, "spec_2048_std": 26.115825961611545, "spec_4096_cnt": 228635747136, "spec_4096_mean": -11.715532502794836, "spec_4096_std": 25.763972210234062, "melspec_256_cnt": 14282760192, "melspec_256_mean": -26.962600400166156, "melspec_256_std": 36.13614100912126, "melspec_512_cnt": 14282760192, "melspec_512_mean": -9.108344167718862, "melspec_512_std": 24.71910937988429, "melspec_1024_cnt": 14282760192, "melspec_1024_mean": 0.37302579246531126, "melspec_1024_std": 18.684082325919388, "melspec_2048_cnt": 14282760192, "melspec_2048_mean": 6.768444971712967, "melspec_2048_std": 18.417922652295623, "melspec_4096_cnt": 14282760192, "melspec_4096_mean": 13.617164614990036, "melspec_4096_std": 18.08552130124525, "cqt_cnt": 9373061376, "cqt_mean": 0.46341379757927165, "cqt_std": 0.9543998080910191, "mfcc_256_cnt": 1339008768, "mfcc_256_mean": -11.681755459447485, "mfcc_256_std": 29.183186444668316, "mfcc_512_cnt": 1339008768, "mfcc_512_mean": -2.540581461792183, "mfcc_512_std": 31.93752185832081, "mfcc_1024_cnt": 1339008768, "mfcc_1024_mean": 6.606636263169779, "mfcc_1024_std": 34.151644801729624, "mfcc_2048_cnt": 1339008768, "mfcc_2048_mean": 5.281600844245184, "mfcc_2048_std": 33.12784541220003, "mfcc_4096_cnt": 1339008768, "mfcc_4096_mean": 4.7616569480166095, "mfcc_4096_std": 32.61458906894133, "chromagram_256_cnt": 1339008768, "chromagram_256_mean": 55.15596556703181, "chromagram_256_std": 73.91858278719991, "chromagram_512_cnt": 1339008768, "chromagram_512_mean": 175.73092252759895, "chromagram_512_std": 248.48485148525953, "chromagram_1024_cnt": 1339008768, "chromagram_1024_mean": 589.2947481634608, "chromagram_1024_std": 913.857929063196, "chromagram_2048_cnt": 1339008768, "chromagram_2048_mean": 2062.286388327397, "chromagram_2048_std": 3458.92657915397, "chromagram_4096_cnt": 1339008768, "chromagram_4096_mean": 7673.039107997085, "chromagram_4096_std": 13009.883158267234}

        # feature extractor
        self.preprocessor_melspec_2048 = MelSTFT(
            n_fft=2048, hop_length=hop_length, is_db=True
        )

        self.is_spec_wise = is_spec_wise
        

    @torch.no_grad()
    def normalize(self, x):
        """normalize the input audio to have zero mean unit variance"""
        for key in x.keys():
            x[key] = (x[key] - self.stat["%s_mean" % key]) / self.stat["%s_std" % key] # {'melspec_2048_cnt': 14282760192, 'melspec_2048_mean': 6.768444971712967}
        return x

    @torch.no_grad()
    def rearrange(self, x):
        """rearrange the batch to flatten every 4 steps"""
        for key in x.keys():
            if key == "chromagram":
                x[key] = rearrange(x[key], "b f t -> b t f")
            else:
                x[key] = rearrange(x[key], "b f (t s) -> b t (s f)", s=self.s)
        return x
    
    @torch.no_grad()
    def preprocessing(self, x, features):
        """extract classic audio features"""
        # check precision
        if x.dtype == torch.float16:
            precision = 16
        else:
            precision = 32

        out = {}
        for key in features:
            layer = getattr(self, "preprocessor_%s" % key)
            out[key] = layer(x.float())[..., :-1]
            if precision == 16:
                out[key] = out[key].half()
        return out

    @torch.no_grad()
    def tokenize(self, x):
        out = {}
        for key in x.keys():
            layer = getattr(self, "quantizer_%s" % key)
            out[key] = layer(x[key])
        return out

    def to_spec_wise(self, x):
        Batch, Spec, Time = x.shape
        SubSpec, N_SubSpec = 16, 8
        assert SubSpec * N_SubSpec == Spec == 128
        x = rearrange(x, "b (n s) t -> b s (n t)", n=N_SubSpec, s=SubSpec)
        return x # [Batch, SubSpec=16, N_SubSpec*Time=8*100Hz]

    @torch.no_grad()
    def __call__(self, x):
        x = self.preprocessing(x, features=self.features) # -> {'melspec_2048': Tensor{Size([3, 128, 3000]) cuda:0 f32}}
        x = self.normalize(x)
        if self.is_spec_wise:
            x = {k:self.to_spec_wise(v) for k,v in x.items()}
        x = self.rearrange(x) # -> {'melspec_2048': Tensor{Size([3, 750, 512]) cuda:0 f32}}
        return x['melspec_2048'].permute((0, 2, 1))

    def to(self, device):
        self.preprocessor_melspec_2048.to(device)
        return super().to(device)



def main(config):
    train_dataset = RVQDataset(**config['train_dataset'])
    if config['valid_dataset']['manifest_path'] is None:
        # split train and valid dataset
        from torch.utils.data import random_split
        train_dataset, valid_dataset = random_split(
            train_dataset, lengths=[len(train_dataset) - 500, 500]
        )
    else:
        valid_dataset = RVQDataset(**config['valid_dataset'])
    train_dataloader = DataLoader(train_dataset, shuffle=True, batch_size=config['train']['batch_size'], drop_last=True, num_workers=config['train']['num_workers'])
    valid_dataloader = DataLoader(valid_dataset, shuffle=False, batch_size=config['train']['batch_size'], drop_last=True, num_workers=config['train']['num_workers'])
    model = ResidualVectorQuantize(**config['model'])

    device = config['train']['device']
    preprocess = config['train']['preprocess'].to(device)
    model = model.to(device)
    
    optimizer = torch.optim.Adam(model.parameters(), lr=config['train']['lr'])
    cur_updates = 0
    is_running = True
    result = {}
    from tqdm import tqdm
    from tensorboardX import SummaryWriter 
    writer = SummaryWriter()
    from collections import defaultdict
    import os
    from logging import getLogger
    logger = getLogger()
            
    while is_running:
        results = defaultdict(lambda:0)
        for item in tqdm(train_dataloader, desc='train'): 
            wavs = item['source']
            optimizer.zero_grad()
            wavs = wavs.to(device)
            x = preprocess(wavs)
            model.train()
            quantized_prompt_embeds, codes, _, commitment_loss, codebook_loss, rvq_usage = model(x)
            loss = eval(config['train']['loss'])
            loss.backward()
            optimizer.step()

            results['loss/train'] += loss.item()
            results['commitment_loss/train'] += commitment_loss.item()
            results['codebook_loss/train'] += codebook_loss.item()
            results['rvq_usage/train'] += rvq_usage.float().mean().item()

            if cur_updates % config['train']['valid_interval'] == 0:
                model.eval()
                with torch.no_grad():
                    for item in tqdm(valid_dataloader, desc='valid'): 
                        wavs = item['source']
                        wavs = wavs.to(device)
                        x = preprocess(wavs)
                        quantized_prompt_embeds, codes, _, commitment_loss, codebook_loss, rvq_usage = model(x)
                        valid_loss = eval(config['train']['loss'])
                        
                        results['loss/valid'] += valid_loss.item()
                        results['commitment_loss/valid'] += commitment_loss.item()
                        results['codebook_loss/valid'] += codebook_loss.item()
                        results['rvq_usage/valid'] += rvq_usage.float().mean().item()

                    results['cur_updates'] = cur_updates
                    results['loss/train'] /= config['train']['valid_interval'] 
                    results['commitment_loss/train'] /= config['train']['valid_interval']
                    results['codebook_loss/train'] /= config['train']['valid_interval']
                    results['rvq_usage/train'] /= config['train']['valid_interval']

                    results['loss/valid'] /= len(valid_dataloader) 
                    results['commitment_loss/valid'] /= len(valid_dataloader)
                    results['codebook_loss/valid'] /= len(valid_dataloader)
                    results['rvq_usage/valid'] /= len(valid_dataloader)

                    print('')
                    logger.info(str(results))
                    for k,v in results.items():
                        writer.add_scalar(k, v, cur_updates)
                    
                    results.clear()

            if cur_updates % config['train']['save_interval'] == 0:
                os.makedirs(f'{writer.logdir}/ckpt/', exist_ok=True)
                logger.info(f'saving checkpoint to {writer.logdir}/ckpt/RVQ_{cur_updates}.pth')
                torch.save(model.state_dict(), f'{writer.logdir}/ckpt/RVQ_{cur_updates}.pth')

            
            if cur_updates < config['train']['max_updates']:
                cur_updates += 1
            else:
                is_running = False
                break


def Music_Mel_Target_Config(args):
    config = dict(
        train_dataset = dict(
            manifest_path = args.train_path,
            sample_rate = 24000,
            normalize = False,
        ),
        valid_dataset = dict(
            manifest_path = args.valid_path,
            sample_rate = 24000,
            normalize = False,
        ),
        model = dict(
            input_dim = 128*4, 
            n_codebooks = 8, 
            codebook_size = 1024, 
            codebook_dim = 16, 
            quantizer_dropout = 0.0,
        ),
        train = dict(
            batch_size = 32,
            num_workers = 6,
            valid_interval = 10,
            save_interval = 100,
            max_updates = 500000,
            lr = 1e-4,
            device = 'cuda:0',
            loss = 'commitment_loss * 0.25 + codebook_loss * 1.0 + (x - quantized_prompt_embeds).abs().mean()',
            preprocess = Preprocessor()
        )
    )
    return config          


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--train_path', type=str, required=True, help="path to the train dataset split JSON file")
    parser.add_argument('--valid_path', type=str, required=True, help="path to the valid dataset split JSON file")
    args = parser.parse_args()
    
    config = Music_Mel_Target_Config(args)
    main(config)