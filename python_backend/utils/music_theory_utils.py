"""
Music theory utilities for ChordMini Flask application.

This module provides music theory functions including time signature detection,
chord analysis, and other music theory calculations.
"""

from utils.logging import log_info, log_error, log_debug


def detect_time_signature_from_pattern(pattern):
    """
    Detect time signature from a beat pattern.

    Args:
        pattern: List of beat numbers (e.g., [1, 2, 3, 1, 2, 3, ...] or [3, 1, 2, 3, 1, 2, 3, ...] for pickup beats)

    Returns:
        int: Detected time signature (beats per measure) or None if not detected
    """
    if len(pattern) < 6:
        return None

    # Try different cycle lengths from 2 to 12
    for cycle_len in range(2, 13):
        if len(pattern) >= cycle_len * 2:
            # Try different starting offsets to handle irregular beginnings and pickup beats
            for start_offset in range(min(5, len(pattern) - cycle_len * 2)):
                offset_pattern = pattern[start_offset:]

                if len(offset_pattern) >= cycle_len * 2:
                    # Check if the pattern repeats
                    first_cycle = offset_pattern[:cycle_len]
                    second_cycle = offset_pattern[cycle_len:cycle_len*2]

                    # Check if it's a valid beat pattern (starts with 1 and increments)
                    if (first_cycle == second_cycle and
                        first_cycle[0] == 1 and
                        first_cycle == list(range(1, cycle_len + 1))):

                        # Verify with a third cycle if available
                        if len(offset_pattern) >= cycle_len * 3:
                            third_cycle = offset_pattern[cycle_len*2:cycle_len*3]
                            if first_cycle == third_cycle:
                                log_debug(f"Detected {cycle_len}/4 time signature from pattern at offset {start_offset}: {first_cycle}")
                                return cycle_len
                        else:
                            log_debug(f"Detected {cycle_len}/4 time signature from pattern at offset {start_offset}: {first_cycle}")
                            return cycle_len

    # Special case: Handle pickup beat patterns like [3, 1, 2, 3, 1, 2, 3, ...] for 3/4 time
    # Look for patterns where the first beat is the final beat of a cycle, followed by a regular cycle
    for cycle_len in range(2, 13):
        if len(pattern) >= cycle_len + 2:  # Need at least one pickup + one full cycle
            # Check if pattern starts with the final beat of the cycle, then continues with regular cycle
            if pattern[0] == cycle_len:  # First beat is the final beat number
                # Check if the rest follows the regular pattern [1, 2, 3, ..., cycle_len]
                regular_pattern = pattern[1:cycle_len+1]
                expected_pattern = list(range(1, cycle_len + 1))

                if regular_pattern == expected_pattern:
                    # Verify the pattern repeats
                    if len(pattern) >= cycle_len * 2 + 1:
                        next_cycle = pattern[cycle_len+1:cycle_len*2+1]
                        if next_cycle == expected_pattern:
                            log_debug(f"Detected {cycle_len}/4 time signature from pickup pattern: pickup={pattern[0]}, cycle={expected_pattern}")
                            return cycle_len

    return None


def validate_time_signature(time_signature):
    """
    Validate a time signature value.

    Args:
        time_signature: Time signature to validate (int or string)

    Returns:
        dict: Validation results with 'valid', 'normalized', 'error'
    """
    try:
        if isinstance(time_signature, str):
            # Handle formats like "4/4", "3/4", etc.
            if '/' in time_signature:
                numerator, denominator = time_signature.split('/')
                numerator = int(numerator)
                denominator = int(denominator)
                
                if denominator not in [2, 4, 8, 16]:
                    return {
                        'valid': False,
                        'normalized': None,
                        'error': f'Invalid denominator: {denominator}. Must be 2, 4, 8, or 16'
                    }
                
                return {
                    'valid': True,
                    'normalized': numerator,
                    'error': None
                }
            else:
                # Just a number
                numerator = int(time_signature)
        else:
            numerator = int(time_signature)
        
        if numerator < 1 or numerator > 16:
            return {
                'valid': False,
                'normalized': None,
                'error': f'Invalid time signature: {numerator}. Must be between 1 and 16'
            }
        
        return {
            'valid': True,
            'normalized': numerator,
            'error': None
        }
        
    except (ValueError, TypeError) as e:
        return {
            'valid': False,
            'normalized': None,
            'error': f'Invalid time signature format: {str(e)}'
        }


