import torch
import torch.nn as nn
import numpy as np
import torch.nn.functional as F
from dataset.custom_types import MsaInfo
from postprocessing.functional import postprocess_functional_structure
from x_transformers import Encoder
import bisect


class Head(nn.Module):
    def __init__(self, input_dim, output_dim, hidden_dims=None, activation="silu"):
        super().__init__()
        hidden_dims = hidden_dims or []
        act_layers = {"relu": nn.ReLU, "silu": nn.SiLU, "gelu": nn.GELU}
        act_layer = act_layers.get(activation.lower())
        if not act_layer:
            raise ValueError(f"Unsupported activation: {activation}")

        dims = [input_dim] + hidden_dims + [output_dim]
        layers = []
        for i in range(len(dims) - 1):
            layers.append(nn.Linear(dims[i], dims[i + 1]))
            if i < len(dims) - 2:
                layers.append(act_layer())
        self.net = nn.Sequential(*layers)

    def reset_parameters(self, confidence):
        bias_value = -torch.log(torch.tensor((1 - confidence) / confidence))
        self.net[-1].bias.data.fill_(bias_value.item())

    def forward(self, x):
        batch, T, C = x.shape
        x = x.reshape(-1, C)
        x = self.net(x)
        return x.reshape(batch, T, -1)


class WrapedTransformerEncoder(nn.Module):
    def __init__(
        self, input_dim, transformer_input_dim, num_layers=1, nhead=8, dropout=0.1
    ):
        super().__init__()
        self.input_dim = input_dim
        self.transformer_input_dim = transformer_input_dim

        if input_dim != transformer_input_dim:
            self.input_proj = nn.Sequential(
                nn.Linear(input_dim, transformer_input_dim),
                nn.LayerNorm(transformer_input_dim),
                nn.GELU(),
                nn.Dropout(dropout * 0.5),
                nn.Linear(transformer_input_dim, transformer_input_dim),
            )
        else:
            self.input_proj = nn.Identity()

        self.transformer = Encoder(
            dim=transformer_input_dim,
            depth=num_layers,
            heads=nhead,
            layer_dropout=dropout,
            attn_dropout=dropout,
            ff_dropout=dropout,
            attn_flash=True,
            rotary_pos_emb=True,
        )

    def forward(self, x, src_key_padding_mask=None):
        """
        The input src_key_padding_mask is a B x T boolean mask, where True indicates masked positions.
        However, in x-transformers, False indicates masked positions.
        Therefore, it needs to be converted so that False represents masked positions.
        """
        x = self.input_proj(x)
        mask = (
            ~torch.tensor(src_key_padding_mask, dtype=torch.bool, device=x.device)
            if src_key_padding_mask is not None
            else None
        )
        return self.transformer(x, mask=mask)


def prefix_dict(d, prefix: str):
    if prefix:
        return d
    return {prefix + key: value for key, value in d.items()}


class TimeDownsample(nn.Module):
    def __init__(
        self, dim_in, dim_out=None, kernel_size=5, stride=5, padding=0, dropout=0.1
    ):
        super().__init__()
        self.dim_out = dim_out or dim_in
        assert self.dim_out % 2 == 0

        self.depthwise_conv = nn.Conv1d(
            in_channels=dim_in,
            out_channels=dim_in,
            kernel_size=kernel_size,
            stride=stride,
            padding=padding,
            groups=dim_in,
            bias=False,
        )
        self.pointwise_conv = nn.Conv1d(
            in_channels=dim_in,
            out_channels=self.dim_out,
            kernel_size=1,
            bias=False,
        )
        self.pool = nn.AvgPool1d(kernel_size, stride, padding=padding)
        self.norm1 = nn.LayerNorm(self.dim_out)
        self.act1 = nn.GELU()
        self.dropout1 = nn.Dropout(dropout)

        if dim_in != self.dim_out:
            self.residual_conv = nn.Conv1d(
                dim_in, self.dim_out, kernel_size=1, bias=False
            )
        else:
            self.residual_conv = None

    def forward(self, x):
        residual = x  # [B, T, D_in]
        # Convolutional module
        x_c = x.transpose(1, 2)  # [B, D_in, T]
        x_c = self.depthwise_conv(x_c)  # [B, D_in, T_down]
        x_c = self.pointwise_conv(x_c)  # [B, D_out, T_down]

        # Residual module
        res = self.pool(residual.transpose(1, 2))  # [B, D_in, T]
        if self.residual_conv:
            res = self.residual_conv(res)  # [B, D_out, T_down]
        x_c = x_c + res  # [B, D_out, T_down]
        x_c = x_c.transpose(1, 2)  # [B, T_down, D_out]
        x_c = self.norm1(x_c)
        x_c = self.act1(x_c)
        x_c = self.dropout1(x_c)
        return x_c


