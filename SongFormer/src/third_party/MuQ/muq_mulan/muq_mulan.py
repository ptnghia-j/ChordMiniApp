from typing import List, Optional
from dataclasses import dataclass, field
import os

from torch.nn.parallel.distributed import DistributedDataParallel
import torch
import torch.nn as nn
from torch import einsum
from einops import rearrange
from huggingface_hub import PyTorchModelHubMixin
from easydict import EasyDict

from .models.mulan import MuLanModel
from .models.audio import AudioSpectrogramTransformerPretrained
from .models.text import TextTransformerPretrained
from .modules.utils import exists, frozen_params


@dataclass
class MuLanConfig:
    sr:int = field(default=24000)
    clip_secs:float = field(default=10)
    dim_latent:int = field(default=512)
    decoupled_contrastive_learning:bool = field(default=True)
    hierarchical_contrastive_loss:bool = field(default=False)
    hierarchical_contrastive_loss_layers:Optional[List] = field(default=None)
    sigmoid_contrastive_loss:bool = field(default=False)
    rank_contrast:bool = field(default=True)

@dataclass
class AudioTransformerConfig:
    dim:int = field(default=768)
    tf_depth:int = field(default=8)
    heads:int = field(default=8)
    dim_head:int = field(default=64)
    attn_dropout:float = field(default=0.)
    ff_dropout:float = field(default=0.)
    ff_mult:int = field(default=4)

@dataclass
class TextTransformerConfig:
    dim:int = field(default=768)
    tf_depth:int = field(default=8)
    max_seq_len:int = field(default=1024)
    dim_head:int = field(default=64)
    heads:int = field(default=8)
    attn_dropout:float = field(default=0.)
    ff_dropout:float = field(default=0.)
    ff_mult:int = field(default=4)

@dataclass
class ModalModelConfig:
    name:str = field(default='')
    model_dim: Optional[int] = field(default=None)
    use_layer_idx: int = field(default=-1)


@dataclass
class MuQMuLanConfig:
    mulan: MuLanConfig
    audio_model: ModalModelConfig
    text_model: ModalModelConfig
    audio_transformer: AudioTransformerConfig
    text_transformer: TextTransformerConfig

