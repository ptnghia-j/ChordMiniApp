#!/usr/bin/env python3
"""
Generate metronome click sounds using librosa's click track functionality.
This script creates web-compatible audio files for use in the metronome service.
"""

import librosa
import numpy as np
import soundfile as sf
import os
import json
from pathlib import Path

def generate_librosa_clicks(output_dir: str = "public/audio/metronome"):
    """
    Generate metronome click sounds using librosa and save them as web-compatible audio files.

    Args:
        output_dir: Directory to save the generated audio files
    """
    # Create output directory if it doesn't exist
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    # Audio parameters
    sr = 44100  # Sample rate
    duration = 0.1  # Duration of each click in seconds

    print("Generating librosa-based metronome clicks...")

    # Generate different click variations
    click_configs = {
        'librosa_default': {
            'description': 'Default librosa click',
            'downbeat_freq': None,  # Use librosa default
            'regular_freq': None,   # Use librosa default
            'length': int(sr * duration)
        },
        'librosa_pitched': {
            'description': 'Pitched librosa clicks',
            'downbeat_freq': 1000,  # Higher pitch for downbeat
            'regular_freq': 800,    # Lower pitch for regular beat
            'length': int(sr * duration)
        },
        'librosa_short': {
            'description': 'Short librosa clicks',
            'downbeat_freq': 1200,
            'regular_freq': 900,
            'length': int(sr * 0.05)  # Shorter duration
        },
        'librosa_long': {
            'description': 'Long librosa clicks',
            'downbeat_freq': 800,
            'regular_freq': 600,
            'length': int(sr * 0.15)  # Longer duration
        }
    }
    
    generated_files = {}
    
    for style_name, config in click_configs.items():
        print(f"\nGenerating {style_name} clicks...")
        
        try:
            # Generate downbeat click
            if config['downbeat_freq'] is not None:
                downbeat_click = librosa.clicks(
                    times=[0.0],  # Single click at time 0
                    sr=sr,
                    hop_length=512,
                    click_freq=config['downbeat_freq'],
                    click_duration=duration,
                    length=config['length']
                )
            else:
                # Use librosa default parameters
                downbeat_click = librosa.clicks(
                    times=[0.0],
                    sr=sr,
                    hop_length=512,
                    length=config['length']
                )
            
            # Generate regular beat click
            if config['regular_freq'] is not None:
                regular_click = librosa.clicks(
                    times=[0.0],
                    sr=sr,
                    hop_length=512,
                    click_freq=config['regular_freq'],
                    click_duration=duration,
                    length=config['length']
                )
            else:
                # Use librosa default but with different parameters for variation
                regular_click = librosa.clicks(
                    times=[0.0],
                    sr=sr,
                    hop_length=512,
                    click_duration=duration * 0.8,  # Slightly shorter
                    length=config['length']
                )
            
            # Normalize audio to prevent clipping
            downbeat_click = downbeat_click / np.max(np.abs(downbeat_click)) * 0.8
            regular_click = regular_click / np.max(np.abs(regular_click)) * 0.8
            
            # Save as WAV files (high quality)
            downbeat_wav = os.path.join(output_dir, f"{style_name}_downbeat.wav")
            regular_wav = os.path.join(output_dir, f"{style_name}_regular.wav")
            
            sf.write(downbeat_wav, downbeat_click, sr)
            sf.write(regular_wav, regular_click, sr)
            
            # Also save as MP3 for better web compatibility (if possible)
            try:
                downbeat_mp3 = os.path.join(output_dir, f"{style_name}_downbeat.mp3")
                regular_mp3 = os.path.join(output_dir, f"{style_name}_regular.mp3")
                
                # Note: This requires ffmpeg or similar for MP3 encoding
                # For now, we'll stick with WAV files which are widely supported
                
            except Exception as e:
                print(f"Note: Could not generate MP3 files (this is optional): {e}")
            
            generated_files[style_name] = {
                'description': config['description'],
                'downbeat': f"{style_name}_downbeat.wav",
                'regular': f"{style_name}_regular.wav",
                'sample_rate': sr,
                'duration': duration,
                'downbeat_freq': config.get('downbeat_freq'),
                'regular_freq': config.get('regular_freq')
            }
            
            print(f"✓ Generated {style_name} clicks:")
            print(f"  - Downbeat: {downbeat_wav}")
            print(f"  - Regular: {regular_wav}")
            
        except Exception as e:
            print(f"✗ Error generating {style_name} clicks: {e}")
            continue
    
    # Save metadata about generated files
    metadata_file = os.path.join(output_dir, "librosa_clicks_metadata.json")
    with open(metadata_file, 'w') as f:
        json.dump({
            'generated_files': generated_files,
            'generation_info': {
                'sample_rate': sr,
                'librosa_version': librosa.__version__,
                'numpy_version': np.__version__
            }
        }, f, indent=2)
    
    print(f"\n✓ Metadata saved to: {metadata_file}")
    print(f"\n🎵 Generated {len(generated_files)} librosa click styles")
    
    return generated_files

def test_generated_clicks(output_dir: str = "public/audio/metronome"):
    """
    Test the generated click files by loading and verifying them.
    """
    print("\n=== Testing Generated Clicks ===")
    
    metadata_file = os.path.join(output_dir, "librosa_clicks_metadata.json")
    if not os.path.exists(metadata_file):
        print("No metadata file found. Run generate_librosa_clicks() first.")
        return
    
    with open(metadata_file, 'r') as f:
        metadata = json.load(f)
    
    for style_name, info in metadata['generated_files'].items():
        print(f"\nTesting {style_name}:")
        
        downbeat_file = os.path.join(output_dir, info['downbeat'])
        regular_file = os.path.join(output_dir, info['regular'])
        
        try:
            # Load and verify downbeat click
            downbeat_audio, sr = sf.read(downbeat_file)
            print(f"  ✓ Downbeat: {len(downbeat_audio)} samples, {len(downbeat_audio)/sr:.3f}s duration")
            
            # Load and verify regular click
            regular_audio, sr = sf.read(regular_file)
            print(f"  ✓ Regular: {len(regular_audio)} samples, {len(regular_audio)/sr:.3f}s duration")
            
            # Check audio properties
            downbeat_max = np.max(np.abs(downbeat_audio))
            regular_max = np.max(np.abs(regular_audio))
            print(f"  ✓ Peak levels: downbeat={downbeat_max:.3f}, regular={regular_max:.3f}")
            
        except Exception as e:
            print(f"  ✗ Error testing {style_name}: {e}")

if __name__ == "__main__":
    # Generate the librosa click sounds
    generated = generate_librosa_clicks()
    
    # Test the generated files
    test_generated_clicks()
    
    print("\n🎉 Librosa click generation complete!")
    print("Next steps:")
    print("1. Update MetronomeService to use these audio files")
    print("2. Add 'librosa' options to the sound style selector")
    print("3. Test the new sounds in the web application")
