from torch.utils.data import Dataset
from beartype.typing import Sequence, Callable, Optional, Dict, Tuple, List, Union
from beartype import beartype
from beartype.door import is_bearable
import random
import pandas as pd
import os
from torchaudio.functional import resample
import torch
import typing as tp
from pathlib import Path
import torchaudio as ta
import torch.nn.functional as F
import numpy as np
import json
import yaml
import torchaudio 
import math
import re 
from loguru import logger
import ffmpeg

class Read_and_PadCrop_Normalized_T(torch.nn.Module):
    def __init__(self, n_samples: int, sample_rate: int, randomize: bool = True):
        
        super().__init__()
        
        self.n_samples = n_samples
        self.sample_rate = sample_rate
        self.randomize = randomize

    def __call__(self, filename: str, duration: float, cur_sample_rate: int) -> Tuple[torch.Tensor, float, float, int, int]:
        if  self.n_samples < 0: #means not clip
            chunk, _ = torchaudio.load(filename, frame_offset=0, num_frames=-1)
            t_start = 0.
            t_end = 1.0
            offset = 0
        else:
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
            
        if self.n_samples > 0:
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

USE_DUMMY_AUDIO = False
if USE_DUMMY_AUDIO:
    logger.warning("USE_DUMMY_AUDIO flag is True, don't use it when train or test!")

class SafeAudioReader:
    """
       This class is an adaptor to Read_and_PadCrop_Normalized_T, make it safe to read audio data.
    """
    def __init__(self, 
                duration: float,  
                sample_rate: int,
                randomize: bool = True,
                ):
        self.n_samples = int(sample_rate * duration)
        self.reader = Read_and_PadCrop_Normalized_T(n_samples=self.n_samples, sample_rate=sample_rate, randomize=randomize)
    
    def __call__(self, 
                 filepath: os.PathLike, 
                 origin_sample_rate: Optional[int] = None,  
                 origin_duration: float = None,
                 ) -> torch.Tensor:
        if USE_DUMMY_AUDIO:
            wav = torch.zeros(self.n_samples, dtype=torch.float32)
            return wav
        try:
            if origin_sample_rate is None or origin_duration is None:
                # audio_info = torchaudio.info(filepath)
                # origin_sample_rate = audio_info.sample_rate
                # origin_duration = audio_info.num_frames / origin_sample_rate
                info = ffmpeg.probe(filepath)
                origin_duration = float(info['format']['duration'])
                origin_sample_rate = int(info['streams'][0]['sample_rate'])
            wav, *ignored = self.reader(filepath, origin_duration, origin_sample_rate)
            wav = wav.squeeze_(0)
        except Exception as e:
            logger.error(f"Error reading {filepath}: {e}")
            from traceback import print_exc
            print_exc()
            wav = torch.zeros(self.n_samples, dtype=torch.float32)
        return wav
    

class PromptTemplate:
    def __init__(self, template_text: str, tag_map: Dict[str, str], lang:str ='en'):
        self.template_text = template_text
        self.tag_map = tag_map
        self.lang = lang
    
    @property
    def tags(self):
        return tuple(self.tag_map.keys())

    def apply(self, **kwargs):
        for tag in list(kwargs.keys()):
            if kwargs[tag] == '':
                kwargs.pop(tag)
        for tag in self.tags:
            if tag in kwargs:
                kwargs[tag] = self.tag_map[tag].format(**{tag: kwargs[tag]}).strip('[]')
            else:
                kwargs[tag] = ''
        prompt = self.template_text.format(**kwargs)
        
        return self.beautify(prompt)
    
    def beautify(self, text):
        if self.lang == 'en':
            return self._beautify_en(text)
        elif self.lang == 'zh':
            return self._beautify_zh(text)
        else:
            raise ValueError(f'Unknown language {self.lang}')
        
    @staticmethod
    def _beautify_en(text):
        # no continuous commas without content between them
        text = re.sub(r'[,\s]*,[,\s]*', r', ', text)
        # no continuous whitespace
        text = re.sub(r'\s+', ' ', text)
        # the comma is NOT followed by whitespace, and should be followed by ONE whitespace
        text = re.sub(r'\s+,', r',', text)
        text = re.sub(r',\s+', r', ', text)
        # no whitespace before the full stop
        text = re.sub(r'\s+\.', r'.', text)
        # strip whitespace, comma, and replace ',.'
        text = text.strip(' ,')
        text = text.replace(',.', '.')
        return text
    
    @staticmethod
    def _beautify_zh(text):
        # no continuous commas without content between them
        text = re.sub(r'[，、\s]*，[，、\s]*', r'，', text)
        text = re.sub(r'[，、\s]*、[，、\s]*', r'、', text)
        # assume there should be NO whitespace in Chinese
        text = re.sub(r'\s+', r'', text)
        # strip whitespace, comma, and replace '，。'
        text = text.strip('， 、')
        text = text.replace('，。', '。')
        return text

    def __repr__(self):
        return f'PromptTemplate({self.template_text!r}, {self.tag_map!r})'

    __str__ = __repr__

