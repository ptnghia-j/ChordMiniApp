import io
import json
import logging
import os
import sys
import threading
import types
from pathlib import Path
from typing import Any, Dict, List, Optional

import pretty_midi

ROOT_DIR = Path(__file__).resolve().parent
UPSTREAM_DIR = ROOT_DIR / "src" / "sheetsage_upstream"
SHEETSAGE_CACHE_DIR = Path(
    os.getenv("SHEETSAGE_CACHE_DIR", str(ROOT_DIR / "cache"))
).resolve()

os.environ.setdefault("SHEETSAGE_CACHE_DIR", str(SHEETSAGE_CACHE_DIR))

if str(UPSTREAM_DIR) not in sys.path:
    sys.path.insert(0, str(UPSTREAM_DIR))


def _install_jukebox_stub() -> None:
    module_name = "sheetsage.representations.jukebox"
    if module_name in sys.modules:
        return

    stub_module = types.ModuleType(module_name)

    class Jukebox:  # pragma: no cover - defensive stub for disabled feature path
        def __init__(self, *_args: Any, **_kwargs: Any) -> None:
            raise RuntimeError(
                "Jukebox support is disabled in this Sheet Sage service build."
            )

    stub_module.Jukebox = Jukebox
    sys.modules[module_name] = stub_module


_install_jukebox_stub()

from sheetsage.align import create_beat_to_time_fn  # noqa: E402
from sheetsage.assets import retrieve_asset  # noqa: E402
from sheetsage.infer import sheetsage as run_sheetsage  # noqa: E402
from sheetsage.utils import compute_checksum  # noqa: E402

logger = logging.getLogger(__name__)
UPSTREAM_ASSET_MANIFEST_PATH = (
    UPSTREAM_DIR / "sheetsage" / "assets" / "sheetsage.json"
)

REQUIRED_ASSET_TAGS = (
    "SHEETSAGE_V02_HANDCRAFTED_MOMENTS",
    "SHEETSAGE_V02_HANDCRAFTED_MELODY_CFG",
    "SHEETSAGE_V02_HANDCRAFTED_MELODY_MODEL",
)


class SheetSageAssetUnavailableError(RuntimeError):
    """Raised when required upstream Sheet Sage model assets cannot be retrieved."""


def _load_required_asset_manifest() -> Dict[str, Dict[str, Any]]:
    with open(UPSTREAM_ASSET_MANIFEST_PATH, "r") as manifest_file:
        manifest = json.load(manifest_file)

    return {
        tag: manifest[tag]
        for tag in REQUIRED_ASSET_TAGS
        if tag in manifest
    }


def _resolve_checksum_algorithm(checksum: Optional[str]) -> Optional[str]:
    if checksum is None:
        return None
    if len(checksum) == 32:
        return "md5"
    if len(checksum) == 40:
        return "sha1"
    if len(checksum) == 64:
        return "sha256"
    raise ValueError("Unknown checksum algorithm")


def _build_asset_details(tag: str, asset: Dict[str, Any]) -> Dict[str, Any]:
    relative_path = str(asset["path"])
    absolute_path = str(SHEETSAGE_CACHE_DIR / relative_path)
    checksum = asset.get("checksum")
    algorithm = _resolve_checksum_algorithm(checksum)
    asset_details = {
        "tag": tag,
        "relativePath": relative_path,
        "absolutePath": absolute_path,
        "url": asset.get("url"),
        "checksum": checksum,
        "checksumAlgorithm": algorithm,
        "exists": False,
        "verified": False,
        "error": None,
    }

    path = Path(absolute_path)
    if not path.is_file():
        asset_details["error"] = "Missing file"
        return asset_details

    asset_details["exists"] = True

    try:
        if algorithm is not None:
            computed_checksum = compute_checksum(path, algorithm=algorithm)
            asset_details["computedChecksum"] = computed_checksum
            if computed_checksum != checksum:
                asset_details["error"] = "Checksum mismatch"
                return asset_details
        asset_details["verified"] = True
        return asset_details
    except Exception as exc:  # pragma: no cover - defensive verification path
        asset_details["error"] = str(exc)
        return asset_details


