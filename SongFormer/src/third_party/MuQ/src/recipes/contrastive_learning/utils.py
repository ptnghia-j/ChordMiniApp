from omegaconf import DictConfig
import os

def get_pretrained_config(root, name):
    if root is None:
        return name
    path = os.path.join(root, name)
    config_dir = os.path.join(path, 'snapshots')
    if os.path.exists(config_dir):
        config_files = os.listdir(config_dir)
        assert len(config_files) == 1
        config_path = os.path.join(config_dir, config_files[0])
    else:
        config_path = path
    return config_path
 
def create_CLAP_model( model_kwargs = {}, ckpt_path = None ):
    from musiclm_pytorch import SoftmaxContrastiveLearning
    import laion_clap
    
    from torch import nn
    import torch
    from torchaudio.functional import resample

    import numpy as np

    from functools import partial

    # quantization
    def int16_to_float32(x):
        return (x / 32767.0).float()

    def float32_to_int16(x):
        x = torch.clip(x, min=-1., max=1.)
        return (x * 32767.).int()

    model = laion_clap.CLAP_Module(enable_fusion=False, **model_kwargs)
    if ckpt_path is not None:
        model.load_ckpt(ckpt_path)
    else:
        model.load_ckpt()

    class CLAP_Model(nn.Module):
        def __init__(self, model, sr = 24000, decoupled_contrastive_learning = True):
            super().__init__()
            self.model = model
            self.model.eval()
            self.orig_sr = sr

            klass = partial(SoftmaxContrastiveLearning, decoupled_contrastive_learning = decoupled_contrastive_learning) 
            self.contrast = klass() 

        
        def forward(self, wavs, raw_texts):
            with torch.no_grad():
                wavs = int16_to_float32(float32_to_int16(resample(wavs, self.orig_sr, 48000)))
                audio_latents = self.model.get_audio_embedding_from_data(x = wavs, use_tensor=True).float()
                text_latents = model.get_text_embedding(raw_texts, use_tensor=True)
            cl_loss = self.contrast(audio_latents, text_latents)
            return cl_loss
    
    clap = CLAP_Model(model)
    return clap