def parse_prompt_template(prompt_template_text, lang='en'):
    span_pattern = re.compile(r'\[.*?{.+?}.*?\]', re.DOTALL)
    tag_pattern = re.compile(r'{.+?}', re.DOTALL)

    template_text = prompt_template_text.strip()
    span_texts = span_pattern.findall(prompt_template_text)
    tag_map = {} 
    for span_text in span_texts:
        tag = tag_pattern.findall(span_text)[0].strip('{}')
        tag_map[tag] = span_text
        template_text = template_text.replace(span_text, '{'+tag+'}')
    
    return PromptTemplate(template_text=template_text, tag_map=tag_map, lang=lang)

def load_prompt_templates(path, num = 5, lang='en') -> List[PromptTemplate]:
    with open(path, 'r') as f:
        lines = f.readlines()
    cnt = 0
    pts = []
    for line in lines:
        pt = parse_prompt_template(line, lang=lang)
        cnt += 1
        if len(pt.tags) < num:
            logger.error(f'Not enough tags on {path} in line {cnt}: {pt.tags}')
        pts.append(pt)

    return pts

    
def get_base_dir_file(key: os.PathLike):
    base = os.path.basename(key)
    dirname = os.path.basename(os.path.dirname(key))
    return os.path.join(dirname, base)

def read_jsonlike(path: os.PathLike):
    #json or jsonl
    if str(path).endswith(".json"):
        with open(path, 'r', encoding='utf8') as f:
            data = json.load(f)
        return data
    elif str(path).endswith(".jsonl"):
        with open(path, 'r', encoding='utf8') as f:
            data = [json.loads(line) for line in f.readlines()]
        return data
    else:
        raise ValueError("Unknown file format")

dist_prob_map = {
    1: (1.0,),
    2: (0.5, 0.5),
    3: (0.3, 0.4, 0.3),
    4: (0.2, 0.3, 0.3, 0.2),
    5: (0.2, 0.2, 0.3, 0.2, 0.1),
    6: (0.1, 0.15, 0.2, 0.2, 0.2, 0.15),
    7: (0.05, 0.1, 0.1, 0.2, 0.25, 0.2, 0.1),
    8: (0.03, 0.05, 0.1, 0.15, 0.25, 0.2, 0.1, 0.12),
    9: (0.02, 0.1, 0.1, 0.1, 0.15, 0.2, 0.15, 0.1, 0.08),
    10: (0.01, 0.1, 0.1, 0.15, 0.2, 0.15, 0.1, 0.05, 0.05, 0.09)
}

dist_prob_map_low = {
    1: (1.0,),
    2: (0.8, 0.2),
    3: (0.8, 0.1, 0.1),
    4: (0.7, 0.1, 0.1, 0.1),
    5: (0.7, 0.1, 0.1, 0.05, 0.05),
    6: (0.7, 0.1, 0.05, 0.05, 0.05, 0.05),
}

def read_translate(translate: Union[Dict[str, os.PathLike], os.PathLike, None]):
    if translate is None:
        return None 
    if isinstance(translate, str):
        return read_jsonlike(translate)
    return {k: read_jsonlike(path) for k, path in translate.items()}


def gen_plain_prompt(key_list, sep=', '):
    if len(key_list) == 0:
        return 'none'
    
    key_list = [k.strip() for k in key_list]
    
    if len(key_list) > 10:
        random.shuffle(key_list)
        key_list = key_list[:10]

    probs = dist_prob_map[len(key_list)]

    num_tags = random.choices(range(1, len(key_list)+1), probs, k=1)[0]

    random.shuffle(key_list)
    tags = key_list[:num_tags]
    tags_str = sep.join(tags)
    return tags_str    
    

def tags_to_desc(tag_list, sep=',') -> str:
    if not isinstance(tag_list, Sequence):
        return str(tag_list)
    if isinstance(tag_list, str):
        return tag_list
    if len(tag_list) <= 0:
        return ''
    elif len(tag_list) <= 5:
        probs = dist_prob_map[len(tag_list)]
        tags_num = random.choices(range(1, len(tag_list)+1), probs)[0]
        random.shuffle(tag_list)
        tag_list = tag_list[:tags_num]
        return sep.join(tag_list)
    else:
        probs = dist_prob_map[5]
        tags_num = random.choices(range(1, 6), probs)[0]
        random.shuffle(tag_list)
        tag_list = tag_list[:tags_num]
        return sep.join(tag_list)

def get_sr_and_duration_info(item):
    return item.get('sample_rate', None), item.get('duration', None)

