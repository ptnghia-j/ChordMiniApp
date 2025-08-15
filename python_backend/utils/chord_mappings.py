"""
Chord dictionary mappings and vocabulary management.

This module centralizes chord dictionary mappings and provides utilities
for managing different chord vocabularies used by various models.
"""

from typing import Dict, List, Set, Optional
from utils.logging import log_debug


# Chord dictionary definitions
CHORD_DICTIONARIES = {
    'full': {
        'description': 'Full chord vocabulary with all extensions',
        'size': 'Large (500+ chords)',
        'models': ['chord-cnn-lstm'],
        'extensions': True,
        'inversions': True,
        'complex_chords': True
    },
    'ismir2017': {
        'description': 'ISMIR 2017 standard chord vocabulary',
        'size': 'Medium (170 chords)',
        'models': ['chord-cnn-lstm'],
        'extensions': True,
        'inversions': False,
        'complex_chords': False
    },
    'submission': {
        'description': 'Standard submission format for chord recognition',
        'size': 'Medium (100-200 chords)',
        'models': ['chord-cnn-lstm'],
        'extensions': False,
        'inversions': False,
        'complex_chords': False
    },
    'extended': {
        'description': 'Extended chord vocabulary with common extensions',
        'size': 'Large (300+ chords)',
        'models': ['chord-cnn-lstm'],
        'extensions': True,
        'inversions': True,
        'complex_chords': False
    },
    'large_voca': {
        'description': 'Large vocabulary for transformer models (170 chords)',
        'size': 'Large (170 chords)',
        'models': ['btc-sl', 'btc-pl'],
        'extensions': True,
        'inversions': True,
        'complex_chords': True
    }
}

# Model-specific chord dictionary mappings
MODEL_CHORD_DICT_MAPPING = {
    'chord-cnn-lstm': ['full', 'ismir2017', 'submission', 'extended'],
    'btc-sl': ['large_voca'],
    'btc-pl': ['large_voca']
}

# Default chord dictionaries for each model
DEFAULT_CHORD_DICTS = {
    'chord-cnn-lstm': 'submission',
    'btc-sl': 'large_voca',
    'btc-pl': 'large_voca'
}

# Common chord symbols and their variations
CHORD_SYMBOL_VARIATIONS = {
    'major': ['', 'maj', 'M'],
    'minor': ['m', 'min', '-'],
    'diminished': ['dim', 'o', '°'],
    'augmented': ['aug', '+'],
    'dominant7': ['7'],
    'major7': ['maj7', 'M7', 'Δ7'],
    'minor7': ['m7', 'min7', '-7'],
    'diminished7': ['dim7', 'o7', '°7'],
    'half_diminished': ['m7b5', 'ø7'],
    'suspended2': ['sus2'],
    'suspended4': ['sus4', 'sus'],
    'add9': ['add9', '(add9)'],
    'major9': ['maj9', 'M9'],
    'minor9': ['m9', 'min9'],
    'dominant9': ['9'],
    'major11': ['maj11', 'M11'],
    'minor11': ['m11', 'min11'],
    'dominant11': ['11'],
    'major13': ['maj13', 'M13'],
    'minor13': ['m13', 'min13'],
    'dominant13': ['13']
}

# Root note variations
ROOT_NOTE_VARIATIONS = {
    'C': ['C'],
    'C#': ['C#', 'Db'],
    'D': ['D'],
    'D#': ['D#', 'Eb'],
    'E': ['E'],
    'F': ['F'],
    'F#': ['F#', 'Gb'],
    'G': ['G'],
    'G#': ['G#', 'Ab'],
    'A': ['A'],
    'A#': ['A#', 'Bb'],
    'B': ['B']
}


def get_supported_chord_dicts(model_name: str) -> List[str]:
    """
    Get supported chord dictionaries for a model.
    
    Args:
        model_name: Name of the model
        
    Returns:
        List of supported chord dictionary names
    """
    return MODEL_CHORD_DICT_MAPPING.get(model_name, [])


def get_default_chord_dict(model_name: str) -> str:
    """
    Get the default chord dictionary for a model.
    
    Args:
        model_name: Name of the model
        
    Returns:
        Default chord dictionary name
    """
    return DEFAULT_CHORD_DICTS.get(model_name, 'submission')


def validate_chord_dict_for_model(chord_dict: str, model_name: str) -> bool:
    """
    Validate that a chord dictionary is supported by a model.
    
    Args:
        chord_dict: Chord dictionary name
        model_name: Model name
        
    Returns:
        bool: True if the combination is valid
    """
    supported_dicts = get_supported_chord_dicts(model_name)
    return chord_dict in supported_dicts


