import math
from functools import partial

import torch.nn as nn
import torch
import torch.nn.functional as F
from einops import rearrange, reduce
from torch import einsum
import torch.distributed as dist

from .utils import exists, l2norm, log, print_once
from .distributed import AllGather
from .extend_distributed import all_gather
from .transformer import LayerNorm

def matrix_diag(t):
    device = t.device
    i, j = t.shape[-2:]
    num_diag_el = min(i, j)
    i_range = torch.arange(i, device = device)
    j_range = torch.arange(j, device = device)
    diag_mask = rearrange(i_range, 'i -> i 1') == rearrange(j_range, 'j -> 1 j')
    diag_el = t.masked_select(diag_mask)
    return rearrange(diag_el, '(b d) -> b d', d = num_diag_el)

# contrastive losses

class SoftmaxContrastiveLearning(nn.Module):
    def __init__(
        self,
        *,
        layers = 1,
        decoupled_contrastive_learning = False,
        init_temp = 10
    ):
        super().__init__()
        self.temperatures = nn.Parameter(torch.ones(layers, 1, 1) * math.log(init_temp))
        self.decoupled_contrastive_learning = decoupled_contrastive_learning

        self.all_gather = AllGather(dim = 2)

    @property
    def device(self):
        return next(self.parameters()).device
    
    def forward(self, audio_latents, text_latents):
        if audio_latents.ndim == 2:
            audio_latents = rearrange(audio_latents, '... -> 1 ...')

        if text_latents.ndim == 2:
            text_latents = rearrange(text_latents, '... -> 1 ...')

        batch = audio_latents.shape[1]

        if self.all_gather.is_distributed:
            latents = torch.stack((audio_latents, text_latents))
            latents, _ = self.all_gather(latents)
            audio_latents, text_latents = latents

        sims = einsum('l i d, l j d -> l i j', audio_latents, text_latents)

        sims = sims * self.temperatures.exp()

        cosine_sims_exp = sims.exp() # Similarity matrix  [Rank, N, N]

        numerator = matrix_diag(cosine_sims_exp) # Take diagonal elements, that is, for t [l, i, j], take all elements of i==j to obtain a array of l * min (i, j)

        if self.decoupled_contrastive_learning:
            eye = torch.eye(batch, device = self.device, dtype = torch.bool)
            cosine_sims_exp = cosine_sims_exp.masked_fill(eye, 0.) # Set the diagonal to 0

        denominator_i = reduce(cosine_sims_exp, 'l i j -> l i', 'sum')
        denominator_j = reduce(cosine_sims_exp, 'l i j -> l j', 'sum')

        contrastive_loss = -log(numerator) + 0.5 * (log(denominator_i) + log(denominator_j))

        contrastive_loss = reduce(contrastive_loss, 'l n -> l', 'mean')
        return contrastive_loss.sum()


class RankSoftmaxContrastiveLearning(nn.Module):
    def __init__(
        self,
        *,
        layers = 1,
        decoupled_contrastive_learning = False,
        init_temp = 10,
    ):
        super().__init__()
        self.temperatures = nn.Parameter(torch.ones(layers, 1, 1) * math.log(init_temp))
        self.decoupled_contrastive_learning = decoupled_contrastive_learning

    
    @property
    def device(self):
        return next(self.parameters()).device

    def forward(self, audio_latents, text_latents):
        if audio_latents.ndim == 2:
            audio_latents = rearrange(audio_latents, '... -> 1 ...')

        if text_latents.ndim == 2:
            text_latents = rearrange(text_latents, '... -> 1 ...')

        audio_latents = all_gather(audio_latents, None)
        text_latents = all_gather(text_latents, None)

        print_once("audio_latents:"+str(audio_latents.shape) + "text_latents:" + str(text_latents.shape))
        
        
        batch = audio_latents.shape[1]
        rank = audio_latents.shape[0]

        audio_latents = rearrange(audio_latents, 'l i d -> (l i) d')
        text_latents = rearrange(text_latents, 'l j d -> (l j) d')

        sims = einsum('i d, j d -> i j', audio_latents, text_latents)

        sims = sims * self.temperatures.exp()

        sims = rearrange(sims, '1 i j -> i j')

        cosine_sims_exp = sims.exp() # Similarity matrix  [Rank, N, N]


        numerator = matrix_diag(cosine_sims_exp) # Take diagonal elements, that is, for t [l, i, j], take all elements of i==j to obtain a array of l * min (i, j)

        if self.decoupled_contrastive_learning:
            eye = torch.eye(batch*rank, device = self.device, dtype = torch.bool)
            cosine_sims_exp = cosine_sims_exp.masked_fill(eye, 0.) # Set the diagonal to 0

        denominator_i = reduce(cosine_sims_exp, 'i j -> i', 'sum')
        denominator_j = reduce(cosine_sims_exp, 'i j -> j', 'sum')

        contrastive_loss = -log(numerator) + 0.5 * (log(denominator_i) + log(denominator_j))

        contrastive_loss = reduce(contrastive_loss, '1 n -> 1', 'mean')
        return contrastive_loss


