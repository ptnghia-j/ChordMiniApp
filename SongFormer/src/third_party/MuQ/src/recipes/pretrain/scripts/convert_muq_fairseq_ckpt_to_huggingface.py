import os
import torch
import json
import argparse
from dataclasses import dataclass

import torch
import fairseq
from transformers import PretrainedConfig
from omegaconf import OmegaConf

@dataclass
class UserDirModule:
    user_dir: str

def load_model(model_dir, checkpoint_path):
    '''Load Fairseq SSL model'''

    model_path = UserDirModule(model_dir)
    fairseq.utils.import_user_module(model_path)
    
    model, cfg, task = fairseq.checkpoint_utils.load_model_ensemble_and_task([checkpoint_path], strict=False)
    model = model[0]

    return model, cfg

def main(args):
    model_dir = args.model_dir
    checkpoint_path = args.checkpoint_path
    save_dir = args.save_dir

    # save model and config.json
    model, cfg = load_model(model_dir, checkpoint_path)
    model.muq.save_pretrained(save_dir)
    with open(os.path.join(save_dir, 'config.json'), 'w', encoding='utf8') as w:
        model_cfg = OmegaConf.to_container(cfg['model'], resolve=True)
        del model_cfg['_name']
        json.dump(model_cfg, w, indent=2)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model_dir", type=str, help="path to the `MuQ/src/recipes/pretrain` working directory")
    parser.add_argument("--checkpoint_path", type=str, help="path to the fairseq checkpoint")
    parser.add_argument("--save_dir", type=str, help="path to the result directory")
    args = parser.parse_args()
    main(args)