class AddFuse(nn.Module):
    def __init__(self):
        super(AddFuse, self).__init__()

    def forward(self, x, cond):
        return x + cond


class TVLoss1D(nn.Module):
    def __init__(
        self, beta=1.0, lambda_tv=0.4, boundary_threshold=0.01, reduction_weight=0.1
    ):
        """
        Args:
            beta: Exponential parameter for TV loss (recommended 0.5~1.0)
            lambda_tv: Overall weight for TV loss
            boundary_threshold: Label threshold to determine if a region is a "boundary area" (e.g., 0.01)
            reduction_weight: Scaling factor for TV penalty within boundary regions (e.g., 0.1, meaning only 10% penalty)
        """
        super().__init__()
        self.beta = beta
        self.lambda_tv = lambda_tv
        self.boundary_threshold = boundary_threshold
        self.reduction_weight = reduction_weight

    def forward(self, pred, target=None):
        """
        Args:
            pred: (B, T) or (B, T, 1), float boundary scores output by the model
            target: (B, T) or (B, T, 1), ground truth labels (optional, used for spatial weighting if provided)

        Returns:
            scalar: weighted TV loss
        """
        if pred.dim() == 3:
            pred = pred.squeeze(-1)
        if target is not None and target.dim() == 3:
            target = target.squeeze(-1)

        diff = pred[:, 1:] - pred[:, :-1]
        tv_base = torch.pow(torch.abs(diff) + 1e-8, self.beta)

        if target is None:
            return self.lambda_tv * tv_base.mean()

        left_in_boundary = target[:, :-1] > self.boundary_threshold
        right_in_boundary = target[:, 1:] > self.boundary_threshold
        near_boundary = left_in_boundary | right_in_boundary
        weight_mask = torch.where(
            near_boundary,
            self.reduction_weight * torch.ones_like(tv_base),
            torch.ones_like(tv_base),
        )
        tv_weighted = (tv_base * weight_mask).mean()
        return self.lambda_tv * tv_weighted


