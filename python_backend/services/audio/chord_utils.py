"""
Chord processing utilities.

This module provides utility functions for chord processing including
chord simplification, mapping, validation, and format conversion.
"""

import re
from typing import List, Dict, Any, Optional, Tuple
from utils.logging import log_info, log_error, log_debug


def simplify_chord(chord: str) -> str:
    """
    Simplify a chord label to a more basic form.
    
    Args:
        chord: Original chord label
        
    Returns:
        str: Simplified chord label
    """
    if not chord or chord.lower() in ['n', 'none', 'silence']:
        return 'N'
    
    # Remove common extensions and modifications
    simplified = chord
    
    # Remove slash bass notes (e.g., C/E -> C)
    if '/' in simplified:
        simplified = simplified.split('/')[0]
    
    # Remove common extensions
    extensions_to_remove = ['maj7', 'min7', '7', 'maj', 'min', 'dim', 'aug', 'sus2', 'sus4', 'add9', '9', '11', '13']
    for ext in extensions_to_remove:
        simplified = simplified.replace(ext, '')
    
    # Clean up any remaining characters
    simplified = re.sub(r'[^A-G#b]', '', simplified)
    
    return simplified if simplified else 'N'


def normalize_chord_label(chord: str) -> str:
    """
    Normalize a chord label to a standard format.
    
    Args:
        chord: Original chord label
        
    Returns:
        str: Normalized chord label
    """
    if not chord or chord.lower() in ['n', 'none', 'silence']:
        return 'N'
    
    # Convert to standard format
    normalized = chord.strip()
    
    # Standardize flat/sharp notation
    normalized = normalized.replace('♭', 'b').replace('♯', '#')
    
    # Standardize minor notation
    normalized = re.sub(r'\bmin\b', 'm', normalized)
    normalized = re.sub(r'\bmaj\b', '', normalized)
    
    return normalized


def validate_chord_dict(chord_dict: str, available_dicts: List[str]) -> bool:
    """
    Validate that a chord dictionary is supported.
    
    Args:
        chord_dict: Chord dictionary name to validate
        available_dicts: List of available chord dictionaries
        
    Returns:
        bool: True if the chord dictionary is valid
    """
    return chord_dict in available_dicts


def get_default_chord_dict(model_name: str) -> str:
    """
    Get the default chord dictionary for a given model.
    
    Args:
        model_name: Name of the model
        
    Returns:
        str: Default chord dictionary name
    """
    defaults = {
        'chord-cnn-lstm': 'submission',
        'btc-sl': 'large_voca',
        'btc-pl': 'large_voca'
    }
    return defaults.get(model_name, 'submission')


def convert_lab_to_chord_data(lab_content: str) -> List[Dict[str, Any]]:
    """
    Convert lab file content to chord data format.
    
    Args:
        lab_content: Content of a lab file
        
    Returns:
        List of chord annotations
    """
    chord_data = []
    
    for line in lab_content.strip().split('\n'):
        line = line.strip()
        if line:
            parts = line.split('\t')
            if len(parts) >= 3:
                try:
                    start_time = float(parts[0])
                    end_time = float(parts[1])
                    chord = parts[2]
                    
                    chord_data.append({
                        "start_time": start_time,
                        "end_time": end_time,
                        "chord": chord,
                        "confidence": 1.0  # Default confidence
                    })
                except ValueError as e:
                    log_error(f"Error parsing lab line '{line}': {e}")
                    continue
    
    return chord_data


