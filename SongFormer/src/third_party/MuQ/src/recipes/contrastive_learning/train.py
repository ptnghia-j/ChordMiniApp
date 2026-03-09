import torch
from musiclm_pytorch.trainer import MuLaNTrainer

from musiclm_pytorch.dataset import CombinedDataset, MtgJamendoDatasetFromJson
from accelerate.utils import ProjectConfiguration

import os
import sys

import random
import numpy as np
import torch

from loguru import logger
import hydra
from omegaconf import DictConfig, OmegaConf

from muq import MuQMuLan

def gen_tag():
    import time
    import random
    return "%d_%03d" % (time.time(), random.randint(0, 999))

def get_or_default(value, default):
    return value if value is not None else default

def set_random_seed(seed): 
    random.seed(seed)
    os.environ['PYTHONHASHSEED'] = str(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = True

def create_datasets_from_config(config):
    dataset_names = []
    datasets = []
    valid_datasets = []
    ratios = []

    sound_valid_datasets = []
    sound_ratios = []

    for dataset_name in config.dataset.keys():
        cfg = config.dataset[dataset_name]
        if not cfg.use:
            continue
        # print(f"Creating dataset {dataset_name}")

        deco_tag_kwargs = cfg.get('deco_tag', dict(switch_on = False))
        dataset_names.append(dataset_name)

        if dataset_name.startswith('mtg_jamendo_json'):
            mtg_dataset = MtgJamendoDatasetFromJson(
                data_dir = cfg.data_dir,
                json_path = cfg.json_path.train,
                duration= cfg.duration,
                sr = config.basics.orig_sr,
                plain_rate = cfg.get('plain_rate', 0),
                prompt_template_path= cfg.prompt,
                tag_types = cfg.tag_types,
                lang = cfg.get('lang', 'en'),
                translate = cfg.get('translate', None)
            )
            datasets.append(mtg_dataset)
            ratios.append(cfg.ratio)
            if cfg.json_path.valid is not None:
                valid_mtg_dataset = MtgJamendoDatasetFromJson(
                    data_dir = cfg.data_dir,
                    json_path = cfg.json_path.valid,
                    duration= cfg.duration,
                    sr = config.basics.orig_sr,
                    plain_rate = cfg.get('plain_rate', 0),
                    prompt_template_path = cfg.prompt,
                    tag_types = cfg.tag_types,
                    lang = cfg.get('lang', 'en'),
                    translate = cfg.get('translate', None)
                )
                valid_datasets.append(valid_mtg_dataset)
            else:
                valid_datasets.append(None)
            
            print(
                dataset_name, len(mtg_dataset), mtg_dataset[0]
            )
   
        else:
            raise ValueError("Unknown dataset type: %s" % dataset_name)

    if config.get('dataset_test', False):
        if isinstance(config.dataset_test, str):
            start_idx = int(config.dataset_test)
        else:
            start_idx = 0
        for i in range(start_idx, start_idx + 100):
            for ds_name, ds in zip(dataset_names, datasets):
                if ds is None:
                    continue
                print(f'{ds_name}: {ds[i]}')
            input('continue?')


    dataset = CombinedDataset(datasets=datasets, ratios=ratios)
    val_dataset = CombinedDataset(datasets=valid_datasets, ratios=ratios) if any(valid_datasets) else None

    print("dataset len:", len(dataset))
    print("val_datatset len:", len(val_dataset))
    
    return dataset, val_dataset


@hydra.main(config_path='config', config_name='train')
def main(config:DictConfig):   
    print(config) 
    ### read basics config
    save_dir = config.basics.get('save_dir', os.getcwd())
    os.makedirs(os.path.join(save_dir, 'tb'), exist_ok=True)
    os.makedirs(os.path.join(save_dir, 'result'), exist_ok=True)
    os.makedirs(os.path.join(save_dir, 'ckpt'), exist_ok=True)
    tag = gen_tag()
    out_fname = "output." + str(tag) + '.log'
    out_fpath = os.path.join(save_dir, 'result', out_fname)
    logger.add(out_fpath, level='INFO', format='{time} | {level} | {message}')
    logger.info("Output log saved to " + out_fpath)


    if config.basics.random_seed: 
        set_random_seed(config.basics.random_seed)

    ### read dataset config

    dataset, val_dataset = create_datasets_from_config(config)
  

    ### read model config

    mulan = MuQMuLan.create_MuLan_from_config(config.model)

    ### read training config

    trainer = MuLaNTrainer(
        config = config,
        mulan = mulan, 
        dataset = dataset, 
        val_dataset = val_dataset,
        batch_size = config.train.batch_size, 
        num_workers = config.train.num_workers, 
        num_train_steps = config.train.get('num_train_steps', None),
        lr = config.train.lr, 
        sr = config.basics.sr,
        orig_sr = config.basics.orig_sr,
        data_max_length = config.train.data_max_secs * config.basics.sr, 
        save_model_every = config.train.save_model_every,
        valid_every = config.train.valid_every,
        random_split_seed = get_or_default(config.basics.random_seed, 42),
        results_folder=os.path.join(save_dir, 'ckpt'),
        accelerate_kwargs = dict(log_with="tensorboard", project_dir=save_dir) if config.train.log_tensorboard else dict(),
        resume_from_checkpoint = config.train.resume.checkpoint_path if config.train.resume.use else None, 
        load_optimizer_when_resume = config.train.resume.get('load_optimizer', True),
        )
    
    logger.info("Ready to start training.")
    trainer.train()

if __name__ == '__main__':
    main()
