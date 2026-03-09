WORKER_RANK=${1:-0}
YAML_NAME_WITHOUT_EXT=${2:-'MuQ_large_multinodes_v100'}
TRAINING_SETTING=${3:-'MUQ'}
MASTER_PROC_ADD=${4:-$CHIEF_IP}
DIST_PORT=${5:-'25520'}
DATASET_NAME=${6:-'music4all'}
NNODS=${7:-4}
NPROCES_PER_NODE=${8:-8}

echo "worker rank ${WORKER_RANK}, master address ${MASTER_PROC_ADD}:${DIST_PORT}"

MAP_PROJ_DIR=$(pwd)
echo $MAP_PROJ_DIR

NUM_WOKERS=0

run_command_prefix=' '
# Loading folders
# 1. json files for audio paths
DATA_DIR=${MAP_PROJ_DIR}/dataset/${DATASET_NAME} #audio_manifest
# 2. working folder for saving checkpoints and loading config files
CONFIG_DIR=/${MAP_PROJ_DIR}/config/pretrain

FAIRSEQ_PATH=${MAP_PROJ_DIR}/fairseq;
SAVE_DIR=${MAP_PROJ_DIR}/output/

LABEL_RATE=25

case $YAML_NAME_WITHOUT_EXT in
    MuQ_large_multinodes_v100)
        TASK_LABELS_POSTFIX='[]'
        # NNODS=4
        LABEL_RATE=25
        # NPROCES_PER_NODE=8
        MAX_TOKENS=2400000
        ;;
    MuQ_large_iter_multinodes_v100)
        TASK_LABELS_POSTFIX='[]'
        # NNODS=4
        LABEL_RATE=25
        # NPROCES_PER_NODE=8
        MAX_TOKENS=2400000
        OTHER_PARAMS=" task.label_scp_path=${MAP_PROJ_DIR}/data/msd_ark/reiter_musicssl_msd/train.scp "
        ;;
    *)
        echo "Unknown running config: ${$YAML_NAME_WITHOUT_EXT} = ${YAML_NAME_WITHOUT_EXT}"
        exit 1
        ;;
    esac

 echo running $YAML_NAME_WITHOUT_EXT ..

  mkdir -p ${SAVE_DIR}
  echo "checkpoint save at: ${SAVE_DIR}"
  cd ${SAVE_DIR}

  echo "NPROCES_PER_NODE is ${NPROCES_PER_NODE}"

  DISTRIBUTED_WORLD_SIZE=`expr ${NNODS} \* ${NPROCES_PER_NODE}`
  ACTUAL_WORKER_RANK=`expr ${WORKER_RANK} \* ${NPROCES_PER_NODE}`
  echo "worker rank ${WORKER_RANK}, master address ${MASTER_PROC_ADD}:${DIST_PORT}, actual rank ${ACTUAL_WORKER_RANK}"

  DATE_SUFFIX=`date +"%Y-%m-%d_%H-%M"`

  OMP_NUM_THREADS=6 ${run_command_prefix} \
  python3 -u ${FAIRSEQ_PATH}/fairseq_cli/hydra_train.py \
    --config-dir ${CONFIG_DIR} --config-name ${YAML_NAME_WITHOUT_EXT} \
    common.user_dir=${MAP_PROJ_DIR}/ \
    common.tensorboard_logdir=${MAP_PROJ_DIR}/logs/pretrain_tb_${TRAINING_SETTING}_${YAML_NAME_WITHOUT_EXT}_multinodes${NNODS} \
    checkpoint.save_dir=${SAVE_DIR}/ckpt_${TRAINING_SETTING}_multinodes${NNODS}_${DATE_SUFFIX}/${YAML_NAME_WITHOUT_EXT} \
    distributed_training.distributed_rank=${ACTUAL_WORKER_RANK} \
    distributed_training.distributed_world_size=${DISTRIBUTED_WORLD_SIZE}  \
    distributed_training.distributed_num_procs=${DISTRIBUTED_WORLD_SIZE}  \
    distributed_training.nprocs_per_node=${NPROCES_PER_NODE} \
    distributed_training.distributed_init_method="tcp://${MASTER_PROC_ADD}:${DIST_PORT}" \
    task.data=${DATA_DIR} \
    task.label_dir=${LABEL_DIR} \
    task.labels=${TASK_LABELS_POSTFIX} \
    dataset.num_workers=${NUM_WOKERS} \
    dataset.max_tokens=${MAX_TOKENS} \
    dataset.disable_validation=true \
    ${OTHER_PARAMS} \
