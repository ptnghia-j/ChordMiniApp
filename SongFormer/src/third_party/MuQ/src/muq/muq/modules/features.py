import torchaudio
from torch import nn
import torch


class MelSTFT:
    def __init__(
        self,
        sample_rate=24000,
        n_fft=2048,
        hop_length=240,
        n_mels=128,
        is_db=False,
    ):
        super(MelSTFT, self).__init__()

        # spectrogram
        self.mel_stft = torchaudio.transforms.MelSpectrogram(
            sample_rate=sample_rate, n_fft=n_fft, hop_length=hop_length, n_mels=n_mels
        )

        # amplitude to decibel
        self.is_db = is_db
        if is_db:
            self.amplitude_to_db = torchaudio.transforms.AmplitudeToDB()

    def __call__(self, waveform):
        if self.is_db:
            return self.amplitude_to_db(self.mel_stft(waveform))
        else:
            return self.mel_stft(waveform)

    def to(self, device):
        self.mel_stft = self.mel_stft.to(device)
        if self.is_db:
            self.amplitude_to_db = self.amplitude_to_db.to(device)
        return self