class MuQMuLan(nn.Module, PyTorchModelHubMixin):
    def __init__(self, config: MuQMuLanConfig, hf_hub_cache_dir=None):
        super().__init__()
        config = self._to_obj(config)
        self.config = config
        self.mulan = self.create_MuLan_from_config(config, hf_hub_cache_dir)
        self.sr = config.mulan.sr
        self.clip_secs = config.mulan.clip_secs
    
    def _to_obj(self, config):
        if isinstance(config, MuQMuLanConfig):
            config = EasyDict(
                mulan = config.mulan,
                audio_model = config.audio_model,
                text_model = config.text_model,
                audio_transformer = config.audio_transformer,
                text_transformer = config.text_transformer,
            )
        else:
            config = EasyDict(config)
        return config
    
    @classmethod
    def from_pretrained(cls, *args, cache_dir=None, **kwargs):
        kwargs['hf_hub_cache_dir'] = cache_dir
        return super().from_pretrained(*args, cache_dir=cache_dir, **kwargs)


    @classmethod
    def create_MuLan_from_config(cls, config:MuQMuLanConfig, hf_hub_cache_dir=None) -> MuLanModel:

        audio_transformer = AudioSpectrogramTransformerPretrained(
            model_name = config.audio_model.name, 
            model_dim = config.audio_model.model_dim,
            use_layer_idx = config.audio_model.use_layer_idx,
            **config.audio_transformer,
            frozen_pretrained = False,
            hf_hub_cache_dir = hf_hub_cache_dir,
        )
        text_transformer = TextTransformerPretrained(
            model_name = config.text_model.name, 
            model_dim = config.text_model.model_dim,
            **config.text_transformer,
            frozen_pretrained = False,
            hf_hub_cache_dir = hf_hub_cache_dir,
        )

        mulan = MuLanModel(
            audio_transformer = audio_transformer,
            text_transformer = text_transformer,
            **config.mulan
        )

        return mulan
    
    def frozen(self):
        frozen_params(self)

    @property
    def device(self):
        return next(self.parameters()).device
    
    @property
    def mulan_module(self):
        if isinstance(self.mulan, DistributedDataParallel):
            return self.mulan.module
        else:
            return self.mulan
    
    def forward(self,
        wavs: Optional[torch.Tensor] = None,
        texts: Optional[List[str]] = None,
        *,
        parallel_processing = False, 
    ) -> torch.Tensor:    
        """
        Extract audio or text features, takes audio OR texts batch as input.
        Note that if the audio is longer than 10s, it will be crop to multi cips and returns the average latent.
        The param `parallel_processing` is used to control whether to use parallel processing or not.
        If set to True, it uses parallel processing extractraction, which is faster but uses more GPU memory.
        If set to False(the default), it uses serial processing extraction, which is slower but memory-friendly.

        Args:
            wavs (Optional[torch.Tensor]): Audio waveform tensor. Defaults to None.
            texts (Optional[List[str]]): List of text strings. Defaults to None.
            parallel_processing (bool): Whether to use parallel processing. Defaults to False.

        Returns:
            torch.Tensor: Latent representation of audio or text input.

        Raises:
            AssertionError: If both wavs and texts are provided or if neither is provided.

        Note:
            - Either wavs or texts must be provided, but not both.
            - If wavs is provided, it calls extract_audio_latents method to process audio.
            - If texts is provided, it calls extract_text_latents method to process text.
        """
        assert exists(wavs) ^ exists(texts), "Please provide either wavs or texts, but not both"
        
        if exists(wavs):
            return self.extract_audio_latents(wavs = wavs, parallel_processing = parallel_processing)
        else: 
            return self.extract_text_latents(texts = texts)
    
    def calc_similarity(self, audio_latents: torch.Tensor, text_latents: torch.Tensor) -> torch.Tensor:
        """
        Calculate the dot-product similarity between audio and text latent representations.
        It supports various dimensions of input tensors (with/without batch dimension) for both audio and text.
        
        Note:
            The effect of this function is basically equivalent to the dot product.
            mulan.calc_similarity(lat_a, lat_t) <==> einsum('i d, j d -> i j', lat_a, lat_t)

        Args:
            audio_latents (torch.Tensor): Latent representation of audio.
            text_latents (torch.Tensor): Latent representation of text.

        Returns:
            torch.Tensor: Similarity scores between audio and text latent representations.

        """
        dim_a, dim_t = len(audio_latents.shape), len(text_latents.shape)
        if dim_a == 2 and dim_t == 2:
            return einsum('i d, j d -> i j', audio_latents, text_latents)
        elif dim_a == 1 and dim_t == 1:
            return torch.dot(audio_latents, text_latents)
        elif dim_a == 2 and dim_t == 1:
            return einsum('i d, d -> i', audio_latents, text_latents)
        elif dim_a == 1 and dim_t == 2:
            return einsum('d, j d -> j', audio_latents, text_latents)
        
        raise RuntimeError(f"Invalid dimensions: audio {dim_a}, text {dim_t}")
        
    
    def extract_audio_latents(self, wavs:torch.Tensor, *, parallel_processing = False) -> torch.Tensor:
        """
        Extract latent representations from audio waveforms.

        This function processes a batch of audio waveforms and extracts their latent representations.
        It supports parallel processing for faster computation but uses more GPU memory.

        Args:
            wavs (torch.Tensor): A batch of audio waveform tensors.
            parallel_processing (bool): Flag to enable parallel processing. Defaults to False.

        Returns:
            torch.Tensor: A tensor containing the latent representations of the input audio waveforms.
        """
        audio_latents = []

        def audio_to_latent(wav):
            return self.mulan_module.get_audio_latents(wav)
        for wav in wavs:
            wav_tensors = []
            if isinstance(wav, torch.Tensor):
                wav_tensors = self._get_all_clips(wav)
            else: 
                raise TypeError('wavs must be a Tensor')
            
            if parallel_processing:
                wav_tensors = wav_tensors.to(self.device)
                audio_latent = audio_to_latent(wav_tensors)
                audio_latent = audio_latent.mean(dim=0)
            else:  
                wav_tensors = rearrange(wav_tensors, "i j -> i 1 j")
                audio_latent = []
                for wav_tensor in wav_tensors:
                    audio_latent.append(audio_to_latent(wav_tensor).squeeze(0))
                    del wav_tensor
                audio_latent = torch.stack(audio_latent, dim=0)
                audio_latent = audio_latent.mean(dim=0).to(self.device)      
                
            audio_latents.append(audio_latent)
        audio_latents = torch.stack(audio_latents, dim=0)
        return audio_latents

    def extract_text_latents(self, texts: List[str]) -> torch.Tensor:
        """
        Extract latent representations from text inputs.

        This function processes a list of text strings and extracts their latent representations
        using the MuLan model's text tower.

        Args:
            texts (List[str]): A list of text strings to be processed.

        Returns:
            torch.Tensor: A tensor containing the latent representations of the input texts.
        """
        return self.mulan_module.get_text_latents(raw_texts=texts)
    
    def _get_all_clips(self, audio):
        origin_length = len(audio)
        accum_length = 0
        delta = self.sr * self.clip_secs
        audio_clips = []
        while accum_length + delta <= origin_length:
            clip = audio[accum_length:accum_length + delta]
            audio_clips.append(clip)
            accum_length += delta
        if accum_length < origin_length:
            audio_clips.append(torch.cat([audio[accum_length:], audio[0:delta - (origin_length - accum_length)]]))

        return torch.stack(audio_clips, dim=0)

