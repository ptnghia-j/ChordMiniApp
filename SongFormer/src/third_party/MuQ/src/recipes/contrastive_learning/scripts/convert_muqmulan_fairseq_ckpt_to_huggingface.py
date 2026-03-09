import os
import torch
import json
import argparse
from dataclasses import dataclass

import torch
from transformers import PretrainedConfig
from omegaconf import OmegaConf

from safetensors.torch import save_file

def main(args):
    checkpoint_path = args.checkpoint_path
    save_dir = args.save_dir

    # save model and config.json
    ckpt = torch.load(checkpoint_path, map_location='cpu')
    os.makedirs(save_dir, exist_ok=True)
    torch.save(ckpt['model'], os.path.join(save_dir, 'pytorch_model.bin'))
    save_file(ckpt['model'], os.path.join(save_dir, 'model.safetensors'))
    with open(os.path.join(save_dir, 'config.json'), 'w', encoding='utf8') as w:
        config = OmegaConf.to_container(ckpt['config']['model'], resolve=True)
        json.dump(config, w, indent=2)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint_path", type=str, help="path to the fairseq checkpoint")
    parser.add_argument("--save_dir", type=str, help="path to the result directory")
    args = parser.parse_args()
    main(args)