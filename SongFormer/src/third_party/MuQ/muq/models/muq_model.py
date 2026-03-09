import json
import random
import torch
from torch import nn
from einops import rearrange
import os
from easydict import EasyDict

from ..modules.random_quantizer import RandomProjectionQuantizer
from ..modules.features import MelSTFT
from ..modules.conv import Conv2dSubsampling

class MuQModel(nn.Module):

    def __init__(
        self,
        num_codebooks=1,
        codebook_dim=16,
        codebook_size=4096,
        features=["melspec_2048"],
        hop_length=240,
        n_mels=128,
        conv_dim=512,
        encoder_dim=1024,
        encoder_depth=12,
        mask_hop=0.4,
        mask_prob=0.6,
        is_flash=False,
        stat=dict(),
        w2v2_config=dict(),
        use_rvq_target=False,
        use_vq_target=False,
        use_encodec_target=False,
        rvq_ckpt_path=None,
        recon_loss_ratio=None,
        label_rate=25,
        rvq_n_codebooks=8,
        rvq_multi_layer_num=1,
    ):
        super().__init__()

        # global variables
        self.hop_length = hop_length
        self.mask_hop = mask_hop
        self.mask_prob = mask_prob
        self.num_codebooks = num_codebooks
        self.codebook_size = codebook_size
        self.features = features
        self.recon_loss_ratio = recon_loss_ratio
        self.n_fold = int(100//label_rate)
        self.label_rate = label_rate

        # load feature mean / std stats
        self.stat = stat

        # feature extractor
        self.preprocessor_melspec_2048 = MelSTFT(
            n_fft=2048, hop_length=hop_length, is_db=True
        )

        # random quantizer
        self.use_rvq_target = use_rvq_target
        self.use_vq_target = use_vq_target
        self.use_encodec_target = use_encodec_target
        
        seed = 142
        if self.use_rvq_like_target:
            if use_rvq_target:
                from ..modules.rvq import ResidualVectorQuantize
        
                inp_dim = 128*self.n_fold
                self.rvq = ResidualVectorQuantize(
                    input_dim = inp_dim, 
                    n_codebooks = rvq_n_codebooks, 
                    codebook_size = 1024, 
                    codebook_dim = 16, 
                    quantizer_dropout = 0.0,
                    use_multi_layer_num = rvq_multi_layer_num,
                    )
            elif use_vq_target:
                from ..modules.rvq import VectorQuantize
                
                self.rvq = VectorQuantize(
                    input_dim = 128*self.n_fold,
                    codebook_size = 1024,
                    codebook_dim = 8,
                    stale_tolerance = 1000,
                    mfcc_clustering = False
                )
            elif use_encodec_target:
                from encodec import EncodecModel
                self.rvq = EncodecModel.encodec_model_24khz()
                self.rvq.set_target_bandwidth(6.0)
                for param in self.rvq.parameters():
                    param.requires_grad = False
                
            if rvq_ckpt_path is not None and os.path.exists(rvq_ckpt_path):
                state_dict = torch.load(rvq_ckpt_path, map_location="cpu")
                self.rvq.load_state_dict(state_dict)
            else:
                pass
                # print(f'Checkpoint for rvq `{rvq_ckpt_path}` not found. Using random initialization.')
        else:
            for feature in self.features:
                for i in range(num_codebooks):
                    setattr(
                        self,
                        f"quantizer_{feature}", # _{i}
                        RandomProjectionQuantizer(
                            n_mels * self.n_fold, codebook_dim, codebook_size, seed=seed + i
                        ),
                    )

        # two residual convolution layers + one projection layer
        strides_factory = {
            4: [2, 2],
            2: [2, 1]
        }
        self.conv = Conv2dSubsampling(
            1, conv_dim, encoder_dim, strides=strides_factory.get(self.n_fold), n_bands=n_mels
        )

        # Conformer
        if is_flash:
            from modules.flash_conformer import (
                Wav2Vec2ConformerEncoder,
                Wav2Vec2ConformerConfig,
            )
        else:
            from transformers.models.wav2vec2_conformer.modeling_wav2vec2_conformer import (
                Wav2Vec2ConformerEncoder,
                Wav2Vec2ConformerConfig,
            )
        config = EasyDict(w2v2_config)
        config.num_hidden_layers = encoder_depth
        config.hidden_size = encoder_dim

        self.conformer = Wav2Vec2ConformerEncoder(config)

        self.linear = nn.Linear(encoder_dim, codebook_size) # projection layer

        # reconstruct melspec
        if self.recon_loss_ratio is not None and self.recon_loss_ratio > 0:
            self.recon_proj = nn.Linear(encoder_dim, n_mels * self.n_fold)
            self.recon_loss = nn.MSELoss()

        # loss function
        self.loss = nn.CrossEntropyLoss()

        # cls token (used for sequence classification)
        random.seed(seed)
        self.cls_token = nn.Parameter(torch.randn(encoder_dim))


    @property
    def use_rvq_like_target(self):
        return self.use_rvq_target or self.use_vq_target or self.use_encodec_target

    def masking(self, x, attention_mask=None):
        """random masking of 400ms with given probability"""
        mx = x.clone()
        b, t = mx.shape
        len_masking_raw = int(24000 * self.mask_hop) 
        len_masking_token = int(24000 / self.hop_length / 2 / 2 * self.mask_hop) 

        # get random mask indices
        start_indices = torch.rand(b, t // len_masking_raw) < self.mask_prob
        time_domain_masked_indices = torch.nonzero(
            start_indices.repeat_interleave(len_masking_raw, dim=1) 
        )
        token_domain_masked_indices = torch.nonzero(
            start_indices.repeat_interleave(len_masking_token, dim=1)
        )

        # mask with random values
        masking_noise = (
            torch.randn(time_domain_masked_indices.shape[0], dtype=x.dtype) * 0.1
        )  # 0 mean 0.1 std
        mx[tuple(time_domain_masked_indices.t())] = masking_noise.to(x.device)

        return mx, token_domain_masked_indices


    @torch.no_grad()
    def preprocessing(self, x, features):
        """extract classic audio features"""
        # check precision
        if x.dtype == torch.float16 or x.dtype == torch.bfloat16:
            precision = 16
        else:
            precision = 32

        out = {}
        for key in features:
            layer = getattr(self, "preprocessor_%s" % key)
            layer.to(x.device)
            dtype = x.dtype
            out[key] = layer(x.float())[..., :-1]
            if precision == 16:
                out[key] = out[key].half()
            if out[key].dtype != dtype:
                out[key].to(dtype=dtype)
        return out

    def encoder(self, x, *, attention_mask=None, is_features_only=False):
        """2-layer conv + w2v-conformer"""
        x = self.conv(x)
        mask_indices = None
        if attention_mask is None:
            out = self.conformer(x, output_hidden_states=True)
        else:
            attention_mask = attention_mask.bool()
            skip_n = int(attention_mask.size(-1) / x.size(1))
            attention_mask = attention_mask[:, ::skip_n]
            attention_mask = attention_mask[:, :x.size(1)]
            out = self.conformer(x, attention_mask=attention_mask, output_hidden_states=True)
        hidden_emb = out["hidden_states"]
        last_emb = out["last_hidden_state"]
        logits = self.linear(last_emb)
        interval = self.codebook_size
        logits = {
            key: logits[:, :, i * interval : (i + 1) * interval]
            for i, key in enumerate(self.features)
        }
        return logits, hidden_emb, mask_indices

    @torch.no_grad()
    def normalize(self, x):
        """normalize the input audio to have zero mean unit variance"""
        for key in x.keys():
            x[key] = (x[key] - self.stat["%s_mean" % key]) / self.stat["%s_std" % key]
        return x

    @torch.no_grad()
    def rearrange(self, x):
        """rearrange the batch to flatten every 4 steps"""
        for key in x.keys():
            if key == "chromagram":
                x[key] = rearrange(x[key], "b f t -> b t f")
            else:
                x[key] = rearrange(x[key], "b f (t s) -> b t (s f)", s=self.n_fold)
        return x

    def get_rvq_codes(self, inp, raw_wav):
        if self.use_rvq_target:
            quantized_prompt_embeds, codes, _, commitment_loss, codebook_loss, rvq_usage = self.rvq(inp)
            return codes
        if self.use_vq_target:
            quantized_prompt_embeds, commitment_loss, codebook_loss, codes, _ = self.rvq(inp)
            return codes.unsqueeze(1)
        if self.use_encodec_target:
            encoded_frames = self.rvq.encode(raw_wav.unsqueeze(1)) #list, B,[ 8,T ]
            codes = torch.cat([encoded[0].detach() for encoded in encoded_frames], dim=-1)
            if self.label_rate == 25:
                codes = codes[:, :, ::3]
            return codes

    @torch.no_grad()
    def tokenize(self, x, raw_wav):
        out = {}
        for key in x.keys():
            if self.use_rvq_like_target:
                self.rvq.eval()
                inp = x[key].permute((0, 2, 1))
                codes = self.get_rvq_codes(inp, raw_wav)
                out[key] = torch.cat([codes[:, idx, ...] for idx in range(int(self.codebook_size//1024))], dim=-1)
            else:
                layer = getattr(self, "quantizer_%s" % key)
                out[key] = layer(x[key])
        return out

    def get_targets(self, x, label=None):
        if self.use_encodec_target:
            raw_x = x.clone()
        else:
            raw_x = None
        x = self.preprocessing(x, features=self.features)
        x = self.normalize(x)
        x = self.rearrange(x) 
        melspec = x['melspec_2048']
        if label is None:
            # Use labels from Mel-RVQ
            target_tokens = self.tokenize(x, raw_x) 
        else:
            # Use labels pre-extracted for iteration training
            target_tokens = {'melspec_2048': rearrange(label, "b n s -> b (n s)").long()}
        return target_tokens, melspec

    def get_predictions(self, x, *, mask=None, attention_mask=None, return_new_mask=False, is_features_only=False):
        # preprocessing
        x = self.preprocessing(x, features=["melspec_2048"])
        x = self.normalize(x)

        # encoding
        logits, hidden_emb, new_mask = self.encoder(x["melspec_2048"], attention_mask=attention_mask, is_features_only=is_features_only)

        if return_new_mask:
            return logits, hidden_emb, mask if new_mask is None else new_mask
        else:
            return logits, hidden_emb

    def get_latent(self, x, layer_ix=12):
        _, hidden_states = self.get_predictions(x)
        emb = hidden_states[layer_ix]
        return emb

    def compute_nce(self, x, pos, negs):
        neg_is_pos = (pos == negs).all(-1)
        pos = pos.unsqueeze(0)
        targets = torch.cat([pos, negs], dim=0)

        logits = torch.cosine_similarity(x.float(), targets.float(), dim=-1).type_as(x)
        logits /= 0.1
        if neg_is_pos.any():
            logits[1:][neg_is_pos] = float("-inf")
        logits = logits.transpose(0, 1)
        return logits
    
    def get_loss(self, logits, target_tokens, masked_indices):
        losses = {}
        accuracies = {}
        for key in logits.keys():
            if not self.use_rvq_like_target:
                masked_logits = logits[key][tuple(masked_indices.t())]
                masked_tokens = target_tokens[key][tuple(masked_indices.t())]
            else:
                Batch, SeqLen, N_Codebook_x_CodebookSize = logits[key].shape
                Batch, N_Codebook_x_SeqLen = target_tokens[key].shape 
                N_Codebook = int(N_Codebook_x_SeqLen // SeqLen)
                target_tokens[key] = rearrange(target_tokens[key], "b (n s) -> b s n", n=N_Codebook) # Batch, SeqLen=750, N_Codebook=4
                masked_logits = logits[key][tuple(masked_indices.t())] 
                masked_tokens = target_tokens[key][tuple(masked_indices.t())] 
                masked_logits = rearrange(masked_logits, "b (n c) -> (b n) c", n=N_Codebook)
                masked_tokens = rearrange(masked_tokens, "b n -> (b n)", n=N_Codebook) 

            losses[key] = self.loss(masked_logits, masked_tokens)
            accuracies[key] = (
                torch.sum(masked_logits.argmax(-1) == masked_tokens)
                / masked_tokens.numel()
            )
        return losses, accuracies

    def get_recon_loss(self, last_hidden_emb, melspec, masked_indices):
        pred_melspec = self.recon_proj(last_hidden_emb[tuple(masked_indices.t())])
        target_melspec = melspec[tuple(masked_indices.t())]
        recon_loss = self.recon_loss(pred_melspec, target_melspec)
        return recon_loss

    def forward(self, x, attention_mask=None, label=None):
        dtype = x.dtype
        # get target feature tokens
        target_tokens, melspec = self.get_targets(x, label=label) 

        # masking
        x, masked_indices = self.masking(x, attention_mask=attention_mask) 

        # forward
        logits, hidden_emb, masked_indices = self.get_predictions(x, mask=masked_indices, attention_mask=attention_mask, return_new_mask=True) 

        # get loss
        losses, accuracies = self.get_loss(logits, target_tokens, masked_indices)

        if self.recon_loss_ratio:
            losses["recon_loss"] = self.get_recon_loss(hidden_emb[-1], melspec, masked_indices) * self.recon_loss_ratio

        return logits, hidden_emb, losses, accuracies
