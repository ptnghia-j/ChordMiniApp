import copy
from math import sqrt
from random import choice
from pathlib import Path
from shutil import rmtree
from functools import wraps, partial

from typing_extensions import Annotated

from beartype import beartype
from beartype.door import is_bearable
from beartype.vale import Is
from beartype.typing import Union, List, Optional, Tuple, Callable, Any

import torch
from torch import nn
from torch.optim import Adam
from torch.utils.data import Dataset, DataLoader, random_split
from torch.nn.utils.rnn import pad_sequence

from lion_pytorch import Lion

from einops import rearrange

from accelerate import Accelerator, DistributedType, DistributedDataParallelKwargs

from loguru import logger

from torchaudio.transforms import Resample

import os
#surpress warnings on huggingface model cause by num_workers!=0 in dataloader
os.environ["TOKENIZERS_PARALLELISM"] = "false"
#solving nccl childFailedError
# os.environ['NCCL_DEBUG'] = 'INFO' 
os.environ['NCCL_P2P_DISABLE']='1'
os.environ['NCCL_IB_GID_INDEX']='3'

# for automatically routing data emitted from a dataset to keywords of the transformer wrappers

DATASET_FIELD_TYPE_CONFIG = dict(
    wavs = Annotated[
        torch.Tensor,
        Is[lambda t: t.dtype == torch.float and t.ndim in {2, 3}]
    ],
    raw_texts = List[str],
    texts = Annotated[
        torch.Tensor,
        Is[lambda t: t.dtype == torch.long and t.ndim == 2]
    ],
)

# helpers

def exists(val):
    return val is not None

def default(*args):
    for arg in args:
        if exists(arg):
            return arg
    return None

def noop(*args, **kwargs):
    pass

def cycle(dl):
    while True:
        for data in dl:
            yield data

def cast_tuple(t):
    return t if isinstance(t, (tuple, list)) else (t,)

def yes_or_no(question):
    return True
    #NOTE: pause using interactive input for debugging convenience
    answer = input(f'{question} (y/n) ')
    return answer.lower() in ('yes', 'y')

def accum_log(log, new_logs):
    for key, new_value in new_logs.items():
        old_value = log.get(key, 0.)
        log[key] = old_value + new_value
    return log

# auto data to module keyword argument routing functions

def has_duplicates(tup):
    counts = dict()
    for el in tup:
        if el not in counts:
            counts[el] = 0
        counts[el] += 1
    return any(filter(lambda count: count > 1, counts.values()))

def determine_types(data, config):
    output = []
    for el in data:
        for name, data_type in config.items():
            if is_bearable(el, data_type):
                output.append(name)
                break
        else:
            raise TypeError(f'unable to determine type of {data}')

    return tuple(output)

# optimizer functions

def separate_weight_decayable_params(params):
    wd_params, no_wd_params = [], []
    for param in params:
        param_list = no_wd_params if param.ndim < 2 else wd_params
        param_list.append(param)
    return wd_params, no_wd_params

# dataloader functions

def collate_one_or_multiple_tensors(fn):
    @wraps(fn)
    def inner(data):
        is_one_data = not isinstance(data[0], tuple) 

        if is_one_data:
            data = torch.stack(data)
            return (data,)

        outputs = []
        for datum in zip(*data): 
            if is_bearable(datum, Tuple[str, ...]):
                output = list(datum)
            else:
                output = fn(datum)

            outputs.append(output)

        return tuple(outputs)

    return inner

@collate_one_or_multiple_tensors
def curtail_to_shortest_collate(data):
    min_len = min(*[datum.shape[0] for datum in data])
    data = [datum[:min_len] for datum in data]
    return torch.stack(data)

@collate_one_or_multiple_tensors
def pad_to_longest_fn(data):
    return pad_sequence(data, batch_first = True)

def get_dataloader(ds, pad_to_longest = True, **kwargs):
    # collate_fn = pad_to_longest_fn if pad_to_longest else curtail_to_shortest_collate
    # return DataLoader(ds, collate_fn = collate_fn, **kwargs)
    return DataLoader(ds, **kwargs)

