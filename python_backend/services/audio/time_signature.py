"""
Time signature detection utilities.

This module provides functions for detecting time signatures from beat patterns.
"""

from typing import List, Optional
from utils.logging import log_debug


def detect_time_signature_from_pattern(pattern: List[int]) -> Optional[int]:
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