class SoftmaxFocalLoss(nn.Module):
    """
    Softmax Focal Loss for single-label multi-class classification.
    Suitable for mutually exclusive classes.
    """

    def __init__(self, alpha: float = 0.25, gamma: float = 2.0):
        super().__init__()
        self.alpha = alpha
        self.gamma = gamma

    def forward(self, pred: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        """
        Args:
            pred: [B, T, C], raw logits
            targets: [B, T, C] (soft) or [B, T] (hard, dtype=long)
        Returns:
            loss: scalar or [B, T] depending on reduction
        """
        log_probs = F.log_softmax(pred, dim=-1)
        probs = torch.exp(log_probs)

        if targets.dtype == torch.long:
            targets_onehot = F.one_hot(targets, num_classes=pred.size(-1)).float()
        else:
            targets_onehot = targets

        p_t = (probs * targets_onehot).sum(dim=-1)
        p_t = p_t.clamp(min=1e-8, max=1.0 - 1e-8)

        if self.alpha > 0:
            alpha_t = self.alpha * targets_onehot + (1 - self.alpha) * (
                1 - targets_onehot
            )
            alpha_weight = (alpha_t * targets_onehot).sum(dim=-1)
        else:
            alpha_weight = 1.0

        focal_weight = (1 - p_t) ** self.gamma
        ce_loss = -log_probs * targets_onehot
        ce_loss = ce_loss.sum(dim=-1)

        loss = alpha_weight * focal_weight * ce_loss
        return loss


class Model(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.config = config

        self.input_norm = nn.LayerNorm(config.input_dim)
        self.mixed_win_downsample = nn.Linear(config.input_dim_raw, config.input_dim)
        self.dataset_class_prefix = nn.Embedding(
            num_embeddings=config.num_dataset_classes,
            embedding_dim=config.transformer_encoder_input_dim,
        )
        self.down_sample_conv = TimeDownsample(
            dim_in=config.input_dim,
            dim_out=config.transformer_encoder_input_dim,
            kernel_size=config.down_sample_conv_kernel_size,
            stride=config.down_sample_conv_stride,
            dropout=config.down_sample_conv_dropout,
            padding=config.down_sample_conv_padding,
        )
        self.AddFuse = AddFuse()
        self.transformer = WrapedTransformerEncoder(
            input_dim=config.transformer_encoder_input_dim,
            transformer_input_dim=config.transformer_input_dim,
            num_layers=config.num_transformer_layers,
            nhead=config.transformer_nhead,
            dropout=config.transformer_dropout,
        )
        self.boundary_TVLoss1D = TVLoss1D(
            beta=config.boundary_tv_loss_beta,
            lambda_tv=config.boundary_tv_loss_lambda,
            boundary_threshold=config.boundary_tv_loss_boundary_threshold,
            reduction_weight=config.boundary_tv_loss_reduction_weight,
        )
        self.label_focal_loss = SoftmaxFocalLoss(
            alpha=config.label_focal_loss_alpha, gamma=config.label_focal_loss_gamma
        )
        self.boundary_head = Head(config.transformer_input_dim, 1)
        self.function_head = Head(config.transformer_input_dim, config.num_classes)

    def cal_metrics(self, gt_info: MsaInfo, msa_info: MsaInfo):
        from msaf.eval import compute_results

        assert gt_info[-1][1] == "end" and msa_info[-1][1] == "end", (
            "gt_info and msa_info should end with 'end'"
        )
        gt_info_labels = [label for time_, label in gt_info][:-1]
        gt_info_inters = [time_ for time_, label in gt_info]
        gt_info_inters = np.column_stack(
            [np.array(gt_info_inters[:-1]), np.array(gt_info_inters[1:])]
        )

        msa_info_labels = [label for time_, label in msa_info][:-1]
        msa_info_inters = [time_ for time_, label in msa_info]
        msa_info_inters = np.column_stack(
            [np.array(msa_info_inters[:-1]), np.array(msa_info_inters[1:])]
        )
        result = compute_results(
            ann_inter=gt_info_inters,
            est_inter=msa_info_inters,
            ann_labels=gt_info_labels,
            est_labels=msa_info_labels,
            bins=11,
            est_file="test.txt",
            weight=0.58,
        )
        return result

    def cal_acc(
        self, ann_info: MsaInfo | str, est_info: MsaInfo | str, post_digit: int = 3
    ):
        ann_info_time = [
            int(round(time_, post_digit) * (10**post_digit))
            for time_, label in ann_info
        ]
        est_info_time = [
            int(round(time_, post_digit) * (10**post_digit))
            for time_, label in est_info
        ]

        common_start_time = max(ann_info_time[0], est_info_time[0])
        common_end_time = min(ann_info_time[-1], est_info_time[-1])

        time_points = {common_start_time, common_end_time}
        time_points.update(
            {
                time_
                for time_ in ann_info_time
                if common_start_time <= time_ <= common_end_time
            }
        )
        time_points.update(
            {
                time_
                for time_ in est_info_time
                if common_start_time <= time_ <= common_end_time
            }
        )

        time_points = sorted(time_points)
        total_duration, total_score = 0, 0

        for idx in range(len(time_points) - 1):
            duration = time_points[idx + 1] - time_points[idx]
            ann_label = ann_info[
                bisect.bisect_right(ann_info_time, time_points[idx]) - 1
            ][1]
            est_label = est_info[
                bisect.bisect_right(est_info_time, time_points[idx]) - 1
            ][1]
            total_duration += duration
            if ann_label == est_label:
                total_score += duration
        return total_score / total_duration

    def infer_with_metrics(self, batch, prefix: str = None):
        with torch.no_grad():
            logits = self.forward_func(batch)

            losses = self.compute_losses(logits, batch, prefix=None)

            expanded_mask = batch["label_id_masks"].expand(
                -1, logits["function_logits"].size(1), -1
            )
            logits["function_logits"] = logits["function_logits"].masked_fill(
                expanded_mask, -float("inf")
            )

            msa_info = postprocess_functional_structure(
                logits=logits, config=self.config
            )
            gt_info = batch["msa_infos"][0]
            results = self.cal_metrics(gt_info=gt_info, msa_info=msa_info)

        ret_results = {
            "loss": losses["loss"].item(),
            "HitRate_3P": results["HitRate_3P"],
            "HitRate_3R": results["HitRate_3R"],
            "HitRate_3F": results["HitRate_3F"],
            "HitRate_0.5P": results["HitRate_0.5P"],
            "HitRate_0.5R": results["HitRate_0.5R"],
            "HitRate_0.5F": results["HitRate_0.5F"],
            "PWF": results["PWF"],
            "PWP": results["PWP"],
            "PWR": results["PWR"],
            "Sf": results["Sf"],
            "So": results["So"],
            "Su": results["Su"],
            "acc": self.cal_acc(ann_info=gt_info, est_info=msa_info),
        }
        if prefix:
            ret_results = prefix_dict(ret_results, prefix)

        return ret_results

    def infer(
        self,
        input_embeddings,
        dataset_ids,
        label_id_masks,
        prefix: str = None,
        with_logits=False,
    ):
        with torch.no_grad():
            input_embeddings = self.mixed_win_downsample(input_embeddings)
            input_embeddings = self.input_norm(input_embeddings)
            logits = self.down_sample_conv(input_embeddings)

            dataset_prefix = self.dataset_class_prefix(dataset_ids)
            dataset_prefix_expand = dataset_prefix.unsqueeze(1).expand(
                logits.size(0), 1, -1
            )
            logits = self.AddFuse(x=logits, cond=dataset_prefix_expand)
            logits = self.transformer(x=logits, src_key_padding_mask=None)

            function_logits = self.function_head(logits)
            boundary_logits = self.boundary_head(logits).squeeze(-1)

            logits = {
                "function_logits": function_logits,
                "boundary_logits": boundary_logits,
            }

            expanded_mask = label_id_masks.expand(
                -1, logits["function_logits"].size(1), -1
            )
            logits["function_logits"] = logits["function_logits"].masked_fill(
                expanded_mask, -float("inf")
            )

            msa_info = postprocess_functional_structure(
                logits=logits, config=self.config
            )

        return (msa_info, logits) if with_logits else msa_info

    def compute_losses(self, outputs, batch, prefix: str = None):
        loss = 0.0
        losses = {}

        loss_section = F.binary_cross_entropy_with_logits(
            outputs["boundary_logits"],
            batch["widen_true_boundaries"],
            reduction="none",
        )
        loss_section += self.config.boundary_tvloss_weight * self.boundary_TVLoss1D(
            pred=outputs["boundary_logits"],
            target=batch["widen_true_boundaries"],
        )
        loss_function = F.cross_entropy(
            outputs["function_logits"].transpose(1, 2),
            batch["true_functions"].transpose(1, 2),
            reduction="none",
        )
        # input is [B, T, C]
        ttt = self.config.label_focal_loss_weight * self.label_focal_loss(
            pred=outputs["function_logits"], targets=batch["true_functions"]
        )
        loss_function += ttt

        float_masks = (~batch["masks"]).float()
        boundary_mask = batch.get("boundary_mask", None)
        function_mask = batch.get("function_mask", None)
        if boundary_mask is not None:
            boundary_mask = (~boundary_mask).float()
        else:
            boundary_mask = 1

        if function_mask is not None:
            function_mask = (~function_mask).float()
        else:
            function_mask = 1

        loss_section = torch.mean(boundary_mask * float_masks * loss_section)
        loss_function = torch.mean(function_mask * float_masks * loss_function)

        loss_section *= self.config.loss_weight_section
        loss_function *= self.config.loss_weight_function

        if self.config.learn_label:
            loss += loss_function
        if self.config.learn_segment:
            loss += loss_section

        losses.update(
            loss=loss,
            loss_section=loss_section,
            loss_function=loss_function,
        )
        if prefix:
            losses = prefix_dict(losses, prefix)
        return losses

    def forward_func(self, batch):
        input_embeddings = batch["input_embeddings"]
        input_embeddings = self.mixed_win_downsample(input_embeddings)
        input_embeddings = self.input_norm(input_embeddings)
        logits = self.down_sample_conv(input_embeddings)

        dataset_prefix = self.dataset_class_prefix(batch["dataset_ids"])
        logits = self.AddFuse(x=logits, cond=dataset_prefix.unsqueeze(1))
        src_key_padding_mask = batch["masks"]
        logits = self.transformer(x=logits, src_key_padding_mask=src_key_padding_mask)

        function_logits = self.function_head(logits)
        boundary_logits = self.boundary_head(logits).squeeze(-1)

        logits = {
            "function_logits": function_logits,
            "boundary_logits": boundary_logits,
        }
        return logits

    def forward(self, batch):
        logits = self.forward_func(batch)
        losses = self.compute_losses(logits, batch, prefix=None)
        return logits, losses["loss"], losses
