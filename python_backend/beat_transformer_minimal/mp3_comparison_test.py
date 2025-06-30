#!/usr/bin/env python3
"""
MP3 Comparison Test for kf7Dss2gCe0 Beat Detection
Tests compressed MP3 files to avoid HTTP 413 errors
"""

import requests
import json
import time
from pathlib import Path

def test_service_with_mp3(service_name, service_url, audio_file, timeout=600):
    """Test a service with an MP3 file"""
    print(f"\n🧪 Testing {service_name} with {audio_file}")
    
    if not Path(audio_file).exists():
        return {
            'success': False,
            'error': f'Audio file not found: {audio_file}',
            'service': service_name,
            'audio_file': audio_file
        }
    
    try:
        # Get file size
        file_size = Path(audio_file).stat().st_size
        print(f"   📁 File size: {file_size / 1024 / 1024:.1f}MB")
        
        # Start timing
        start_time = time.time()
        
        # Make request
        with open(audio_file, 'rb') as f:
            files = {'file': f}
            print(f"   🚀 Sending request...")
            response = requests.post(service_url, files=files, timeout=timeout)
        
        # Calculate processing time
        processing_time = time.time() - start_time
        print(f"   ⏱️ Processing time: {processing_time:.1f}s")
        print(f"   📊 HTTP Status: {response.status_code}")
        
        if response.status_code == 200:
            try:
                data = response.json()
                
                # Extract key metrics
                result = {
                    'success': True,
                    'service': service_name,
                    'audio_file': audio_file,
                    'processing_time': processing_time,
                    'file_size_mb': file_size / 1024 / 1024,
                    'total_beats': data.get('total_beats', 0),
                    'total_downbeats': data.get('total_downbeats', 0),
                    'duration': data.get('duration', 0),
                    'bpm': data.get('bpm', 0),
                    'model_used': data.get('model_used', 'unknown'),
                    'validation': data.get('validation', {}),
                    'raw_response': data
                }
                
                # Calculate beats per second
                if result['duration'] > 0:
                    result['beats_per_second'] = result['total_beats'] / result['duration']
                else:
                    result['beats_per_second'] = 0
                
                print(f"   ✅ SUCCESS: {result['total_beats']} beats in {result['duration']:.1f}s")
                print(f"   🥁 BPS: {result['beats_per_second']:.3f} beats/second")
                print(f"   🎵 BPM: {result['bpm']}")
                
                return result
                
            except json.JSONDecodeError as e:
                return {
                    'success': False,
                    'error': f'Invalid JSON response: {e}',
                    'service': service_name,
                    'audio_file': audio_file,
                    'processing_time': processing_time,
                    'raw_response': response.text[:500]
                }
        else:
            return {
                'success': False,
                'error': f'HTTP {response.status_code}',
                'service': service_name,
                'audio_file': audio_file,
                'processing_time': processing_time,
                'raw_response': response.text[:500]
            }
            
    except requests.exceptions.Timeout:
        return {
            'success': False,
            'error': f'Request timeout after {timeout}s',
            'service': service_name,
            'audio_file': audio_file,
            'processing_time': timeout
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'service': service_name,
            'audio_file': audio_file,
            'processing_time': 0
        }