class SigmoidContrastiveLearning(nn.Module):
    """ https://arxiv.org/abs/2303.15343 """

    def __init__(
        self,
        *,
        layers = 1,
        init_temp = 10,
        init_bias = -10
    ):
        super().__init__()
        self.temperatures = nn.Parameter(torch.ones(layers, 1, 1) * math.log(init_temp))
        self.bias = nn.Parameter(torch.ones(layers, 1, 1) * init_bias)

        self.all_gather = AllGather(dim = 1, all_reduce_grads = True)

    @property
    def device(self):
        return next(self.parameters()).device

    def forward(self, audio_latents, text_latents):
        device = self.device

        if audio_latents.ndim == 2:
            audio_latents = rearrange(audio_latents, '... -> 1 ...') # To [Rank, Batch, Latent]

        if text_latents.ndim == 2:
            text_latents = rearrange(text_latents, '... -> 1 ...')

        text_latents, rank_sizes = self.all_gather(text_latents)

        n = text_latents.shape[1]

        sims = einsum('l i d, l j d -> l i j', audio_latents, text_latents) # Calculate dot product similarity between pairs

        sims = sims * self.temperatures.exp() + self.bias

        labels = torch.eye(n, device = device)

        if exists(rank_sizes):
            labels_by_ranks = labels.split(rank_sizes.tolist(), dim = 0) 
            labels = labels_by_ranks[dist.get_rank()] # labels to the n elements of the current rank

        labels = 2 * rearrange(labels, 'i j -> 1 i j') - torch.ones_like(sims)

        return -F.logsigmoid(labels * sims).sum() / n




# hierarchical cl loss

def interspersed_indices(layers, total_layers):
    assert total_layers >= layers
    step = total_layers / layers
    return (torch.arange(0, layers) * step).floor().long()

class MultiLayerContrastiveLoss(nn.Module):
    def __init__(
        self,
        *,
        audio_dim,
        text_dim,
        dim_latent,
        layers,
        decoupled_contrastive_learning = False,
        sigmoid_contrastive_loss = False
    ):
        super().__init__()
        self.layers = layers

        self.audio_norm = LayerNorm(audio_dim, scale = False)
        self.audio_gamma = nn.Parameter(torch.ones(layers, 1, audio_dim))
        self.audio_latent_weight = nn.Parameter(torch.randn(layers, audio_dim, dim_latent))
        self.audio_latent_bias = nn.Parameter(torch.randn(layers, 1, dim_latent))

        self.text_norm = LayerNorm(text_dim, scale = False)
        self.text_gamma = nn.Parameter(torch.ones(layers, 1, text_dim))
        self.text_latent_weight = nn.Parameter(torch.randn(layers, text_dim, dim_latent))
        self.text_latent_bias = nn.Parameter(torch.randn(layers, 1, dim_latent))

        klass = SigmoidContrastiveLearning if sigmoid_contrastive_loss else partial(SoftmaxContrastiveLearning, decoupled_contrastive_learning = decoupled_contrastive_learning)
        self.contrast = klass(layers = layers)

    def forward(self, *, audio_layers, text_layers):
        device, batch = audio_layers.device, audio_layers.shape[1]

        audio_gap = reduce(audio_layers, 'l b n d -> l b d', 'mean')
        audio_embeds = self.audio_norm(audio_gap) * self.audio_gamma
        audio_latents = einsum('l b d, l d e -> l b e', audio_embeds, self.audio_latent_weight) + self.audio_latent_bias
        audio_latents = l2norm(audio_latents)

        text_cls_tokens = text_layers[:, :, 0]
        text_embeds = self.text_norm(text_cls_tokens) * self.text_gamma
        text_latents = einsum('l b d, l d e -> l b e', text_embeds, self.text_latent_weight) + self.text_latent_bias
        text_latents = l2norm(text_latents)

        return self.contrast(audio_latents, text_latents)
