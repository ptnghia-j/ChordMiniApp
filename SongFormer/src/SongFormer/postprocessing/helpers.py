# This file contains code adapted from the following sources:
# [MIT license] https://github.com/mir-aidj/all-in-one/blob/main/src/allin1/postprocessing/helpers.py

import numpy as np
import torch.nn.functional as F
import torch
import librosa
from typing import Union
from scipy.signal import argrelextrema
from scipy.interpolate import interp1d
from numpy.lib.stride_tricks import sliding_window_view
from numpy.typing import NDArray


def local_maxima(tensor, filter_size=41):
    assert len(tensor.shape) in (1, 2), "Input tensor should have 1 or 2 dimensions"
    assert filter_size % 2 == 1, "Filter size should be an odd number"

    original_shape = tensor.shape
    if len(original_shape) == 1:
        tensor = tensor.unsqueeze(0)

    # Pad the input array with the minimum value
    padding = filter_size // 2
    padded_arr = F.pad(tensor, (padding, padding), mode="constant", value=-torch.inf)

    # Create a rolling window view of the padded array
    rolling_view = padded_arr.unfold(1, filter_size, 1)

    # Find the indices of the local maxima
    center = filter_size // 2
    local_maxima_mask = torch.eq(
        rolling_view[:, :, center], torch.max(rolling_view, dim=-1).values
    )
    local_maxima_indices = local_maxima_mask.nonzero()

    # Initialize a new PyTorch tensor with zeros and the same shape as the input tensor
    output_arr = torch.zeros_like(tensor)

    # Set the local maxima values in the output tensor
    output_arr[local_maxima_mask] = tensor[local_maxima_mask]

    output_arr = output_arr.reshape(original_shape)

    return output_arr, local_maxima_indices


def local_maxima_numpy(arr, order=20):
    is_batch = len(arr.shape) == 2
    if is_batch:
        return np.stack([local_maxima_numpy(x, order) for x in arr])

    # Define a comparison function for argrelextrema to find local maxima
    compare_func = np.greater

    # Find the indices of the local maxima
    local_maxima_indices = argrelextrema(arr, compare_func, order=order)

    # Initialize a new numpy array with zeros and the same shape as the input array
    output_arr = np.zeros_like(arr)

    # Set the local maxima values in the output array
    output_arr[local_maxima_indices] = arr[local_maxima_indices]

    return output_arr


def peak_picking(boundary_activation, window_past=12, window_future=6):
    # Find local maxima using a sliding window
    window_size = window_past + window_future
    assert window_size % 2 == 0, "window_past + window_future must be even"
    window_size += 1

    # Pad boundary_activation
    boundary_activation_padded = np.pad(
        boundary_activation, (window_past, window_future), mode="constant"
    )
    max_filter = sliding_window_view(boundary_activation_padded, window_size)
    local_maxima = (boundary_activation == np.max(max_filter, axis=-1)) & (
        boundary_activation > 0
    )

    # Compute strength values by subtracting the mean of the past and future windows
    past_window_filter = sliding_window_view(
        boundary_activation_padded[: -(window_future + 1)], window_past
    )
    future_window_filter = sliding_window_view(
        boundary_activation_padded[window_past + 1 :], window_future
    )
    past_mean = np.mean(past_window_filter, axis=-1)
    future_mean = np.mean(future_window_filter, axis=-1)
    strength_values = boundary_activation - ((past_mean + future_mean) / 2)

    # Get boundary candidates and their corresponding strength values
    boundary_candidates = np.flatnonzero(local_maxima)
    strength_values = strength_values[boundary_candidates]

    strength_activations = np.zeros_like(boundary_activation)
    strength_activations[boundary_candidates] = strength_values

    return strength_activations