def main():
    """Main MP3 comparison test"""
    print("🎵 MP3 COMPARISON TEST: kf7Dss2gCe0 Beat Detection")
    print("=" * 70)
    
    # Test matrix with MP3 files
    services = [
        {
            'name': 'Full Backend',
            'url': 'https://chordmini-backend-full-191567167632.us-central1.run.app/detect-beats'
        },
        {
            'name': 'Minimal Service',
            'url': 'https://chordmini-beat-transformer-minimal-pluj3yargq-uc.a.run.app/api/detect-beats'
        }
    ]
    
    audio_files = [
        {
            'name': '44100Hz MP3',
            'file': 'kf7Dss2gCe0_44100.mp3',
            'expected_fps': 44100 / 1024  # 43.066
        },
        {
            'name': '48000Hz MP3', 
            'file': 'kf7Dss2gCe0_48000.mp3',
            'expected_fps': 48000 / 1024  # 46.875
        }
    ]
    
    # Run all test combinations
    results = []
    
    for service in services:
        for audio in audio_files:
            print(f"\n{'='*70}")
            print(f"🎯 TEST: {service['name']} + {audio['name']}")
            print(f"Service: {service['url']}")
            print(f"Audio: {audio['file']}")
            print(f"Expected FPS: {audio['expected_fps']:.3f}")
            
            result = test_service_with_mp3(
                service_name=service['name'],
                service_url=service['url'],
                audio_file=audio['file'],
                timeout=600  # 10 minutes timeout
            )
            
            # Add metadata
            result['sample_rate'] = audio['name']
            result['expected_fps'] = audio['expected_fps']
            
            results.append(result)
            
            # Brief pause between tests
            time.sleep(2)
    
    # Generate analysis
    print(f"\n{'='*70}")
    print("📊 MP3 TEST RESULTS")
    print(f"{'='*70}")
    
    # Create comparison table
    print(f"\n📋 RESULTS TABLE:")
    print(f"{'Service':<15} {'Sample Rate':<15} {'Status':<10} {'Beats':<8} {'BPS':<8} {'Time':<8}")
    print("-" * 70)
    
    for result in results:
        status = "✅ OK" if result['success'] else "❌ FAIL"
        beats = result.get('total_beats', 0) if result['success'] else 0
        bps = f"{result.get('beats_per_second', 0):.3f}" if result['success'] else "N/A"
        proc_time = f"{result.get('processing_time', 0):.1f}s" if result.get('processing_time') else "N/A"
        
        print(f"{result['service']:<15} {result['sample_rate']:<15} {status:<10} {beats:<8} {bps:<8} {proc_time:<8}")
    
    # Analysis
    print(f"\n🔍 ANALYSIS:")
    
    successful_results = [r for r in results if r['success']]
    failed_results = [r for r in results if not r['success']]
    
    if successful_results:
        print(f"\n✅ SUCCESSFUL TESTS:")
        for r in successful_results:
            print(f"   {r['service']} + {r['sample_rate']}: {r['total_beats']} beats ({r['beats_per_second']:.3f} BPS)")
            
            # Check if this is a good result
            if r['total_beats'] > 100:
                print(f"      🎉 EXCELLENT: High beat count indicates good detection")
            elif r['total_beats'] > 10:
                print(f"      ⚠️ MODERATE: Reasonable beat count")
            else:
                print(f"      ❌ POOR: Very low beat count")
    
    if failed_results:
        print(f"\n❌ FAILED TESTS:")
        for r in failed_results:
            print(f"   {r['service']} + {r['sample_rate']}: {r['error']}")
    
    # Sample rate comparison
    print(f"\n🎵 SAMPLE RATE COMPARISON:")
    hz_44100_results = [r for r in successful_results if '44100Hz' in r['sample_rate']]
    hz_48000_results = [r for r in successful_results if '48000Hz' in r['sample_rate']]
    
    if hz_44100_results and hz_48000_results:
        avg_44100 = sum(r['total_beats'] for r in hz_44100_results) / len(hz_44100_results)
        avg_48000 = sum(r['total_beats'] for r in hz_48000_results) / len(hz_48000_results)
        
        print(f"   44100Hz average: {avg_44100:.1f} beats")
        print(f"   48000Hz average: {avg_48000:.1f} beats")
        
        if abs(avg_44100 - avg_48000) < 10:
            print(f"   💡 Sample rates show similar performance - DBN fixes likely working")
        elif avg_48000 > avg_44100:
            print(f"   🔧 48000Hz performs better - DBN fixes may be working")
        else:
            print(f"   ⚠️ 44100Hz performs better - unexpected if DBN bug exists")
    
    # Service comparison
    print(f"\n🏢 SERVICE COMPARISON:")
    full_backend_results = [r for r in successful_results if r['service'] == 'Full Backend']
    minimal_service_results = [r for r in successful_results if r['service'] == 'Minimal Service']
    
    if full_backend_results:
        avg_full = sum(r['total_beats'] for r in full_backend_results) / len(full_backend_results)
        print(f"   Full Backend average: {avg_full:.1f} beats")
    
    if minimal_service_results:
        avg_minimal = sum(r['total_beats'] for r in minimal_service_results) / len(minimal_service_results)
        print(f"   Minimal Service average: {avg_minimal:.1f} beats")
        
        # Check for DBN fixes
        for r in minimal_service_results:
            validation = r.get('validation', {})
            if validation.get('dbn_fixes_applied'):
                print(f"   ✅ DBN fixes confirmed in minimal service")
                break
    
    # Final conclusions
    print(f"\n🎯 CONCLUSIONS:")
    
    if all(r['success'] for r in results):
        print(f"   ✅ All tests successful - file size was the issue, not processing")
    elif any(r['success'] for r in results):
        print(f"   ⚠️ Mixed results - some combinations work")
    else:
        print(f"   ❌ All tests failed - deeper issue exists")
    
    # Check for the original kf7Dss2gCe0 bug
    good_results = [r for r in successful_results if r['total_beats'] > 100]
    poor_results = [r for r in successful_results if r['total_beats'] <= 10]
    
    if good_results:
        print(f"   🎉 BREAKTHROUGH: Some combinations detect many beats - long audio processing CAN work")
    
    if poor_results:
        print(f"   🚨 ISSUE CONFIRMED: Some combinations still show very low beat detection")
    
    # Save results
    with open('mp3_test_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\n💾 Results saved to: mp3_test_results.json")

if __name__ == "__main__":
    main()
