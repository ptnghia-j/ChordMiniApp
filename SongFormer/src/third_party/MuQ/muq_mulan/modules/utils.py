from functools import wraps
import torch
from torch import nn
import torch.nn.functional as F

def exists(val):
    return val is not None

def first(it):
    return it[0]

def default(val, d):
    return val if exists(val) else d

def round_down_nearest_multiple(n, divisor):
    return n // divisor * divisor

def Sequential(*modules):
    return nn.Sequential(*filter(exists, modules))


def once(fn):
    called = False
    @wraps(fn)
    def inner(x):
        nonlocal called
        if called:
            return
        called = True
        return fn(x)
    return inner

print_once = once(print)

# tensor functions

def log(t, eps = 1e-20):
    return torch.log(t.clamp(min = eps))

def l2norm(t):
    return F.normalize(t, p = 2, dim = -1)

def frozen_params(model:nn.Module):
    for param in model.parameters():
        param.requires_grad = False