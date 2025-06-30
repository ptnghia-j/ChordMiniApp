#!/usr/bin/env python3
"""
Systematic Comparison Test for kf7Dss2gCe0 Beat Detection
Tests both 44100Hz and 48000Hz audio against both full backend and minimal service
"""

import requests
import json
import time
from pathlib import Path

def test_service_with_audio(service_name, service_url, audio_file, timeout=600):
    """Test a service with an audio file and return detailed results"""
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
            print(f"   🚀 Sending request to {service_url}")
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
    """Main comparison test function"""
    print("🔍 SYSTEMATIC COMPARISON TEST: kf7Dss2gCe0 Beat Detection")
    print("=" * 80)
    
    # Define test matrix
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
            'name': '44100Hz',
            'file': 'kf7Dss2gCe0_44100.wav',
            'expected_fps': 44100 / 1024  # 43.066
        },
        {
            'name': '48000Hz', 
            'file': 'kf7Dss2gCe0_48000.wav',
            'expected_fps': 48000 / 1024  # 46.875
        }
    ]
    
    # Run all test combinations
    results = []
    
    for service in services:
        for audio in audio_files:
            print(f"\n{'='*80}")
            print(f"🎯 TEST: {service['name']} + {audio['name']} Audio")
            print(f"Service: {service['url']}")
            print(f"Audio: {audio['file']}")
            print(f"Expected FPS: {audio['expected_fps']:.3f}")
            
            result = test_service_with_audio(
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
    
    # Generate comprehensive analysis
    print(f"\n{'='*80}")
    print("📊 COMPREHENSIVE ANALYSIS")
    print(f"{'='*80}")
    
    # Create comparison table
    print(f"\n📋 RESULTS TABLE:")
    print(f"{'Service':<15} {'Sample Rate':<12} {'Status':<10} {'Beats':<8} {'BPS':<8} {'Time':<8} {'BPM':<8}")
    print("-" * 80)
    
    for result in results:
        status = "✅ OK" if result['success'] else "❌ FAIL"
        beats = result.get('total_beats', 0) if result['success'] else 0
        bps = f"{result.get('beats_per_second', 0):.3f}" if result['success'] else "N/A"
        proc_time = f"{result.get('processing_time', 0):.1f}s" if result.get('processing_time') else "N/A"
        bpm = f"{result.get('bpm', 0):.1f}" if result['success'] else "N/A"
        
        print(f"{result['service']:<15} {result['sample_rate']:<12} {status:<10} {beats:<8} {bps:<8} {proc_time:<8} {bpm:<8}")
    
    # Detailed analysis
    print(f"\n🔍 DETAILED ANALYSIS:")
    
    # Group results by service
    full_backend_results = [r for r in results if r['service'] == 'Full Backend']
    minimal_service_results = [r for r in results if r['service'] == 'Minimal Service']
    
    print(f"\n🏢 Full Backend Performance:")
    for result in full_backend_results:
        if result['success']:
            print(f"   {result['sample_rate']}: {result['total_beats']} beats ({result['beats_per_second']:.3f} BPS)")
        else:
            print(f"   {result['sample_rate']}: FAILED - {result['error']}")
    
    print(f"\n🔧 Minimal Service Performance:")
    for result in minimal_service_results:
        if result['success']:
            print(f"   {result['sample_rate']}: {result['total_beats']} beats ({result['beats_per_second']:.3f} BPS)")
        else:
            print(f"   {result['sample_rate']}: FAILED - {result['error']}")
    
    # Sample rate comparison
    print(f"\n🎵 Sample Rate Impact:")
    hz_44100_results = [r for r in results if r['sample_rate'] == '44100Hz' and r['success']]
    hz_48000_results = [r for r in results if r['sample_rate'] == '48000Hz' and r['success']]
    
    if hz_44100_results:
        avg_beats_44100 = sum(r['total_beats'] for r in hz_44100_results) / len(hz_44100_results)
        print(f"   44100Hz average: {avg_beats_44100:.1f} beats")
    
    if hz_48000_results:
        avg_beats_48000 = sum(r['total_beats'] for r in hz_48000_results) / len(hz_48000_results)
        print(f"   48000Hz average: {avg_beats_48000:.1f} beats")
    
    # DBN Fix validation
    print(f"\n🔧 DBN Fix Validation:")
    for result in results:
        if result['success'] and 'validation' in result:
            validation = result['validation']
            if validation.get('dbn_fixes_applied'):
                print(f"   {result['service']} + {result['sample_rate']}: DBN fixes applied ✅")
            else:
                print(f"   {result['service']} + {result['sample_rate']}: No DBN fix info")
    
    # Performance comparison
    print(f"\n⚡ Performance Comparison:")
    successful_results = [r for r in results if r['success']]
    if successful_results:
        fastest = min(successful_results, key=lambda x: x['processing_time'])
        slowest = max(successful_results, key=lambda x: x['processing_time'])
        
        print(f"   Fastest: {fastest['service']} + {fastest['sample_rate']} ({fastest['processing_time']:.1f}s)")
        print(f"   Slowest: {slowest['service']} + {slowest['sample_rate']} ({slowest['processing_time']:.1f}s)")
    
    # Final conclusions
    print(f"\n🎯 CONCLUSIONS:")
    
    # Check if any service/sample rate combination works well
    good_results = [r for r in results if r['success'] and r.get('total_beats', 0) > 100]
    poor_results = [r for r in results if r['success'] and r.get('total_beats', 0) <= 10]
    
    if good_results:
        print(f"   ✅ Working combinations:")
        for r in good_results:
            print(f"      {r['service']} + {r['sample_rate']}: {r['total_beats']} beats")
    
    if poor_results:
        print(f"   ❌ Poor performance combinations:")
        for r in poor_results:
            print(f"      {r['service']} + {r['sample_rate']}: {r['total_beats']} beats")
    
    # Determine if issue is service-specific or universal
    all_failed = all(not r['success'] or r.get('total_beats', 0) <= 10 for r in results)
    some_working = any(r['success'] and r.get('total_beats', 0) > 100 for r in results)
    
    if all_failed:
        print(f"   🚨 CRITICAL: All combinations show poor performance - fundamental issue with long audio")
    elif some_working:
        print(f"   💡 MIXED: Some combinations work - issue is service/sample-rate specific")
    
    # Save detailed results
    with open('systematic_test_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\n💾 Detailed results saved to: systematic_test_results.json")

if __name__ == "__main__":
    main()
