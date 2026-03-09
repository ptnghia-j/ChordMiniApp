`
# Guidance on MuQ-MuLan Training (Contrastive Learning)

This guide provides instructions for training **MuQ-MuLan**, a contrastive learning model that jointly encodes music and text.

We recommend training on **32 GPUs**, each with **at least 32 GB of memory**. Training typically takes **1–2 days**, depending on hardware environment.

---

## Step 1: Environment Setup

First, install all required dependencies listed in [requirements.txt](./requirements.txt):

```bash
pip install -r requirements.txt
```

Then, install this repository as a library in editable mode:

```bash
pip install -e .
```


---

## Step 2: Data Preparation

We provide an example setup using the [MTG-Jamendo](https://github.com/MTG/mtg-jamendo-dataset) open-source music dataset.

Please download our preprocessed data split files from [this link](https://drive.google.com/file/d/1PMCUpmtw8JwUv9Y-bNl8WIAZDtX8UaFY/view?usp=sharing) and place them in the appropriate directory.

If you wish to use your own dataset, ensure that your data follow the required format.

---

## Step 3: Run Training

### Option 1: Manual Configuration

This method will prompt you to configure distributed training manually via `accelerate`:

```bash
accelerate config
accelerate launch train.py
```

### Option 2: Using a Predefined Config File

We provide example config files for multi-node multi-GPU training. For example, to launch training on **4 nodes**, each with **8 GPUs**, run:

```bash
accelerate launch \
  --config_file config/accelerate/32gpu4node_fp16.yaml \
  --machine_rank $NODE_RANK \
  --main_process_ip $CHIEF_IP \
  --main_process_port 29500 \
  train.py
```

* `$NODE_RANK`: Index of the current machine (0 for the main node).
* `$CHIEF_IP`: IP address of the main (rank-0) node.
* Adjust the config file as needed for different hardware setups.

If you are training on a **single machine**, simply set `--main_process_ip=127.0.0.1` and `--machine_rank=0`.

If you wish to use your own pretrained MuQ model for initialization, simply modify the `model.mulan.audio_model.name` field in `config/model/muq_mulan.yaml`.

---

## Step 4: Convert to HF Checkpoint

After training, convert your Fairseq-style checkpoint to HuggingFace format:

```bash
python scripts/convert_muqmulan_fairseq_ckpt_to_huggingface.py \
  --checkpoint_path outputs/YYYY-MM-DD/hh-mm-ss/ckpt/mulan.1100.pt \
  --save_dir outputs/hf-username/My-MuQ-MuLan-large
```

You can then load and use the model via the HuggingFace-style interface:

```python
from muq import MuQMuLan

# Load from local HuggingFace-style checkpoint
mulan = MuQMuLan.from_pretrained("outputs/hf-username/My-MuQ-MuLan-large")
mulan = mulan.to(device).eval()

# Extract music embeddings
audio_embeds = mulan(wavs=wavs)

# Extract text embeddings (in English or Chinese)
text_embeds = mulan(texts=texts)

# Compute similarity
sim = mulan.calc_similarity(audio_embeds, text_embeds)
```

You can also upload your converted checkpoint to the Hugging Face Hub using `huggingface-cli`. The uploaded model will remain fully compatible with the `MuQMuLan.from_pretrained()` interface.

---

## Evaluation

For evaluation, we recommend using the [sota-music-tagging-models](https://github.com/minzwon/sota-music-tagging-models/) toolkit. It supports various metrics and datasets widely used in music tagging and retrieval.

