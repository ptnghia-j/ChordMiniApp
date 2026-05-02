# Adding New Models

<cite>
**Referenced Files in This Document**
- [app_factory.py](file://python_backend/app_factory.py)
- [paths.py](file://python_backend/utils/paths.py)
- [chord_mappings.py](file://python_backend/utils/chord_mappings.py)
- [chord_recognition_service.py](file://python_backend/services/audio/chord_recognition_service.py)
- [chords validators.py](file://python_backend/blueprints/chords/validators.py)
- [chords routes.py](file://python_backend/blueprints/chords/routes.py)
- [audioAnalysis.ts](file://src/types/audioAnalysis.ts)
- [modelFiltering.ts](file://src/utils/modelFiltering.ts)
- [useModelState.ts](file://src/hooks/chord-analysis/useModelState.ts)
- [HeroUIChordModelSelector.tsx](file://src/components/analysis/HeroUIChordModelSelector.tsx)
- [chordService.ts](file://src/services/chord-analysis/chordService.ts)
- [model-info route.ts](file://src/app/api/model-info/route.ts)
</cite>

## Introduction
This guide explains the reusable pattern for adding a new machine learning model to ChordMiniApp. The pattern is model-agnostic: it applies to beat detectors, chord recognizers, segmentation models, melody transcription services, or future audio/text models. After the general workflow, this page includes a concrete chord-recognition example using exact files from the current codebase.

## General Model Extension Pattern

### 1. Define the model boundary
Before adding code, decide the model's domain and normalized contract:
- Domain: beat detection, chord recognition, segmentation, melody transcription, lyrics/text processing, or another feature area.
- Input: uploaded file, server file path, Firebase/offload URL, JSON payload, or a combination.
- Output: the normalized response shape consumed by existing services and UI.
- Runtime needs: checkpoint files, config files, Python packages, device requirements, temporary files, and size/time limits.

Every model should expose stable metadata: id, display name, description, availability, supported options, default option, and size or runtime limits.

### 2. Place model assets and path constants
Store code, configs, and checkpoints under the backend model area that matches the feature. Current patterns include:
- `python_backend/models/<ModelName>/` for Python model code and checkpoints.
- `python_backend/config/` for backend-owned config files shared by wrappers.
- Dedicated service folders, such as `SongFormer/` or `sheetsage/`, for independent services.

Add path constants in `python_backend/utils/paths.py` when the model needs stable imports, checkpoint lookup, config lookup, or validation. Include the new model in `setup_model_paths()` only when Python imports must resolve modules from that directory.

### 3. Add a detector or service wrapper
Do not call raw model code directly from routes. Add a wrapper in the relevant service area:
- Detector-style models usually live under `python_backend/services/detectors/`.
- Orchestrators and domain services live under `python_backend/services/audio/`, `python_backend/services/lyrics/`, or another feature-specific service package.

The wrapper should provide:
- An availability check that verifies required files, imports, packages, and optional device support.
- A single inference method that accepts the domain input and returns the normalized result.
- A metadata method used by model-info endpoints.
- Cleanup of temporary files and restoration of any changed working directory or `sys.path` state.

### 4. Register the model in backend orchestration
Register the wrapper in the domain service that selects and invokes models. For example, model orchestration may include:
- A detector registry keyed by model id.
- File size or duration limits.
- Automatic fallback order.
- Supported options or vocabulary validation.
- Model metadata aggregation.

Flask services are initialized from `python_backend/app_factory.py` and stored in `app.extensions['services']`. If the model belongs to an existing domain, extend that domain service instead of creating a parallel route stack.

### 5. Expose or reuse Flask endpoints
Prefer existing domain endpoints when they already accept a model id or detector parameter. Add new Flask endpoints only when the input/output contract is genuinely different.

Current examples:
- Beat model discovery: `GET /api/model-info`.
- Chord model discovery: `GET /api/chord-model-info`.
- Chord inference: `POST /api/recognize-chords` with `detector`.

When a model adds a new request option, update the relevant blueprint validator before updating frontend calls.

### 6. Add Next.js proxy routes only when useful
The frontend usually calls a Next.js API route, which then proxies to Flask or handles production-specific upload/offload behavior. Add a dedicated Next route only when the UI or legacy clients benefit from a stable alias.

If the existing route already accepts a model id, prefer extending:
- Request form fields and validation.
- Fallback model metadata.
- Timeout and error messages.
- Offload/Firebase proxy behavior, if the model supports production offload.

### 7. Update frontend model selection
Expose the model to the UI in the same layer where related models are listed:
- Type unions for allowed model ids.
- Environment-aware filtering for local-only or experimental models.
- LocalStorage validation and safe fallback selection.
- Selector labels, descriptions, and availability handling.
- Service calls that append the correct `detector`, `model`, and model-specific options.

Keep production availability explicit. If a model needs local checkpoints or unsupported packages, hide it unless an environment flag enables it.

### 8. Validate end to end
At minimum, verify:
- Metadata endpoint lists the model and reports accurate availability.
- Invalid model ids are rejected with clear errors.
- Inference returns the expected normalized response shape.
- Frontend selectors render the model only in supported environments.
- The selected model id reaches the backend unchanged.
- Fallback behavior is visible when the requested model is unavailable.

## Worked Example: Adding A Chord Recognition Model
The example below adds a hypothetical chord model with id `my-chord-model`. Use this as a checklist, not as a requirement that every future model must be chord-specific.

### Backend files to add or update

1. Add the detector wrapper:
   - New file: `python_backend/services/detectors/my_chord_model_detector.py`
   - Implement methods matching the current chord detector pattern:
     - `is_available() -> bool`
     - `recognize_chords(file_path: str, chord_dict: str = ..., **kwargs) -> dict`
     - `get_supported_chord_dicts() -> list[str]`
     - `get_model_info() -> dict`
   - Return normalized chord results:
     ```json
     {
       "success": true,
       "chords": [
         { "start": 0.0, "end": 1.5, "chord": "C:maj", "confidence": 0.92 }
       ],
       "total_chords": 1,
       "duration": 1.5,
       "model_used": "my-chord-model",
       "model_name": "My Chord Model",
       "chord_dict": "large_voca",
       "processing_time": 0.4
     }
     ```

2. Add path constants if needed:
   - Update `python_backend/utils/paths.py`.
   - Add a model directory constant such as `MY_CHORD_MODEL_DIR`.
   - Add checkpoint/config constants if the detector needs stable lookup.
   - Add the model directory to `setup_model_paths()` only if imports require it.

3. Register chord vocabulary support:
   - Update `python_backend/utils/chord_mappings.py`.
   - Add `my-chord-model` to `MODEL_CHORD_DICT_MAPPING`.
   - Add its default dictionary to `DEFAULT_CHORD_DICTS`.
   - Add a new dictionary entry only if the model uses a vocabulary that does not already exist.

4. Register the detector:
   - Update `python_backend/services/audio/chord_recognition_service.py`.
   - Import `MyChordModelDetectorService`.
   - Add it to `self.detectors` with key `my-chord-model`.
   - Add a `self.size_limits['my-chord-model']` value.
   - Include it in explicit detector handling, automatic selection, and fallback ordering if it should participate in `auto`.

5. Update request validation:
   - Update `python_backend/blueprints/chords/validators.py`.
   - Add `my-chord-model` to valid detector lists.
   - Add a file-size entry in `validate_file_size()`.
   - Update display names in `get_detector_display_name()`.

6. Confirm route exposure:
   - `python_backend/blueprints/chords/routes.py` already exposes `POST /api/recognize-chords` and `GET /api/chord-model-info`.
   - No new Flask route is needed if `my-chord-model` uses the same audio-file chord-recognition contract.

### Frontend files to update

1. Add the model id to shared types:
   - `src/types/audioAnalysis.ts`
   - Add `my-chord-model` to `ChordDetectorType`.

2. Update model filtering and endpoint selection:
   - `src/utils/modelFiltering.ts`
   - Add the id to `ChordDetectorType` and `getAvailableChordModels()`.
   - Decide whether production should show the model.
   - Add a description in `getModelDescription()`.
   - If using the unified endpoint, return `/api/recognize-chords` from `getChordRecognitionEndpoint()`.
   - If creating a dedicated alias, return `/api/recognize-chords-my-chord-model`.

3. Update persisted selection validation:
   - `src/hooks/chord-analysis/useModelState.ts`
   - Add `my-chord-model` to the saved-value allowlist.

4. Update selector metadata:
   - `src/components/analysis/HeroUIChordModelSelector.tsx`
   - Add fallback metadata in `defaultModelOptions`.
   - Add an icon branch only if the existing default is not enough.

5. Update chord service request parameters:
   - `src/services/chord-analysis/chordService.ts`
   - Ensure `detector` and `model` append `my-chord-model`.
   - Choose the correct `chord_dict` for the new model.

6. Update fallback model info:
   - `src/app/api/model-info/route.ts`
   - Add the new model to fallback chord metadata so the selector still renders if Flask is unavailable.

7. Optional dedicated Next route:
   - Add `src/app/api/recognize-chords-my-chord-model/route.ts` only if an alias is needed.
   - The route should verify App Check, set `detector=my-chord-model`, and proxy to Flask `POST /api/recognize-chords`.

### Smoke checks for the chord example
Run these checks after implementing the code:

```bash
curl http://localhost:5001/api/chord-model-info
curl -X POST http://localhost:5001/api/recognize-chords \
  -F file=@/path/to/audio.mp3 \
  -F detector=my-chord-model \
  -F chord_dict=large_voca
npm run lint
npm run test -- --runInBand
```

Also verify the analysis page:
- The selector includes `my-chord-model` in supported environments.
- Selecting the model persists in `localStorage`.
- The request sends `detector=my-chord-model`.
- The UI handles unavailable-model fallback without crashing.

## Documentation Checklist
When adding any model, update the relevant wiki pages:
- API endpoint docs for request parameters and response examples.
- Backend service or blueprint docs for route/service flow.
- Machine learning model docs for model capabilities and limitations.
- Frontend model selector docs if users can choose the model.
- Troubleshooting docs for missing checkpoints, package errors, timeout behavior, and production availability.