class MtgJamendoDatasetFromJson(Dataset):
    def __init__(self, 
                data_dir:str, 
                json_path:str, 
                duration:float=10, 
                sr:int = 0, 
                lang = 'en',
                plain_rate = 0,
                return_audio = True,
                return_path = False, 
                prompt_template_path: os.PathLike = None, 
                tag_types = [],
                translate:Optional[Dict[str, os.PathLike]] = None,
                use_literal_none = True,
                ):
        self.audio_reader = SafeAudioReader(duration, sr)

        self.data_dir = data_dir
        self._load_metadata_json(json_path)   
        self.sr = sr
        self.duration = duration
        self.plain_rate = plain_rate
        self.return_audio = return_audio
        self.return_path = return_path
        self.use_literal_none = use_literal_none
        self.lang = lang
    
        self.use_dynamic_prompt = prompt_template_path is not None and plain_rate < 1.0
        if self.use_dynamic_prompt:
            self.prompt_templates = load_prompt_templates(prompt_template_path, num = len(tag_types))
        self.tag_types = tag_types

        self.translate = read_translate(translate)
    
    # These tags are considered to be weak semantics, avoiding text prompts containing only these tags
    WEAK_TAG_LIST = ["title", "artist"]

    def _load_metadata_json(self, json_path):
        with open(json_path) as fp:
            self.data = json.load(fp)
    
    def convert_key_to_path(self, key):
        return os.path.join(self.data_dir, get_base_dir_file(key))
    
    def __len__(self):
        return len(self.data)
    
    def __getitem__(self, idx):
        item = self.data[idx]
        path = self.convert_key_to_path(item['key'])
        description = self.generate_description(item)

        if self.return_audio:
            sr, duration = get_sr_and_duration_info(item)
            audio = self.audio_reader(path, sr, duration)
        else:
            audio = None

        if self.return_path:
            return audio, description, path
        return audio, description
    
    def tags_to_desc(self, tag_list, tag_type) -> str:
        if self.lang == 'en':
            return tags_to_desc(tag_list)
        elif self.lang == 'zh':
            translator = self.translate[tag_type]
            translated_tag_list = [translator[tag] for tag in tag_list if tag in translator ]
            return tags_to_desc(translated_tag_list, sep='、')
    
    def generate_description(self, item):
        if random.random() > self.plain_rate:
            # dynamically generate prompt from given prompt template
            prompt_template = random.choice(self.prompt_templates)
            description = self.generate_description_dynamic(item, prompt_template)
        else:
            # use plain prompt, i.e. tags sequence separated by comma
            description = self.generate_description_plain(item)
        return description
    
    def generate_description_dynamic(self, data, prompt_template: PromptTemplate):
        exists_tag = [key for key in data if (key in self.tag_types) and (data[key] is not None) and (len(data[key]) > 0)]
        exists_weak_tag = list(filter(lambda t: t in self.WEAK_TAG_LIST, exists_tag))
        exists_strong_tag = list(filter(lambda t: t not in self.WEAK_TAG_LIST, exists_tag))

        if len(exists_strong_tag) > 0:
            probs = dist_prob_map[len(exists_strong_tag)]
            tags_num = random.choices(range(1, len(exists_strong_tag)+1), probs)[0]
            random.shuffle(exists_strong_tag)
            tags = exists_strong_tag[:tags_num]
            weak_probs = dist_prob_map_low[len(exists_weak_tag) + 1]
            weak_tags_num = random.choices(range(0, len(exists_weak_tag) + 1), weak_probs)[0]
            random.shuffle(exists_weak_tag)
            weak_tags = exists_weak_tag[:weak_tags_num]
            tags += weak_tags
            tags_args = {tag: self.tags_to_desc(data[tag], tag) for tag in tags}
            prompt = prompt_template.apply(**tags_args)
        else: 
            # no strong tags, use all weak tags instead
            tags_args = {tag: self.tags_to_desc(data[tag], tag) for tag in exists_weak_tag}
            prompt = prompt_template.apply(**tags_args)
        
        if self.use_literal_none and len(tags_args) == 0:
            return 'none'
        
        return prompt

    def generate_description_plain(self, item):
        keywords = []
        for tag_t in self.tag_types:
            this_key = item[tag_t]
            if this_key is None: 
                continue
            if isinstance(this_key, str):
                this_key = [this_key]
            if self.lang != 'en':
                this_key = [self.get_translation(tag_t, k) for k in this_key]
            keywords += this_key
        return gen_plain_prompt(keywords, sep=self.keysep)

    def get_translation(self, tag_t, k):
        k = k.strip()
        if k in self.translate[tag_t]:
            return self.translate[tag_t][k]
        else:
            return k

    @property
    def keysep(self):
        if self.lang == 'zh':
            return '，' if random.random() > 0.5 else '、'
        elif self.lang == 'en':
            return ', '


class CombinedDataset(Dataset):
    @beartype
    def __init__(self, datasets: Sequence[Dataset], ratios: Sequence[int]):
        self.datasets = datasets
        self.datasets_index = []

        for i,dataset in enumerate(datasets):
            if dataset is None:
                continue
            for dup in range(ratios[i]):
                for j in range(len(dataset)):
                    self.datasets_index.append((i,j))
       
    def __len__(self):
        return len(self.datasets_index)

    def __getitem__(self, idx):
        index = self.datasets_index[idx]
        i,j = index
        return self.datasets[i][j]
