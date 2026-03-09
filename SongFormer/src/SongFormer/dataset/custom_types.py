"""
MsaInfo
	A list of (timestamp, label) tuples used to represent music structure
	analysis (MSA). The first element of the tuple is a float timestamp
	(in seconds) and the second is a string label

Example
-------
	>>> msa: MsaInfo = [(0.0, "intro"), (12.5, "verse"), (34.0, "chorus")]
"""

from typing import List, Tuple

MsaInfo = List[Tuple[float, str]]