def merge_consecutive_chords(chord_data: List[Dict[str, Any]], tolerance: float = 0.01) -> List[Dict[str, Any]]:
    """
    Merge consecutive chord annotations with the same chord label.
    
    Args:
        chord_data: List of chord annotations
        tolerance: Time tolerance for merging (seconds)
        
    Returns:
        List of merged chord annotations
    """
    if not chord_data:
        return []
    
    merged = []
    current = chord_data[0].copy()
    
    for next_chord in chord_data[1:]:
        # Check if chords are the same and consecutive
        if (current["chord"] == next_chord["chord"] and 
            abs(current["end_time"] - next_chord["start_time"]) <= tolerance):
            # Merge by extending the end time
            current["end_time"] = next_chord["end_time"]
        else:
            # Add current chord and start a new one
            merged.append(current)
            current = next_chord.copy()
    
    # Add the last chord
    merged.append(current)
    
    return merged


def filter_short_chords(chord_data: List[Dict[str, Any]], min_duration: float = 0.1) -> List[Dict[str, Any]]:
    """
    Filter out chord annotations that are too short.
    
    Args:
        chord_data: List of chord annotations
        min_duration: Minimum duration in seconds
        
    Returns:
        List of filtered chord annotations
    """
    filtered = []
    
    for chord in chord_data:
        duration = chord["end_time"] - chord["start_time"]
        if duration >= min_duration:
            filtered.append(chord)
        else:
            log_debug(f"Filtered short chord: {chord['chord']} ({duration:.3f}s)")
    
    return filtered


def calculate_chord_statistics(chord_data: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Calculate statistics about chord annotations.
    
    Args:
        chord_data: List of chord annotations
        
    Returns:
        Dict containing chord statistics
    """
    if not chord_data:
        return {
            "total_chords": 0,
            "unique_chords": 0,
            "average_duration": 0.0,
            "total_duration": 0.0,
            "chord_counts": {}
        }
    
    # Count chord occurrences
    chord_counts = {}
    total_duration = 0.0
    durations = []
    
    for chord in chord_data:
        chord_label = chord["chord"]
        duration = chord["end_time"] - chord["start_time"]
        
        chord_counts[chord_label] = chord_counts.get(chord_label, 0) + 1
        total_duration += duration
        durations.append(duration)
    
    return {
        "total_chords": len(chord_data),
        "unique_chords": len(chord_counts),
        "average_duration": sum(durations) / len(durations) if durations else 0.0,
        "total_duration": total_duration,
        "chord_counts": chord_counts,
        "min_duration": min(durations) if durations else 0.0,
        "max_duration": max(durations) if durations else 0.0
    }


def validate_chord_data(chord_data: List[Dict[str, Any]]) -> Tuple[bool, List[str]]:
    """
    Validate chord data for consistency and correctness.
    
    Args:
        chord_data: List of chord annotations
        
    Returns:
        Tuple of (is_valid, list_of_errors)
    """
    errors = []
    
    if not chord_data:
        errors.append("No chord data provided")
        return False, errors
    
    # Check required fields
    required_fields = ["start_time", "end_time", "chord"]
    for i, chord in enumerate(chord_data):
        for field in required_fields:
            if field not in chord:
                errors.append(f"Chord {i}: Missing required field '{field}'")
        
        # Check time validity
        if "start_time" in chord and "end_time" in chord:
            if chord["start_time"] >= chord["end_time"]:
                errors.append(f"Chord {i}: Invalid time range ({chord['start_time']} >= {chord['end_time']})")
    
    # Check temporal consistency
    for i in range(len(chord_data) - 1):
        current = chord_data[i]
        next_chord = chord_data[i + 1]
        
        if "end_time" in current and "start_time" in next_chord:
            if current["end_time"] > next_chord["start_time"]:
                errors.append(f"Chord {i}-{i+1}: Overlapping time ranges")
    
    return len(errors) == 0, errors


def format_chord_for_display(chord: str) -> str:
    """
    Format a chord label for display purposes.
    
    Args:
        chord: Original chord label
        
    Returns:
        str: Formatted chord label
    """
    if not chord or chord.lower() in ['n', 'none']:
        return 'N'
    
    # Replace flat/sharp with Unicode symbols
    formatted = chord.replace('b', '♭').replace('#', '♯')
    
    return formatted
