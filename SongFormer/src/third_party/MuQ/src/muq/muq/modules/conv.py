from torch import nn
from einops import rearrange


class Res2dModule(nn.Module):
    def __init__(self, idim, odim, stride=(2, 2)):
        super(Res2dModule, self).__init__()
        self.conv1 = nn.Conv2d(idim, odim, 3, padding=1, stride=stride)
        self.bn1 = nn.BatchNorm2d(odim)
        self.conv2 = nn.Conv2d(odim, odim, 3, padding=1)
        self.bn2 = nn.BatchNorm2d(odim)
        self.relu = nn.ReLU()

        # residual
        self.diff = False
        if (idim != odim) or (stride[0] > 1):
            self.conv3 = nn.Conv2d(idim, odim, 3, padding=1, stride=stride)
            self.bn3 = nn.BatchNorm2d(odim)
            self.diff = True

    def forward(self, x):
        out = self.bn2(self.conv2(self.relu(self.bn1(self.conv1(x)))))
        if self.diff:
            x = self.bn3(self.conv3(x))
        out = x + out
        out = self.relu(out)
        return out


class Conv2dSubsampling(nn.Module):
    """Convolutional 2D subsampling (to 1/4 length).

    Args:
        idim (int): Input dimension.
        hdim (int): Hidden dimension.
        odim (int): Output dimension.
        strides (list): Sizes of strides.
        n_bands (int): Number of frequency bands.
    """

    def __init__(self, idim, hdim, odim, strides=[2, 2], n_bands=64):
        """Construct an Conv2dSubsampling object."""
        super(Conv2dSubsampling, self).__init__()

        self.conv = nn.Sequential(
            Res2dModule(idim, hdim, (2, strides[0])),
            Res2dModule(hdim, hdim, (2, strides[1])),
        )
        self.linear = nn.Linear(hdim * n_bands // 2 // 2, odim)

    def forward(self, x):
        """Subsample x.

        Args:
            x (torch.Tensor): Input tensor (#batch, idim, time).

        Returns:
            torch.Tensor: Subsampled tensor (#batch, time', odim),
                where time' = time // 4.
        """

        if x.dim() == 3:
            x = x.unsqueeze(1)  # (b, c, f, t)
        x = self.conv(x)
        x = rearrange(x, "b c f t -> b t (c f)")
        x = self.linear(x)
        return x

if __name__ == '__main__':
    import torch
    conv_dim, encoder_dim = 512, 1024
    conv = Conv2dSubsampling(
            1, conv_dim, encoder_dim, strides=[2, 1], n_bands=128
        )
    inp = torch.randn((1, 128, 3000))
    out = conv(inp)
    print(out.shape)