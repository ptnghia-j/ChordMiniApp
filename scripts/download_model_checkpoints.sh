#!/usr/bin/env bash
# download_model_checkpoints.sh
#
# Alternative download for ChordMiniApp model checkpoints when Git LFS
# bandwidth is exhausted or unavailable.
#
# Usage:
#   chmod +x scripts/download_model_checkpoints.sh
#   ./scripts/download_model_checkpoints.sh
#
# Each checkpoint is placed where git lfs would have put it.
# After downloading, skip the `git lfs pull` step — these files
# already exist at the correct paths.

set -euo pipefail

BASE_URL="https://github.com/ptnghia-j/ChordMiniApp/releases/download/model-checkpoints-v1"
CHECKPOINT_DIR="SongFormer/src/SongFormer/ckpts"

# Map of relative path → file in the GH Release
declare -A FILES
FILES["${CHECKPOINT_DIR}/SongFormer.safetensors"]="${BASE_URL}/SongFormer.safetensors"
FILES["${CHECKPOINT_DIR}/MuQ/model.safetensors"]="${BASE_URL}/MuQ-model.safetensors"
FILES["${CHECKPOINT_DIR}/MusicFM/pretrained_msd.pt"]="${BASE_URL}/pretrained_msd.pt"

# Also download the ChordMini/Chord-CNN-LSTM model checkpoints if absent
CHORD_BASE_URL="https://github.com/ptnghia-j/ChordMiniApp/releases/download/model-checkpoints-v1"
FILES["python_backend/models/ChordMini/checkpoints/btc_model_best.pth"]="${CHORD_BASE_URL}/btc_model_best.pth"
FILES["python_backend/models/ChordMini/checkpoints/2e1d_model_best.pth"]="${CHORD_BASE_URL}/2e1d_model_best.pth"
FILES["python_backend/models/ChordMini/checkpoints/btc_model_large_voca.pt"]="${CHORD_BASE_URL}/btc_model_large_voca.pt"

echo "Downloading model checkpoints..."
echo ""

for LOCAL_PATH in "${!FILES[@]}"; do
    URL="${FILES[$LOCAL_PATH]}"

    if [ -f "$LOCAL_PATH" ]; then
        echo "  ✓ EXISTS   $LOCAL_PATH"
        continue
    fi

    mkdir -p "$(dirname "$LOCAL_PATH")"

    echo "  ↓ FETCH    $LOCAL_PATH"
    if command -v curl &>/dev/null; then
        curl -fsSL -o "$LOCAL_PATH" "$URL"
    elif command -v wget &>/dev/null; then
        wget -q -O "$LOCAL_PATH" "$URL"
    else
        echo "  ✗ ERROR    Neither curl nor wget found. Install one of them first."
        exit 1
    fi
done

echo ""
echo "All checkpoints downloaded. You can now skip the 'git lfs pull' step."
