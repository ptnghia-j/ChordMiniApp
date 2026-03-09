import math
from typing import List, Optional, Union
from collections import OrderedDict
from functools import partial

import torch
from torch import nn, einsum

from .audio import AudioSpectrogramTransformer, AudioSpectrogramTransformerPretrained
from .text import TextTransformer, TextTransformerPretrained
from ..modules.contrastive import RankSoftmaxContrastiveLearning, SoftmaxContrastiveLearning, SigmoidContrastiveLearning, MultiLayerContrastiveLoss, interspersed_indices
from ..modules.utils import exists, default, l2norm

class MuLanModel(nn.Module):
    def __init__(
        self,
        audio_transformer: Union[AudioSpectrogramTransformer, AudioSpectrogramTransformerPretrained],
        text_transformer: Union[TextTransformer, TextTransformerPretrained],
        dim_latent = 128,                       # they use 128
        decoupled_contrastive_learning = True,  # think this was used, make it optional
        hierarchical_contrastive_loss = False,
        hierarchical_contrastive_loss_layers = None,
        sigmoid_contrastive_loss = False,
        rank_contrast = False,    # apply contrast on rank dimension
        proj_to_latent = True,
        norm_type = 'l2norm',
        **kwargs,
    ):
        super().__init__()
        self.dim_latent = dim_latent

        # audio and text transformer
        self.audio = audio_transformer
        self.text = text_transformer

        # two linear layers to project embeddings to latent space
        if proj_to_latent:
            self.text_to_latents = nn.Linear(self.text.dim, dim_latent)
            self.audio_to_latents = nn.Linear(self.audio.dim, dim_latent)

        self.sigmoid_contrastive_loss = sigmoid_contrastive_loss
        self.decoupled_contrastive_learning = decoupled_contrastive_learning
        self.rank_contrast = rank_contrast
        self.norm_type = norm_type

        # use decoupled contrastive learning or not, where self.contrast is loss module for contrastive learning
        if sigmoid_contrastive_loss:
            klass = SigmoidContrastiveLearning
        else: 
            if rank_contrast:
                klass = partial(RankSoftmaxContrastiveLearning,  decoupled_contrastive_learning = decoupled_contrastive_learning) 
            else:
                klass = partial(SoftmaxContrastiveLearning, decoupled_contrastive_learning = decoupled_contrastive_learning)

        self.contrast = klass() 

        self.multi_layer_contrastive_learning = None

        if hierarchical_contrastive_loss:
            num_layers = default(hierarchical_contrastive_loss_layers, min(audio_transformer.depth, text_transformer.depth) - 1) 
            assert num_layers > 0

            self.register_buffer('text_layers_indices', interspersed_indices(num_layers, text_transformer.depth)) 
            self.register_buffer('audio_layers_indices', interspersed_indices(num_layers, audio_transformer.depth))

            self.multi_layer_contrastive_learning = MultiLayerContrastiveLoss(
                audio_dim = self.audio.dim,
                text_dim = self.text.dim,
                dim_latent = dim_latent,
                layers = num_layers,
                decoupled_contrastive_learning = decoupled_contrastive_learning,
                sigmoid_contrastive_loss = sigmoid_contrastive_loss
            )

    def get_audio_latents(
        self,
        wavs,
        return_all_layers = False,
    ):
        audio_embeds, audio_layers = self.audio(wavs, return_all_layers = True)
        audio_latents = self.audio_to_latents(audio_embeds)
        out = self._norm_latents(audio_latents) #->[Batch, Feat=128]

        if not return_all_layers:
            return out

        return out, audio_layers #[nLayer=5, Batch=2, 15, 512]

    def get_text_latents(
        self,
        texts = None,
        raw_texts: Optional[List[str]] = None,
        return_all_layers = False
    ):
        text_embeds, text_layers = self.text(texts, raw_texts = raw_texts, return_all_layers = True)
        text_latents = self.text_to_latents(text_embeds)
        out = self._norm_latents(text_latents)

        if not return_all_layers:
            return out

        return out, text_layers
    
    def _norm_latents(self, latents):
        if self.norm_type == 'l2norm':
            return l2norm(latents)
        else:
            return self.norm(latents)

    def forward(
        self,
        wavs,
        texts = None,
        raw_texts: Optional[List[str]] = None,
        return_latents = False,
        return_similarities = False,
        return_pairwise_similarities = False,
    ):
        batch, device = wavs.shape[0], wavs.device
        
        # both latents are of [Batch, Feat=128]
        audio_latents, audio_layers = self.get_audio_latents(wavs, return_all_layers = True)
        text_latents, text_layers = self.get_text_latents(texts, raw_texts = raw_texts, return_all_layers = True)

        if return_latents: # used in inference
            return audio_latents, text_latents

        if return_similarities:
            return einsum('i d, i d -> i', audio_latents, text_latents)

        if return_pairwise_similarities:
            cosine_sim = einsum('i d, j d -> i j', audio_latents, text_latents) 
            return cosine_sim

        cl_loss = self.contrast(audio_latents, text_latents) #contrastive loss

        if not exists(self.multi_layer_contrastive_learning):
            return cl_loss

        audio_layers = audio_layers[self.audio_layers_indices]
        text_layers = text_layers[self.text_layers_indices]

        hierarchical_cl_loss = self.multi_layer_contrastive_learning(
            audio_layers = audio_layers,
            text_layers = text_layers
        )

        return cl_loss + hierarchical_cl_loss 