class SheetSageRuntime:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._initialized = False
        self._use_jukebox = False
        self._detect_melody = True
        self._detect_harmony = False
        self._measures_per_chunk = int(os.getenv("SHEETSAGE_MEASURES_PER_CHUNK", "8"))

    @property
    def is_initialized(self) -> bool:
        return self._initialized

    def get_required_asset_details(self) -> List[Dict[str, Any]]:
        manifest = _load_required_asset_manifest()
        return [
            _build_asset_details(tag, manifest[tag])
            for tag in REQUIRED_ASSET_TAGS
            if tag in manifest
        ]

    def get_runtime_info(self):
        return {
            "pythonVersion": sys.version.split()[0],
            "useJukebox": self._use_jukebox,
            "detectMelody": self._detect_melody,
            "detectHarmony": self._detect_harmony,
            "measuresPerChunk": self._measures_per_chunk,
            "cacheDir": str(SHEETSAGE_CACHE_DIR),
            "upstreamRepository": str(UPSTREAM_DIR),
            "requiredAssets": list(REQUIRED_ASSET_TAGS),
            "requiredAssetDetails": self.get_required_asset_details(),
            "initialized": self.is_initialized,
            "experimental": True,
            "license": "Models/data remain subject to upstream CC BY-NC-SA and other third-party terms.",
        }

    def ensure_initialized(self) -> None:
        if self._initialized:
            return

        with self._lock:
            if self._initialized:
                return

            SHEETSAGE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
            try:
                for tag in REQUIRED_ASSET_TAGS:
                    retrieve_asset(tag, log=False)
            except Exception as exc:
                raise SheetSageAssetUnavailableError(
                    "Sheet Sage could not download its required upstream assets. "
                    "The configured asset host is returning an access error. "
                    "This service cannot transcribe until those files are manually seeded into "
                    f"{SHEETSAGE_CACHE_DIR} or the upstream asset URLs are replaced. "
                    f"Required tags: {', '.join(REQUIRED_ASSET_TAGS)}."
                ) from exc
            self._initialized = True

    def transcribe_file(
        self,
        audio_path,
        source_name=None,
    ):
        self.ensure_initialized()

        def status_change_callback(status: Any) -> None:
            status_name = getattr(status, "name", str(status))
            logger.info("Sheet Sage status: %s", status_name)

        measures_per_chunk = max(1, self._measures_per_chunk)
        try:
            while True:
                try:
                    lead_sheet, segment_beats, segment_beats_times = run_sheetsage(
                        audio_path,
                        use_jukebox=self._use_jukebox,
                        measures_per_chunk=measures_per_chunk,
                        detect_melody=self._detect_melody,
                        detect_harmony=self._detect_harmony,
                        status_change_callback=status_change_callback,
                    )
                    if measures_per_chunk != self._measures_per_chunk:
                        logger.info(
                            "Sheet Sage succeeded after reducing measures_per_chunk from %s to %s",
                            self._measures_per_chunk,
                            measures_per_chunk,
                        )
                        self._measures_per_chunk = measures_per_chunk
                    break
                except NotImplementedError as exc:
                    message = str(exc)
                    if (
                        "Dynamic chunking not implemented" not in message
                        or measures_per_chunk <= 1
                    ):
                        raise RuntimeError(
                            "Sheet Sage chunking failed even at measures_per_chunk=1. "
                            "Try a shorter audio segment or inspect upstream chunking behavior."
                        ) from exc

                    next_measures_per_chunk = max(1, measures_per_chunk // 2)
                    logger.warning(
                        "Sheet Sage chunking failed at measures_per_chunk=%s; retrying with %s",
                        measures_per_chunk,
                        next_measures_per_chunk,
                    )
                    if next_measures_per_chunk == measures_per_chunk:
                        next_measures_per_chunk = 1
                    measures_per_chunk = next_measures_per_chunk
        except FileNotFoundError as exc:
            missing = exc.filename or str(exc)
            raise RuntimeError(
                f"Missing Sheet Sage system dependency: {missing}. "
                "Install DBNDownBeatTracker / melisma-key or use the Docker image."
            ) from exc
        except Exception:
            raise

        pulse_to_time_fn = create_beat_to_time_fn(segment_beats, segment_beats_times)
        midi_bytes = lead_sheet.as_midi(pulse_to_time_fn=pulse_to_time_fn)
        midi = pretty_midi.PrettyMIDI(io.BytesIO(midi_bytes))
        melody_instruments = [instrument for instrument in midi.instruments if not instrument.is_drum]
        melody_instrument = melody_instruments[-1] if melody_instruments else None

        note_events = []
        if melody_instrument is not None:
            note_events = [
                {
                    "onset": float(note.start),
                    "offset": float(note.end),
                    "pitch": int(note.pitch),
                    "velocity": int(note.velocity),
                }
                for note in melody_instrument.notes
            ]
        note_events.sort(key=lambda event: (event["onset"], event["pitch"], event["offset"]))

        meter_changes, tempo_changes, *_rest = lead_sheet
        beats_per_measure = int(meter_changes[0][1][0]) if len(meter_changes) > 0 else 4
        tempo_bpm = int(tempo_changes[0][1][0]) if len(tempo_changes) > 0 else 120

        return {
            "source": "sheetsage",
            "sourceName": source_name,
            "noteEvents": note_events,
            "noteEventCount": len(note_events),
            "beatTimes": [float(time) for time in segment_beats_times],
            "beatsPerMeasure": beats_per_measure,
            "tempoBpm": tempo_bpm,
            "usedJukebox": self._use_jukebox,
        }
