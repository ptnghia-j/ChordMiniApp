import torch, librosa
from muq import MuQ

device = 'cuda'
wav, sr = librosa.load("path/to/music_audio.wav", sr = 24000)
wavs = torch.tensor(wav).unsqueeze(0).to(device) 

# Use local huggingface checkpoint
muq = MuQ.from_pretrained("./output/hf-username/My-MuQ-large-huggingface")
muq = muq.to(device).eval()

with torch.no_grad():
    output = muq(wavs, output_hidden_states=True)

print('Total number of layers: ', len(output.hidden_states))
print('Feature shape: ', output.last_hidden_state.shape)