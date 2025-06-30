#!/usr/bin/env python3
"""
Debug script to analyze kf7Dss2gCe0 beat detection issue
This script will examine the Beat-Transformer activations and DBN processing
"""

import requests
import json
from pathlib import Path

def test_with_short_audio():
    """Test with the 10-second sample to see if the issue is audio length related"""
    print("🧪 Testing with 10-second kf7Dss2gCe0 sample...")
    
    url = "https://chordmini-beat-transformer-minimal-pluj3yargq-uc.a.run.app/api/detect-beats"
    
    with open("kf7Dss2gCe0_short.mp3", "rb") as f:
        files = {"file": f}
        response = requests.post(url, files=files, timeout=120)
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Short audio test successful:")
        print(f"   Duration: {data.get('duration', 'unknown')}s")
        print(f"   Total beats: {data.get('total_beats', 0)}")
        print(f"   BPM: {data.get('bpm', 'unknown')}")
        
        if data.get('total_beats', 0) > 5:
            print("   🎉 Short audio works - issue might be with long audio processing")
        else:
            print("   ⚠️ Short audio also has low beat count - fundamental issue")
        
        return data
    else:
        print(f"❌ Short audio test failed: {response.status_code}")
        return None

def analyze_full_audio_result():
    """Analyze the full audio result we got earlier"""
    print("\n📊 Analyzing full kf7Dss2gCe0 result...")
    
    # The result we got from the full audio test
    result = {
        "total_beats": 1,
        "duration": 214.471125,
        "beats": [90.79466666666667],
        "bpm": 120.0,
        "beat_info": [
            {
                "time": 90.79466666666667,
                "strength": 0.8377081751823425,
                "is_downbeat": True
            }
        ]
    }
    
    print(f"Duration: {result['duration']:.1f}s")
    print(f"Total beats: {result['total_beats']}")
    print(f"Beat times: {result['beats']}")
    print(f"Beat at: {result['beats'][0]:.1f}s ({result['beats'][0]/result['duration']*100:.1f}% through track)")
    
    # Calculate expected vs actual
    expected_beats = result['duration'] * 2  # Rough estimate of 2 beats per second
    print(f"\nExpected beats (~2 BPS): {expected_beats:.0f}")
    print(f"Actual beats: {result['total_beats']}")
    print(f"Detection rate: {result['total_beats']/expected_beats*100:.1f}%")
    
    # Analyze the single beat
    beat_time = result['beats'][0]
    beat_strength = result['beat_info'][0]['strength']
    
    print(f"\nSingle beat analysis:")
    print(f"  Time: {beat_time:.1f}s")
    print(f"  Strength: {beat_strength:.3f}")
    print(f"  Position: {beat_time/result['duration']*100:.1f}% through track")
    
    # This suggests the Beat-Transformer model is only finding one strong activation
    # in the entire 214-second track, which indicates either:
    # 1. The model is not working correctly for this audio
    # 2. The audio preprocessing is wrong
    # 3. The DBN post-processing is too restrictive
    
    return result

def test_different_audio():
    """Test with a different audio file to see if the issue is specific to kf7Dss2gCe0"""
    print("\n🎵 Testing with different audio...")
    
    # Check if we have the test audio file
    test_audio = Path("test_audio.mp3")
    if not test_audio.exists():
        print("❌ test_audio.mp3 not found - skipping comparison test")
        return None
    
    url = "https://chordmini-beat-transformer-minimal-pluj3yargq-uc.a.run.app/api/detect-beats"
    
    with open(test_audio, "rb") as f:
        files = {"file": f}
        response = requests.post(url, files=files, timeout=120)
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Test audio result:")
        print(f"   Duration: {data.get('duration', 'unknown')}s")
        print(f"   Total beats: {data.get('total_beats', 0)}")
        print(f"   BPM: {data.get('bpm', 'unknown')}")
        
        beats_per_second = data.get('total_beats', 0) / data.get('duration', 1)
        print(f"   Beats per second: {beats_per_second:.2f}")
        
        return data
    else:
        print(f"❌ Test audio failed: {response.status_code}")
        return None

def compare_with_full_backend():
    """Compare results with the full backend service"""
    print("\n🔄 Comparing with full backend...")
    
    # Test the full backend with the short audio
    url = "https://chordmini-backend-full-191567167632.us-central1.run.app/detect-beats"
    
    try:
        with open("kf7Dss2gCe0_short.mp3", "rb") as f:
            files = {"file": f}
            response = requests.post(url, files=files, timeout=120)
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Full backend result:")
            print(f"   Duration: {data.get('duration', 'unknown')}s")
            print(f"   Total beats: {data.get('total_beats', 0)}")
            print(f"   BPM: {data.get('bpm', 'unknown')}")
            
            return data
        else:
            print(f"❌ Full backend failed: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Full backend error: {e}")
        return None

def main():
    """Main debug function"""
    print("🔍 kf7Dss2gCe0 Beat Detection Debug Analysis")
    print("=" * 60)
    
    # Test 1: Short audio sample
    short_result = test_with_short_audio()
    
    # Test 2: Analyze full audio result
    full_result = analyze_full_audio_result()
    
    # Test 3: Different audio comparison
    test_result = test_different_audio()
    
    # Test 4: Compare with full backend
    backend_result = compare_with_full_backend()
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 DEBUG SUMMARY")
    print("=" * 60)
    
    print(f"\n🎯 kf7Dss2gCe0 Analysis:")
    print(f"   Full audio (214s): {full_result['total_beats']} beats")
    if short_result:
        print(f"   Short audio (10s): {short_result.get('total_beats', 'failed')} beats")
    
    print(f"\n🔧 Service Comparison:")
    print(f"   Minimal service: Working, but low beat detection")
    if backend_result:
        print(f"   Full backend: {backend_result.get('total_beats', 'failed')} beats")
    else:
        print(f"   Full backend: Failed or timeout")
    
    print(f"\n🎵 Audio Comparison:")
    if test_result:
        print(f"   Test audio: {test_result.get('total_beats', 'failed')} beats")
    else:
        print(f"   Test audio: Not available")
    
    print(f"\n🔍 Diagnosis:")
    if short_result and short_result.get('total_beats', 0) > 5:
        print("   ✅ Service works with short audio - issue is with long audio processing")
        print("   💡 Possible causes: Memory limits, timeout, or model degradation with long sequences")
    elif short_result and short_result.get('total_beats', 0) <= 5:
        print("   ⚠️ Service has issues with both short and long audio")
        print("   💡 Possible causes: Model not loading correctly, activation processing issues")
    else:
        print("   ❌ Service not responding correctly")
        print("   💡 Possible causes: Service configuration, dependency issues")
    
    print(f"\n🎯 Next Steps:")
    print("   1. Check service logs for activation statistics")
    print("   2. Test with known-good audio files")
    print("   3. Compare activation patterns between working and non-working cases")
    print("   4. Verify Beat-Transformer model is loading correctly")

if __name__ == "__main__":
    main()
