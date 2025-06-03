import os
import sys
import traceback
import tempfile
import subprocess
from pathlib import Path

# Get the absolute path to the ChordMini directory
current_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "ChordMini")

def btc_chord_recognition(audio_path, lab_path, model_variant='sl'):
    """
    BTC chord recognition wrapper function
    
    Args:
        audio_path: Path to the audio file
        lab_path: Path to save the output lab file
        model_variant: 'sl' for Supervised Learning or 'pl' for Pseudo-Label
    
    Returns:
        bool: Success status
    """
    print(f"Running BTC chord recognition on {audio_path} with model variant: {model_variant}")
    
    try:
        # Validate input parameters
        if not os.path.exists(audio_path):
            print(f"Error: Audio file not found: {audio_path}")
            return False
            
        if model_variant not in ['sl', 'pl']:
            print(f"Error: Invalid model variant: {model_variant}. Must be 'sl' or 'pl'")
            return False
        
        # Determine model file path based on variant
        if model_variant == 'sl':
            model_file = os.path.join(current_dir, 'checkpoints', 'SL', 'btc_model_large_voca.pt')
        else:  # pl
            model_file = os.path.join(current_dir, 'checkpoints', 'btc', 'btc_combined_best.pth')
        
        # Check if model file exists
        if not os.path.exists(model_file):
            print(f"Error: BTC model file not found: {model_file}")
            return False
        
        # Configuration file path
        config_file = os.path.join(current_dir, 'config', 'btc_config.yaml')
        if not os.path.exists(config_file):
            print(f"Error: BTC config file not found: {config_file}")
            return False
        
        # Create output directory for BTC processing
        output_dir = os.path.dirname(lab_path)
        if output_dir:  # Only create directory if path is not empty
            os.makedirs(output_dir, exist_ok=True)
        
        # Change to ChordMini directory for proper imports
        original_dir = os.getcwd()
        os.chdir(current_dir)
        
        try:
            # Import and run BTC processing
            sys.path.insert(0, current_dir)
            
            # Import required modules
            from test_btc import process_audio_with_padding, main as btc_main
            from modules.utils import logger
            from modules.utils.mir_eval_modules import idx2voca_chord
            from modules.utils.hparams import HParams
            from modules.models.Transformer.btc_model import BTC_model
            import torch
            import numpy as np
            
            # Set up logging
            logger.logging_verbosity(1)
            
            # Force CPU usage for consistent device handling
            device = torch.device("cpu")
            
            # Load configuration
            config = HParams.load(config_file)
            
            # BTC uses large vocabulary
            n_classes = config.model.get('num_chords', 170)
            idx_to_chord = idx2voca_chord()
            
            # Create model instance
            model = BTC_model(config=config.model).to(device)
            
            # Load model weights
            if os.path.isfile(model_file):
                try:
                    checkpoint = torch.load(model_file, map_location=device, weights_only=False)
                except TypeError:
                    checkpoint = torch.load(model_file, map_location=device)
                
                # Get the state dict from the checkpoint
                if 'model_state_dict' in checkpoint:
                    state_dict = checkpoint['model_state_dict']
                elif 'model' in checkpoint:
                    state_dict = checkpoint['model']
                else:
                    state_dict = checkpoint
                
                # Remove 'module.' prefix if present
                if any(k.startswith('module.') for k in state_dict.keys()):
                    state_dict = {k.replace('module.', ''): v for k, v in state_dict.items()}
                
                # Load state dict
                model.load_state_dict(state_dict, strict=False)
                
                # Get normalization parameters
                ckpt_mean = checkpoint.get('mean', -2.2280)
                ckpt_std = checkpoint.get('std', 1.7191)
                
                # Convert tensors to scalars if needed
                if isinstance(ckpt_mean, torch.Tensor):
                    ckpt_mean = float(ckpt_mean.item() if hasattr(ckpt_mean, 'item') else ckpt_mean)
                if isinstance(ckpt_std, torch.Tensor):
                    ckpt_std = float(ckpt_std.item() if hasattr(ckpt_std, 'item') else ckpt_std)
                
                print(f"Model loaded successfully: {model_file}")
                print(f"Normalization parameters: mean={ckpt_mean:.4f}, std={ckpt_std:.4f}")
            else:
                print(f"Error: Model file not found: {model_file}")
                return False
            
            # Process audio file
            feature, feature_per_second, song_length_second = process_audio_with_padding(audio_path, config)
            
            if feature is None:
                print("Error: Feature extraction returned None")
                return False
            
            # Transpose and normalize features
            feature = feature.T  # Shape: [frames, features]
            epsilon = 1e-8
            feature = (feature - ckpt_mean) / (ckpt_std + epsilon)
            
            # Process features in segments
            seq_len = config.model.get('seq_len', 108)
            original_num_frames = feature.shape[0]
            
            # Pad features to be a multiple of seq_len
            num_pad = seq_len - (original_num_frames % seq_len)
            if num_pad == seq_len:
                num_pad = 0
            if num_pad > 0:
                feature = np.pad(feature, ((0, num_pad), (0, 0)), mode="constant", constant_values=0)
            
            num_instance = feature.shape[0] // seq_len
            
            # Run model inference
            all_predictions_list = []
            with torch.no_grad():
                model.eval()
                
                for t in range(num_instance):
                    start_frame = t * seq_len
                    end_frame = start_frame + seq_len
                    segment_feature = feature[start_frame:end_frame, :]
                    
                    # Add batch dimension
                    feature_tensor = torch.tensor(segment_feature, dtype=torch.float32).unsqueeze(0).to(device)
                    
                    # Get model predictions
                    logits = model(feature_tensor)
                    predictions = torch.argmax(logits, dim=-1)
                    segment_predictions = predictions.squeeze(0).cpu().numpy()
                    all_predictions_list.append(segment_predictions)
            
            # Concatenate predictions and trim to original length
            if not all_predictions_list:
                all_predictions = np.array([], dtype=int)
            else:
                all_predictions = np.concatenate(all_predictions_list, axis=0)
                all_predictions = all_predictions[:original_num_frames]
            
            # Generate .lab format output
            lines = []
            if all_predictions.size > 0:
                prev_chord = all_predictions[0]
                start_time = 0.0
                min_segment_duration = 0.05  # 50ms minimum
                
                for frame_idx, chord_idx in enumerate(all_predictions):
                    current_time = frame_idx * feature_per_second
                    
                    if chord_idx != prev_chord:
                        segment_end_time = current_time
                        segment_duration = segment_end_time - start_time
                        
                        if segment_duration >= min_segment_duration:
                            lines.append(f"{start_time:.6f} {segment_end_time:.6f} {idx_to_chord[prev_chord]}\n")
                        
                        start_time = segment_end_time
                        prev_chord = chord_idx
                
                # Add final segment
                final_time = min(song_length_second, len(all_predictions) * feature_per_second)
                if start_time < final_time:
                    last_segment_duration = final_time - start_time
                    if last_segment_duration >= min_segment_duration:
                        lines.append(f"{start_time:.6f} {final_time:.6f} {idx_to_chord[prev_chord]}\n")
            
            # Write output to lab file
            with open(lab_path, 'w') as f:
                for line in lines:
                    f.write(line)
            
            print(f"BTC chord recognition completed successfully. Output saved to: {lab_path}")
            print(f"Generated {len(lines)} chord segments")
            
            return True
            
        except Exception as e:
            print(f"Error during BTC processing: {e}")
            traceback.print_exc()
            return False
        finally:
            # Restore original directory and clean up sys.path
            os.chdir(original_dir)
            if current_dir in sys.path:
                sys.path.remove(current_dir)
    
    except Exception as e:
        print(f"Error in BTC chord recognition: {e}")
        traceback.print_exc()
        return False

if __name__ == '__main__':
    if len(sys.argv) == 4:
        btc_chord_recognition(sys.argv[1], sys.argv[2], sys.argv[3])
    elif len(sys.argv) == 3:
        btc_chord_recognition(sys.argv[1], sys.argv[2])
    else:
        print('Usage: btc_chord_recognition.py path_to_audio_file path_to_output_file [model_variant]')
        print('\tModel variant can be: sl (Supervised Learning) or pl (Pseudo-Label)')
        exit(0)
