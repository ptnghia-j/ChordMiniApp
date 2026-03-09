import torch.nn as nn
import torch
from .models.muq_model import MuQModel
from dataclasses import dataclass, field
from typing import List, Optional
from transformers.modeling_outputs import BaseModelOutput
from huggingface_hub import PyTorchModelHubMixin

@dataclass
class MuQConfig:
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
    stat:Optional[dict] = field(default_factory=dict)
    w2v2_config:Optional[dict] = field(default_factory=dict)
    use_rvq_target:bool = field(default=False)
    use_vq_target:bool = field(default=False)
    use_encodec_target:bool = field(default=False)
    rvq_ckpt_path: Optional[str] = field(default=None)
    recon_loss_ratio: Optional[float] = field(default=None)
    resume_checkpoint: Optional[str] = None
    rvq_n_codebooks:int = field(default=8)
    rvq_multi_layer_num:int = field(default=1)

class MuQ(nn.Module, PyTorchModelHubMixin):
    def __init__(self, config: MuQConfig):
        super().__init__()
        if isinstance(config, dict):
            config = MuQConfig(**config)
        self.config = config
        self.model = MuQModel(
            num_codebooks=config.num_codebooks,
            codebook_dim=config.codebook_dim,
            codebook_size=config.codebook_size,
            features=config.features,
            hop_length=config.hop_length,
            n_mels=config.n_mels,
            conv_dim=config.conv_dim,
            encoder_dim=config.encoder_dim,
            encoder_depth=config.encoder_depth,
            mask_hop=config.mask_hop,
            mask_prob=config.mask_prob,
            is_flash=config.is_flash,
            stat=config.stat,
            w2v2_config=config.w2v2_config,
            use_rvq_target=config.use_rvq_target,
            use_vq_target=config.use_vq_target,
            use_encodec_target=config.use_encodec_target,
            rvq_ckpt_path=config.rvq_ckpt_path,
            recon_loss_ratio=config.recon_loss_ratio,
            label_rate=config.label_rate,
            rvq_n_codebooks=config.rvq_n_codebooks,
            rvq_multi_layer_num=config.rvq_multi_layer_num,
        )
    
    def forward(self, x, attention_mask:Optional[torch.Tensor]=None, output_hidden_states:bool=True) ->BaseModelOutput:
        """
        Forward pass through the MuQ model and extract features.

        Args:
            x (torch.Tensor): Input waveform tensor of shape (batch_size, time).
            attention_mask (torch.Tensor, optional): Mask to avoid performing attention on padding token indices.
                Default is None.
            output_hidden_states (bool, optional): Whether to return all hidden states or only the last one.
                Default is False.

        Returns:
            BaseModelOutput: An object containing the last hidden state and optionally all hidden states.
                - last_hidden_state (torch.Tensor): The last hidden state of the model, i.e. extracted MuQ features, of shape (batch_size, sequence_length, hidden_size).
                - hidden_states (tuple(torch.Tensor), optional): A tuple containing all hidden states produced by the model,
                each of shape (batch_size, sequence_length, hidden_size). Only returned if output_hidden_states is True.
        """ 
        _, hidden_states = self.model.get_predictions(x, attention_mask=attention_mask, is_features_only=True)
        last_hidden_state = hidden_states[-1]
        if not output_hidden_states:
            return BaseModelOutput(last_hidden_state=last_hidden_state)
        return BaseModelOutput(
            last_hidden_state=last_hidden_state,
            hidden_states=hidden_states
        )