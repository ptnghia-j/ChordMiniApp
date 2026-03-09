from muq import MuQ
from fairseq.dataclass import FairseqDataclass
from fairseq.models import BaseFairseqModel, register_model
from fairseq.tasks.fairseq_task import FairseqTask
    
from dataclasses import dataclass, field
from typing import List, Tuple, Optional, Dict, Any
import torch
import json

from logging import getLogger

logger = getLogger(__name__)

@dataclass
class Stat:
    melspec_2048_cnt: int = 14282760192
    melspec_2048_mean: float = 6.768444971712967
    melspec_2048_std: float = 18.417922652295623

@dataclass
class W2v2Config:
    activation_dropout: float = 0.1
    adapter_kernel_size: int = 3
    adapter_stride: int = 2
    add_adapter: bool = False
    apply_spec_augment: bool = True
    architectures: List[str] = field(default_factory=lambda: ["Wav2Vec2ConformerForCTC"])
    attention_dropout: float = 0.1
    bos_token_id: int = 1
    classifier_proj_size: int = 256
    codevector_dim: int = 768
    conformer_conv_dropout: float = 0.1
    contrastive_logits_temperature: float = 0.1
    conv_bias: bool = True
    conv_depthwise_kernel_size: int = 31
    conv_dim: List[int] = field(default_factory=lambda: [512]*7)
    conv_kernel: List[int] = field(default_factory=lambda: [10, 3, 3, 3, 3, 2, 2])
    conv_stride: List[int] = field(default_factory=lambda: [5, 2, 2, 2, 2, 2, 2])
    ctc_loss_reduction: str = "sum"
    ctc_zero_infinity: bool = False
    diversity_loss_weight: float = 0.1
    do_stable_layer_norm: bool = True
    eos_token_id: int = 2
    feat_extract_activation: str = "gelu"
    feat_extract_dropout: float = 0.0
    feat_extract_norm: str = "layer"
    feat_proj_dropout: float = 0.1
    feat_quantizer_dropout: float = 0.0
    final_dropout: float = 0.1
    gradient_checkpointing: bool = False
    hidden_act: str = "swish"
    hidden_dropout: float = 0.1
    hidden_dropout_prob: float = 0.1
    hidden_size: int = 1024
    initializer_range: float = 0.02
    intermediate_size: int = 4096
    layer_norm_eps: float = 1e-5
    layerdrop: float = 0.0
    mask_feature_length: int = 10
    mask_feature_min_masks: int = 0
    mask_feature_prob: float = 0.0
    mask_time_length: int = 10
    mask_time_min_masks: int = 2
    mask_time_prob: float = 0.05
    max_source_positions: int = 5000
    model_type: str = "wav2vec2-conformer"
    num_adapter_layers: int = 3
    num_attention_heads: int = 16
    num_codevector_groups: int = 2
    num_codevectors_per_group: int = 320
    num_conv_pos_embedding_groups: int = 16
    num_conv_pos_embeddings: int = 128
    num_feat_extract_layers: int = 7
    num_hidden_layers: int = 24
    num_negatives: int = 100
    output_hidden_size: int = 1024
    pad_token_id: int = 0
    position_embeddings_type: str = "rotary"
    proj_codevector_dim: int = 768
    rotary_embedding_base: int = 10000
    tdnn_dilation: List[int] = field(default_factory=lambda: [1, 2, 3, 1, 1])
    tdnn_dim: List[int] = field(default_factory=lambda: [512, 512, 512, 512, 1500])
    tdnn_kernel: List[int] = field(default_factory=lambda: [5, 3, 3, 1, 1])
    torch_dtype: str = "float32"
    transformers_version: str = "4.19.0.dev0"
    use_weighted_layer_sum: bool = False
    vocab_size: int = 32
    xvector_output_dim: int = 512
    
@dataclass
class MuQFairseqConfig(FairseqDataclass):
    label_rate:int = field(default=25)
    num_codebooks:int = field(default=1)
    codebook_dim:int = field(default=16)
    codebook_size:int = field(default=4096)
    features:List[str] = field(default_factory=lambda:["melspec_2048"])
    hop_length:int = field(default=240)
    n_mels:int = field(default=128)
    conv_dim:int = field(default=512)
    encoder_dim:int = field(default=1024)
    encoder_depth:int = field(default=12)
    mask_hop:float = field(default=0.4)
    mask_prob:float = field(default=0.6)
    is_flash:bool = field(default=False)
    stat:Stat = field(default_factory=Stat)
    w2v2_config:W2v2Config = field(default_factory=W2v2Config)
    use_rvq_target:bool = field(default=False)
    use_vq_target:bool = field(default=False)
    use_encodec_target:bool = field(default=False)
    rvq_ckpt_path: Optional[str] = field(default=None)
    recon_loss_ratio: Optional[float] = field(default=None)
    resume_checkpoint: Optional[str] = None
    rvq_n_codebooks:int = field(default=8)
    rvq_multi_layer_num:int = field(default=1)
    
SAMPLE_RATE = 24_000

@register_model("muq", dataclass=MuQFairseqConfig)
class MuQFairseqModel(BaseFairseqModel):
    def __init__(self, cfg: MuQFairseqConfig, task_cfg: FairseqTask):
        super().__init__()
        self.muq_config = cfg
        muq = MuQ(self.muq_config)
        self.muq = muq
        self.model = muq.model

    def forward(
        self,
        source: torch.Tensor, # B,L
        features_only: bool = False,
        label = None, # pre-extracted labeks, dim is [Batch, N_Codebook, SeqLen]
        **kwargs,
    ):
        source = source[..., :int((source.shape[-1]//(SAMPLE_RATE//self.muq_config['label_rate']))*(SAMPLE_RATE//self.muq_config['label_rate'])) ]
        if features_only:
            if 'attention_mask' in kwargs:
                attention_mask = kwargs['attention_mask']
            elif 'padding_mask' in kwargs:
                attention_mask = ~kwargs['padding_mask'].bool()
            else: 
                attention_mask = None
            _, hidden_states = self.model.get_predictions(source, attention_mask=attention_mask, is_features_only=True)
            result = {
                "layer_results": hidden_states
            }
            return result
        else:
            result = {}
            logits, hidden_emb, losses, accuracies = self.model(source, label=label)
            result["losses"] = losses
            result["accuracies"] = accuracies
            result["logits"] = logits
            result["hidden_emb"] = hidden_emb
            for k, v in losses.items():
                result[k] = v
            return result

    @classmethod
    def build_model(cls, cfg: MuQFairseqConfig, task: FairseqTask):
        """Build a new model instance."""

        model = MuQFairseqModel(cfg, task.cfg)
        import numpy as np
        s = 0
        for param in model.parameters():
            s += np.product(param.size())
        # print('# of parameters: '+str(s/1024.0/1024.0))
        
        if cfg.get("resume_checkpoint", None):
            print("Loading checkpoint from {}".format(cfg.resume_checkpoint))
            model.load_state_dict(torch.load(cfg.resume_checkpoint)['model'], strict=False)

        return model

    def get_losses(self, result, batch):
        return result['losses']