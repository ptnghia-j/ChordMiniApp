
# set up GPU
export CUDA_VISIBLE_DEVICES=0
echo "use gpu ${CUDA_VISIBLE_DEVICES}"

# set PythonPath
export PYTHONPATH=$(realpath ../third_party):$PYTHONPATH

export OMP_NUM_THREADS=1
export MPI_NUM_THREADS=1
export NCCL_P2P_DISABLE=1
export NCCL_IB_DISABLE=1

INPUT_SCP=
OUTPUT_DIR=

mkdir -p $OUTPUT_DIR
echo "input scp: $INPUT_SCP"
echo "output dir: $OUTPUT_DIR"

python obtain_SSL_representation/MusicFM/get_embeddings_mp_30s_wrap420s.py \
  -i "$INPUT_SCP" \
  -o "$OUTPUT_DIR" \
  -gn 1 \
  -tn 1
  # --debug