# semantic transformer trainer

class MuLaNTrainer(nn.Module):
    def __init__(
        self,
        config: Any,
        mulan: nn.Module,
        dataset: Dataset,
        val_dataset: Optional[Dataset] = None,
        *,
        num_train_steps = None,
        batch_size,
        data_max_length = None,
        lr = 3e-5,
        sr = 24000,
        orig_sr = 44100,
        num_workers = 0,
        grad_accum_every = 10,
        betas = (0.9, 0.99),
        max_grad_norm = 0.5,
        valid_every = 1,
        valid_frac = 0.05,
        random_split_seed = 42,
        save_model_every = 10,
        results_folder = './results',
        accelerate_kwargs: dict = dict(),
        use_lion = False,
        force_clear_prev_results = False,  # set to True | False to skip the prompt
        resume_from_checkpoint = None,
        load_optimizer_when_resume = True,
    ):
        super().__init__()
        assert batch_size > 1, 'batch size must be greater than 1 for contrastive learning (but ideally as large as possible)'

        ddp_kwargs = DistributedDataParallelKwargs(find_unused_parameters=True)
        
        self.config = config

        self.accelerator = Accelerator(**accelerate_kwargs, kwargs_handlers=[ddp_kwargs])

        self.resampler = Resample(orig_sr, sr).to(self.device)

        self.mulan = mulan

        self.register_buffer('steps', torch.Tensor([0]))

        self.num_train_steps = default(num_train_steps, float('inf')) # infinite by default
        self.batch_size = batch_size
        self.grad_accum_every = grad_accum_every

        # optimizers

        optim_klass = Lion if use_lion else Adam
        self.optim = optim_klass(filter(lambda p:p.requires_grad, mulan.parameters()), lr = lr, betas = betas)

        # max grad norm

        self.max_grad_norm = max_grad_norm

        self.data_max_length = data_max_length


        # create dataset

        self.ds = dataset
        self.ds_fields = None

        # split for validation
        if val_dataset is None:
            self.print("training with random split dataset as valid set, this can be dangerous, use with caution!")
            train_size = int((1 - valid_frac) * len(self.ds))
            valid_size = len(self.ds) - train_size
            self.ds, self.valid_ds = random_split(self.ds, [train_size, valid_size], generator = torch.Generator().manual_seed(random_split_seed))
            self.print(f'training with dataset of {len(self.ds)} samples and validating with randomly splitted {len(self.valid_ds)} samples')
        else: 
            self.print("training with fixed validation set")
            self.valid_ds = val_dataset

        # dataloader
        self.dl = get_dataloader(self.ds, batch_size = batch_size, shuffle = True, pad_to_longest = False, drop_last = True, num_workers=num_workers) 

        self.valid_dl = get_dataloader(self.valid_ds, batch_size = batch_size, shuffle = True, pad_to_longest = False, drop_last = True, num_workers=num_workers)

        # handle resume
        if resume_from_checkpoint:
            self._load(resume_from_checkpoint, load_optimizer = load_optimizer_when_resume)
            print("resume from", resume_from_checkpoint)

        def getsize(model):
            import numpy as np
            s = 0
            for param in model.parameters():
                s += np.product(param.size())
            print("[INFO] # of mulan's parameters: "+str(s/1024.0/1024.0))
        

        getsize(self.mulan)

        # prepare with accelerator

        (
            self.mulan,
            self.optim,
            self.dl,
            self.valid_dl
        ) = self.accelerator.prepare(
            self.mulan,
            self.optim,
            self.dl,
            self.valid_dl
        )

        # dataloader iterators

        self.dl_iter = cycle(self.dl) 
        self.valid_dl_iter = cycle(self.valid_dl)

        self.valid_every = valid_every
        self.save_model_every = save_model_every

        hps = dict(
            num_train_steps = num_train_steps,
            data_max_length = data_max_length,
            learning_rate = lr
        )

        self.accelerator.init_trackers("tb", config = hps)

        # results folder

        self.results_folder = Path(results_folder)

        if force_clear_prev_results is True or (not exists(force_clear_prev_results) and len([*self.results_folder.glob('**/*')]) > 0 and yes_or_no('do you want to clear previous experiment checkpoints and results?')):
            rmtree(str(self.results_folder))

        self.results_folder.mkdir(parents = True, exist_ok = True)

        # to device

        self.mulan.to(self.device)

    def save(self, path):
        state_dict =  self.accelerator.get_state_dict(self.mulan)
        pkg = dict(
            model = state_dict,
            optim = self.optim.state_dict(),
            config = self.config,
        )
        torch.save(pkg, path)

    def _load(self, path, load_optimizer = True):
        path = Path(path)
        assert path.exists()
        pkg = torch.load(str(path), map_location = 'cpu')

        mulan = self.mulan

        if 'model' in pkg:
            model_state_dict = pkg['model']
        else:
            model_state_dict = pkg 
        
        if not load_optimizer and 'contrast.temperatures' in model_state_dict:
            del model_state_dict['contrast.temperatures']
        mulan.load_state_dict(model_state_dict, strict=False)

        if load_optimizer:
            if 'base_optimizer_state' in pkg['optim']:
                optim_state = pkg['optim']['base_optimizer_state']
            else:
                optim_state = pkg['optim']
            # self.optim.load_state_dict(optim_state)
            # FIXME: There is a problem with the optimizer loading. Let's do this for the time being

    def print(self, msg):
        self.accelerator.print(msg)
        logger.info(msg)

    @property
    def device(self):
        return self.accelerator.device

    @property
    def is_distributed(self):
        return not (self.accelerator.distributed_type == DistributedType.NO and self.accelerator.num_processes == 1)

    @property
    def is_main(self):
        return self.accelerator.is_main_process

    @property
    def is_local_main(self):
        return self.accelerator.is_local_main_process

    def data_tuple_to_kwargs(self, data):

        data_kwargs = dict(
            wavs = data[0],
            raw_texts = data[1],
        )

        wavs = data_kwargs['wavs']
        wavs = self.resampler(wavs)
        data_kwargs.update(wavs = wavs[..., :self.data_max_length]) #Use fixed maximum length audio as in Mulan

        return data_kwargs

    def train_step(self):
        
        self.print(f"start steps: {self.steps.item()}")

        device = self.device

        steps = int(self.steps.item())

        self.mulan.train()

        logs = {}


        for _ in range(self.grad_accum_every):
            data_kwargs = self.data_tuple_to_kwargs(next(self.dl_iter))
            
            loss = self.mulan(**data_kwargs)

            self.accelerator.backward(loss / self.grad_accum_every )

            accum_log(logs, {'loss/train': loss.item() / self.grad_accum_every })

            del data_kwargs, loss

        if exists(self.max_grad_norm):
            self.accelerator.clip_grad_norm_(self.mulan.parameters(), self.max_grad_norm)

        self.optim.step()
        self.optim.zero_grad()

        # log

        self.print(f"{steps}: loss: {logs['loss/train']}")

        # valid
        if not (steps % self.valid_every):
            with torch.no_grad():
                # self.mulan.eval()
                for _ in range(self.grad_accum_every):
                    data_kwargs = self.data_tuple_to_kwargs(next(self.valid_dl_iter))
                    
                    loss = self.mulan(**data_kwargs)

                    accum_log(logs, {'loss/valid': loss.item() / self.grad_accum_every})

                self.print(f"{steps}: valid_loss: {logs['loss/valid']}")
        
        self.accelerator.log(logs, step = steps)

        # save model every so often
        if self.is_main and not (steps % self.save_model_every):
            model_path = str(self.results_folder / f'mulan.{steps}.pt')
            self.save(model_path)

            self.print(f'{steps}: saving model to {str(self.results_folder)}')
        #'''
        self.steps += 1
        return logs

    def train(self, log_fn: Callable = noop):

        while self.steps < self.num_train_steps:
            logs = self.train_step()
            log_fn(logs)

        self.print('training complete')