def get_chord_dict_info(chord_dict: str) -> Optional[Dict]:
    """
    Get information about a chord dictionary.
    
    Args:
        chord_dict: Chord dictionary name
        
    Returns:
        Dict containing chord dictionary information, or None if not found
    """
    return CHORD_DICTIONARIES.get(chord_dict)


def get_all_chord_dicts() -> Dict[str, Dict]:
    """
    Get all available chord dictionaries.
    
    Returns:
        Dict mapping chord dictionary names to their information
    """
    return CHORD_DICTIONARIES.copy()


def normalize_chord_symbol(chord: str) -> str:
    """
    Normalize a chord symbol to a standard format.
    
    Args:
        chord: Original chord symbol
        
    Returns:
        Normalized chord symbol
    """
    if not chord or chord.lower() in ['n', 'none', 'silence']:
        return 'N'
    
    # Remove whitespace
    normalized = chord.strip()
    
    # Standardize flat/sharp notation
    normalized = normalized.replace('♭', 'b').replace('♯', '#')
    
    # Standardize enharmonic equivalents to sharp notation
    enharmonic_map = {
        'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'
    }
    
    for flat_note, sharp_note in enharmonic_map.items():
        if normalized.startswith(flat_note):
            normalized = normalized.replace(flat_note, sharp_note, 1)
    
    return normalized


def get_chord_complexity_score(chord: str) -> int:
    """
    Calculate a complexity score for a chord.
    
    Args:
        chord: Chord symbol
        
    Returns:
        int: Complexity score (0-10, higher = more complex)
    """
    if not chord or chord.lower() in ['n', 'none']:
        return 0
    
    score = 1  # Base score for any chord
    
    # Add points for extensions
    extensions = ['7', '9', '11', '13', 'add', 'sus', 'dim', 'aug']
    for ext in extensions:
        if ext in chord.lower():
            score += 1
    
    # Add points for slash chords (inversions)
    if '/' in chord:
        score += 2
    
    # Add points for complex symbols
    complex_symbols = ['maj', 'min', 'dim', 'aug', 'sus', 'add']
    for symbol in complex_symbols:
        if symbol in chord.lower():
            score += 1
    
    return min(score, 10)  # Cap at 10


def filter_chords_by_complexity(chords: List[str], max_complexity: int = 5) -> List[str]:
    """
    Filter chords by complexity score.
    
    Args:
        chords: List of chord symbols
        max_complexity: Maximum allowed complexity score
        
    Returns:
        List of filtered chord symbols
    """
    filtered = []
    for chord in chords:
        if get_chord_complexity_score(chord) <= max_complexity:
            filtered.append(chord)
        else:
            log_debug(f"Filtered complex chord: {chord} (score: {get_chord_complexity_score(chord)})")
    
    return filtered


def get_chord_dict_statistics() -> Dict[str, Dict]:
    """
    Get statistics about all chord dictionaries.
    
    Returns:
        Dict containing statistics for each chord dictionary
    """
    stats = {}
    
    for dict_name, dict_info in CHORD_DICTIONARIES.items():
        stats[dict_name] = {
            'name': dict_name,
            'description': dict_info['description'],
            'size': dict_info['size'],
            'supported_models': dict_info['models'],
            'features': {
                'extensions': dict_info['extensions'],
                'inversions': dict_info['inversions'],
                'complex_chords': dict_info['complex_chords']
            }
        }
    
    return stats


def suggest_chord_dict(model_name: str, complexity_preference: str = 'medium') -> str:
    """
    Suggest the best chord dictionary for a model and complexity preference.
    
    Args:
        model_name: Name of the model
        complexity_preference: 'simple', 'medium', or 'complex'
        
    Returns:
        Suggested chord dictionary name
    """
    supported_dicts = get_supported_chord_dicts(model_name)
    
    if not supported_dicts:
        return 'submission'  # Fallback
    
    # Complexity preferences
    complexity_map = {
        'simple': ['submission', 'ismir2017'],
        'medium': ['ismir2017', 'extended', 'large_voca'],
        'complex': ['full', 'extended', 'large_voca']
    }
    
    preferred_dicts = complexity_map.get(complexity_preference, ['submission'])
    
    # Find the first supported dictionary that matches the preference
    for preferred in preferred_dicts:
        if preferred in supported_dicts:
            return preferred
    
    # Fallback to the first supported dictionary
    return supported_dicts[0]
