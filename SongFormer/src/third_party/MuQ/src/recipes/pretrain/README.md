`
# Guidance on MuQ Pretraining (SSL)

This page provides a detailed explanation of the MuQ pretraining process, including an example training setup using the **open-source [Music4All dataset](https://sites.google.com/view/contact4music4all)**.

To train MuQ effectively, we recommend using **32 GPUs**, each with **at least 32 GB** of VRAM.
The self-supervised pretraining process may take approximately **3 days to 1 week** to complete.

Before getting started, initialize and update the submodules to sync the fairseq directory:
```
git submodule init
git submodule update
```
Then, please make sure to install all required dependencies listed in [requirements.txt](./requirements.txt).

## Step1: Data Preparation

You need to download the Music4All dataset from the [Music4All site](https://sites.google.com/view/contact4music4all).
Then, download our [music4all splits index](https://drive.google.com/file/d/1GbZRzPZP989j1b4SYFSlRkBJryykNCSF/view?usp=sharing) files and place it in the `src/recipes/pretrain/dataset` directory. Note that you must adjust the `path` field within the splits files to align with your local path.

While we provide an example using Music4All here, we strongly recommend performing self-supervised pretraining on larger datasets such as [MSD](https://labs.acousticbrainz.org/million-song-dataset-echonest-archive/) for better performance.



## Step2: Prepare the Mel-RVQ

MuQ relies on a pretrained Mel-RVQ model for training. We provide a pretrained Mel-RVQ checkpoint trained on the Music4All dataset [here](https://drive.google.com/file/d/1GgY9ZfZQOJFQqLPcAyxxw6yhu09WGtI1/view?usp=sharing) for direct download. This checkpoint is suitable for music modality.

If you want to train Mel-RVQ on your own dataset, you can run the following command:

```
python rvq_trainer.py --train_path dataset/music4all/train.json --valid_path dataset/music4all/valid.json
```

Training Mel-RVQ is very fast, it typically takes around 1 hour on a single GPU.


## Step3: SSL Training
To start self-supervised pretraining of MuQ, please run the following script. This script is designed for distributed training on 4 nodes, each with 8 GPUs (total 32 GPUs):

```
export NUM_NODES=4
export GPUS_PER_NODE=8

bash scripts/run_training_muq.sh $NODE_INDEX MuQ_large_multinodes_v100 MUQ $CHIEF_IP 25520 music4all $NUM_NODES $GPUS_PER_NODE
```


🔧 Arguments:

* `$NODE_INDEX`: Index of the current node (0 for chief, 1, 2, … for workers).
* `$CHIEF_IP`: IP address of the chief node (i.e., the node with `NODE_INDEX=0`).
If you are **not using multi-node training**, simply set this to `127.0.0.1`.
* `$NUM_NODES`: Total number of nodes (e.g., `1` for single-machine training, `4` for multi-node).
* `$GPUS_PER_NODE`: Number of GPUs per node (e.g., `8`).


## Step 4: Convert to HF Checkpoint

After finishing the training, you can convert the trained Fairseq checkpoint to **HuggingFace format**, just run:

```bash
python scripts/convert_muq_fairseq_ckpt_to_huggingface.py \
    --model_dir $PWD \
    --checkpoint_path ./output/ckpt_MUQ_XXX/MuQ_large_multinodes_v100/checkpoint_XXX.pt \
    --save_dir ./output/hf-username/My-MuQ-large-huggingface
```

Once converted, you can load the model using the HuggingFace-style interface:

```python
from muq import MuQ
import torch

# Load from local HuggingFace-style checkpoint
muq = MuQ.from_pretrained("./output/hf-username/My-MuQ-large-huggingface")
muq = muq.to(device).eval()

with torch.no_grad():
    output = muq(wavs, output_hidden_states=True)
```

You can also upload your converted checkpoint to the HuggingFace Hub using `huggingface-cli`. The model will be fully compatible with the `MuQ.from_pretrained()` interface. Feel free to share it :)