def get_common_time_signatures():
    """
    Get a list of common time signatures.

    Returns:
        list: List of common time signatures with metadata
    """
    return [
        {'beats': 2, 'name': '2/4', 'description': 'Simple duple meter'},
        {'beats': 3, 'name': '3/4', 'description': 'Simple triple meter (waltz)'},
        {'beats': 4, 'name': '4/4', 'description': 'Common time'},
        {'beats': 5, 'name': '5/4', 'description': 'Quintuple meter'},
        {'beats': 6, 'name': '6/8', 'description': 'Compound duple meter'},
        {'beats': 7, 'name': '7/4', 'description': 'Septuple meter'},
        {'beats': 9, 'name': '9/8', 'description': 'Compound triple meter'},
        {'beats': 12, 'name': '12/8', 'description': 'Compound quadruple meter'}
    ]


def analyze_beat_pattern_consistency(pattern):
    """
    Analyze the consistency of a beat pattern.

    Args:
        pattern: List of beat numbers

    Returns:
        dict: Analysis results with consistency metrics
    """
    if not pattern or len(pattern) < 4:
        return {
            'consistent': False,
            'confidence': 0.0,
            'detected_time_signature': None,
            'irregularities': ['Pattern too short for analysis']
        }
    
    try:
        detected_ts = detect_time_signature_from_pattern(pattern)
        irregularities = []
        
        if detected_ts is None:
            return {
                'consistent': False,
                'confidence': 0.0,
                'detected_time_signature': None,
                'irregularities': ['No consistent time signature detected']
            }
        
        # Check for irregularities
        expected_pattern = list(range(1, detected_ts + 1))
        pattern_length = len(pattern)
        expected_cycles = pattern_length // detected_ts
        
        consistent_beats = 0
        total_beats = 0
        
        for i in range(expected_cycles):
            start_idx = i * detected_ts
            end_idx = start_idx + detected_ts
            
            if end_idx <= pattern_length:
                cycle = pattern[start_idx:end_idx]
                total_beats += len(cycle)
                
                for j, beat in enumerate(cycle):
                    if beat == expected_pattern[j]:
                        consistent_beats += 1
                    else:
                        irregularities.append(f'Beat {start_idx + j + 1}: expected {expected_pattern[j]}, got {beat}')
        
        confidence = consistent_beats / total_beats if total_beats > 0 else 0.0
        
        return {
            'consistent': confidence >= 0.8,
            'confidence': confidence,
            'detected_time_signature': detected_ts,
            'irregularities': irregularities[:10]  # Limit to first 10 irregularities
        }
        
    except Exception as e:
        log_error(f"Error analyzing beat pattern consistency: {e}")
        return {
            'consistent': False,
            'confidence': 0.0,
            'detected_time_signature': None,
            'irregularities': [f'Analysis error: {str(e)}']
        }


def normalize_beat_pattern(pattern, target_time_signature=None):
    """
    Normalize a beat pattern to a consistent time signature.

    Args:
        pattern: List of beat numbers
        target_time_signature: Target time signature (optional, auto-detected if None)

    Returns:
        dict: Normalized pattern and metadata
    """
    if not pattern:
        return {
            'normalized_pattern': [],
            'original_length': 0,
            'normalized_length': 0,
            'time_signature': None,
            'success': False,
            'error': 'Empty pattern'
        }
    
    try:
        if target_time_signature is None:
            target_time_signature = detect_time_signature_from_pattern(pattern)
        
        if target_time_signature is None:
            return {
                'normalized_pattern': pattern,
                'original_length': len(pattern),
                'normalized_length': len(pattern),
                'time_signature': None,
                'success': False,
                'error': 'Could not detect time signature'
            }
        
        # Create normalized pattern
        normalized = []
        expected_pattern = list(range(1, target_time_signature + 1))
        
        for i in range(0, len(pattern), target_time_signature):
            cycle = pattern[i:i + target_time_signature]
            if len(cycle) == target_time_signature:
                normalized.extend(expected_pattern)
            else:
                # Handle incomplete cycle at the end
                normalized.extend(cycle)
        
        return {
            'normalized_pattern': normalized,
            'original_length': len(pattern),
            'normalized_length': len(normalized),
            'time_signature': target_time_signature,
            'success': True,
            'error': None
        }
        
    except Exception as e:
        log_error(f"Error normalizing beat pattern: {e}")
        return {
            'normalized_pattern': pattern,
            'original_length': len(pattern),
            'normalized_length': len(pattern),
            'time_signature': None,
            'success': False,
            'error': str(e)
        }
