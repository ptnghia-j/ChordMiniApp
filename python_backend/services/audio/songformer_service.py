"""SongFormer service wrapper."""

from __future__ import annotations

import importlib.util
import os
import sys
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List
from urllib.parse import urlparse

import requests

from services.audio.tempfiles import temporary_audio_file
from utils.logging import log_debug, log_info
from utils.paths import AUDIO_DIR


class SongFormerService:
    """Thin adapter around the packaged SongFormer runtime."""

    def __init__(self) -> None:
        repo_root = Path(__file__).resolve().parents[3]
        default_root = repo_root / 'SongFormer'

        self.songformer_root = Path(
            os.getenv('SONGFORMER_ROOT', str(default_root))
        ).resolve()
        self.model_name = os.getenv('SONGFORMER_MODEL_NAME', 'SongFormer')
        self.checkpoint = os.getenv('SONGFORMER_CHECKPOINT', 'SongFormer.safetensors')
        self.config_path = os.getenv('SONGFORMER_CONFIG', 'SongFormer.yaml')

        self._module = None
        self._initialized = False
        self._lock = threading.Lock()

        if not (self.songformer_root / 'app.py').exists():
            raise FileNotFoundError(
                f'SongFormer runtime was not found at {self.songformer_root}. '
                'Set SONGFORMER_ROOT to a valid deployment path.'
            )

    @contextmanager
    def _songformer_cwd(self):
        previous_cwd = Path.cwd()
        os.chdir(self.songformer_root)
        try:
            yield
        finally:
            os.chdir(previous_cwd)

    def _load_module(self):
        if self._module is not None:
            return self._module

        app_path = self.songformer_root / 'app.py'
        if not app_path.exists():
            raise FileNotFoundError(
                f'SongFormer runtime was not found at {app_path}. Set SONGFORMER_ROOT to a valid deployment path.'
            )

        with self._lock:
            if self._module is not None:
                return self._module

            module_name = 'songformer_runtime_app'
            spec = importlib.util.spec_from_file_location(module_name, app_path)
            if spec is None or spec.loader is None:
                raise RuntimeError(f'Unable to load SongFormer module from {app_path}')

            if str(self.songformer_root) not in sys.path:
                sys.path.insert(0, str(self.songformer_root))

            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module
            with self._songformer_cwd():
                spec.loader.exec_module(module)

            self._module = module
            log_info(f'SongFormer runtime loaded from {self.songformer_root}')
            return self._module

    def _ensure_initialized(self) -> Any:
        module = self._load_module()
        if self._initialized:
            return module

        with self._lock:
            if self._initialized:
                return module

            with self._songformer_cwd():
                module.initialize_models(
                    self.model_name,
                    checkpoint=self.checkpoint,
                    config_path=self.config_path,
                )

            self._initialized = True
            log_info('SongFormer models initialized')
            return module

    def _segment_file(self, file_path: str) -> Dict[str, Any]:
        module = self._ensure_initialized()
        with self._songformer_cwd():
            msa_output = module.process_audio(file_path)
            cleaned_output = module.rule_post_processing(msa_output)
            segments: List[Dict[str, Any]] = module.format_as_segments(cleaned_output)

        return {
            'segments': segments,
            'model': 'songformer',
            'device': str(getattr(module, 'device', 'unknown')),
        }

    def segment_audio_url(self, audio_url: str) -> Dict[str, Any]:
        if audio_url.startswith('/audio/'):
            local_path = AUDIO_DIR / Path(audio_url).name
            if not local_path.exists():
                raise FileNotFoundError(f'Audio file not found: {audio_url}')
            return self._segment_file(str(local_path))

        if not (audio_url.startswith('http://') or audio_url.startswith('https://')):
            raise ValueError('audioUrl must be an http(s) URL or a /audio/... path')

        parsed = urlparse(audio_url)
        suffix = Path(parsed.path).suffix or '.mp3'
        with temporary_audio_file(suffix=suffix) as temp_path:
            log_debug(f'Downloading SongFormer audio source: {audio_url}')
            response = requests.get(audio_url, stream=True, timeout=180)
            response.raise_for_status()

            with open(temp_path, 'wb') as output_file:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        output_file.write(chunk)

            return self._segment_file(temp_path)