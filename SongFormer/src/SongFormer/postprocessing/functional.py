# This file contains code adapted from the following sources:
# [MIT license] https://github.com/mir-aidj/all-in-one/blob/main/src/allin1/postprocessing/functional.py

import numpy as np
import torch
from .helpers import (
    local_maxima,
    peak_picking,
    # event_frames_to_time,
)
from dataset.label2id import LABEL_TO_ID, ID_TO_LABEL
from dataset.custom_types import MsaInfo


def event_frames_to_time(frame_rates, boundary: np.array):
    boundary = np.array(boundary)
    boundary_times = boundary / frame_rates
    return boundary_times


def postprocess_functional_structure(
    logits,
    config,
):
    # pdb.set_trace()
    boundary_logits = logits["boundary_logits"]
    function_logits = logits["function_logits"]

    assert boundary_logits.shape[0] == 1 and function_logits.shape[0] == 1, (
        "Only batch size 1 is supported"
    )
    raw_prob_sections = torch.sigmoid(boundary_logits[0])
    raw_prob_functions = torch.softmax(function_logits[0].transpose(0, 1), dim=0)

    # filter_size=4 * cfg.min_hops_per_beat + 1
    prob_sections, _ = local_maxima(
        raw_prob_sections, filter_size=config.local_maxima_filter_size
    )
    prob_sections = prob_sections.cpu().numpy()

    prob_functions = raw_prob_functions.cpu().numpy()

    boundary_candidates = peak_picking(
        boundary_activation=prob_sections,
        window_past=int(12 * config.frame_rates),  # 原来是fps
        window_future=int(12 * config.frame_rates),
    )
    boundary = boundary_candidates > 0.0

    duration = len(prob_sections) / config.frame_rates
    pred_boundary_times = event_frames_to_time(
        frame_rates=config.frame_rates, boundary=np.flatnonzero(boundary)
    )
    if pred_boundary_times[0] != 0:
        pred_boundary_times = np.insert(pred_boundary_times, 0, 0)
    if pred_boundary_times[-1] != duration:
        pred_boundary_times = np.append(pred_boundary_times, duration)
    pred_boundaries = np.stack([pred_boundary_times[:-1], pred_boundary_times[1:]]).T

    pred_boundary_indices = np.flatnonzero(boundary)
    pred_boundary_indices = pred_boundary_indices[pred_boundary_indices > 0]
    prob_segment_function = np.split(prob_functions, pred_boundary_indices, axis=1)
    pred_labels = [p.mean(axis=1).argmax().item() for p in prob_segment_function]

    segments: MsaInfo = []
    for (start, end), label in zip(pred_boundaries, pred_labels):
        segment = (float(start), str(ID_TO_LABEL[label]))
        segments.append(segment)

    segments.append((float(pred_boundary_times[-1]), "end"))
    return segments
