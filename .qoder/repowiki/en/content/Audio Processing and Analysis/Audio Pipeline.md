# Audio Pipeline

<cite>
**Referenced Files in This Document**
- [audio_utils.py](file://python_backend/services/audio/audio_utils.py)
- [tempfiles.py](file://python_backend/services/audio/tempfiles.py)
- [audioBufferUtils.ts](file://src/utils/audioBufferUtils.ts)
- [audioExtractionSimplified.ts](file://src/services/audio/audioExtractionSimplified.ts)
- [route.ts](file://src/app/api/extract-audio/route.ts)
- [audioProcessingService.ts](file://src/services/audio/audioProcessingService.ts)
- [ytdownIoAudioService.ts](file://src/services/youtube/ytdownIoAudioService.ts)
- [firebaseStorageSimplified.ts](file://src/services/firebase/firebaseStorageSimplified.ts)
- [urlValidationUtils.ts](file://src/utils/urlValidationUtils.ts)
- [grainPlayerPitchShiftService.ts](file://src/services/audio/grainPlayerPitchShiftService.ts)
- [utils.py](file://sheetsage/src/sheetsage_upstream/sheetsage/utils.py)
- [utils_test.py](file://sheetsage/src/sheetsage_upstream/sheetsage/utils_test.py)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)
10. [Appendices](#appendices)

## Introduction
This document describes the audio pipeline system in ChordMiniApp, focusing on the end-to-end workflow for extracting, preparing, and analyzing audio from YouTube videos. It covers supported formats, extraction strategies, preprocessing steps, quality controls, temporary file management, buffer handling, and performance optimization. Practical examples and error-handling guidance are included to help developers integrate and troubleshoot the pipeline effectively.

## Project Structure
The audio pipeline spans both the frontend and backend:
- Frontend orchestration and UI-driven flows
- Backend APIs for audio extraction and metadata
- Python backend utilities for audio processing and temporary file management
- Third-party integrations for audio extraction and validation

```mermaid
graph TB
subgraph "Frontend"
FE_API["Next.js API route<br/>/api/extract-audio"]
FE_Service["AudioProcessingService"]
FE_Extraction["AudioExtractionSimplified"]
end
subgraph "Backend"
BE_Utils["Python audio_utils.py"]
BE_Temp["Python tempfiles.py"]
BE_Firestore["firebaseStorageSimplified.ts"]
end
subgraph "External Services"
YT_IO["ytdown.io service"]
YT_URL["URL Validation Utils"]
end
FE_API --> FE_Service
FE_Service --> FE_Extraction
FE_Extraction --> YT_IO
FE_Extraction --> BE_Firestore
FE_Extraction --> YT_URL
BE_Firestore --> BE_Temp
BE_Firestore --> BE_Utils
```

**Diagram sources**
- [route.ts:35-73](file://src/app/api/extract-audio/route.ts#L35-L73)
- [audioProcessingService.ts:43-109](file://src/services/audio/audioProcessingService.ts#L43-L109)
- [audioExtractionSimplified.ts:69-120](file://src/services/audio/audioExtractionSimplified.ts#L69-L120)
- [ytdownIoAudioService.ts:75-155](file://src/services/youtube/ytdownIoAudioService.ts#L75-L155)
- [firebaseStorageSimplified.ts:169-216](file://src/services/firebase/firebaseStorageSimplified.ts#L169-L216)
- [audio_utils.py:12-131](file://python_backend/services/audio/audio_utils.py#L12-L131)
- [tempfiles.py:15-136](file://python_backend/services/audio/tempfiles.py#L15-L136)
- [urlValidationUtils.ts:49-104](file://src/utils/urlValidationUtils.ts#L49-L104)

**Section sources**
- [route.ts:35-73](file://src/app/api/extract-audio/route.ts#L35-L73)
- [audioProcessingService.ts:43-109](file://src/services/audio/audioProcessingService.ts#L43-L109)
- [audioExtractionSimplified.ts:69-120](file://src/services/audio/audioExtractionSimplified.ts#L69-L120)
- [ytdownIoAudioService.ts:75-155](file://src/services/youtube/ytdownIoAudioService.ts#L75-L155)
- [firebaseStorageSimplified.ts:169-216](file://src/services/firebase/firebaseStorageSimplified.ts#L169-L216)
- [audio_utils.py:12-131](file://python_backend/services/audio/audio_utils.py#L12-L131)
- [tempfiles.py:15-136](file://python_backend/services/audio/tempfiles.py#L15-L136)
- [urlValidationUtils.ts:49-104](file://src/utils/urlValidationUtils.ts#L49-L104)

## Core Components
- Audio extraction from YouTube:
  - Production extraction via ytdown.io with M4A format
  - Environment-aware selection among yt-dlp, ytdown.io, and yt-mp3-go
  - Caching and permanent storage via Firebase
- Preprocessing utilities:
  - Silence trimming, duration calculation, resampling, and format validation
  - Temporary file management for safe cleanup
- Buffer handling and conversion:
  - Web AudioBuffer to WAV conversion with strict bounds checks
- Quality control:
  - URL accessibility validation, file metadata extraction, and error handling
- Performance optimization:
  - Parallel pipeline for storage and processing, stream URL expiration, and memory-safe operations

**Section sources**
- [audioExtractionSimplified.ts:69-120](file://src/services/audio/audioExtractionSimplified.ts#L69-L120)
- [audio_utils.py:12-131](file://python_backend/services/audio/audio_utils.py#L12-L131)
- [tempfiles.py:15-136](file://python_backend/services/audio/tempfiles.py#L15-L136)
- [audioBufferUtils.ts:4-87](file://src/utils/audioBufferUtils.ts#L4-L87)
- [ytdownIoAudioService.ts:75-155](file://src/services/youtube/ytdownIoAudioService.ts#L75-L155)
- [firebaseStorageSimplified.ts:169-216](file://src/services/firebase/firebaseStorageSimplified.ts#L169-L216)

## Architecture Overview
The pipeline follows a layered approach:
- Frontend triggers extraction via a Next.js API route
- The route delegates to AudioProcessingService, which coordinates AudioExtractionSimplified
- AudioExtractionSimplified selects the extraction strategy, validates URLs, caches metadata, and optionally uploads to Firebase
- Python backend utilities support preprocessing and temporary file lifecycle
- Quality control ensures accessible and valid audio sources

```mermaid
sequenceDiagram
participant Client as "Client"
participant API as "Next.js API route"
participant Service as "AudioProcessingService"
participant Extractor as "AudioExtractionSimplified"
participant YT as "ytdown.io"
participant Store as "Firebase Storage"
Client->>API : POST /api/extract-audio
API->>Service : extractAudioFromYouTube(videoId,...)
Service->>Extractor : extractAudio(videoMetadata, forceRedownload)
Extractor->>YT : Request M4A audio
YT-->>Extractor : Audio URL(s)
Extractor->>Store : Upload audio (parallel)
Store-->>Extractor : Permanent URL
Extractor-->>Service : {audioUrl, fromCache, isStreamUrl, duration}
Service-->>API : Response
API-->>Client : {success, audioUrl, duration,...}
```

**Diagram sources**
- [route.ts:35-73](file://src/app/api/extract-audio/route.ts#L35-L73)
- [audioProcessingService.ts:43-109](file://src/services/audio/audioProcessingService.ts#L43-L109)
- [audioExtractionSimplified.ts:605-799](file://src/services/audio/audioExtractionSimplified.ts#L605-L799)
- [ytdownIoAudioService.ts:87-155](file://src/services/youtube/ytdownIoAudioService.ts#L87-L155)
- [firebaseStorageSimplified.ts:169-216](file://src/services/firebase/firebaseStorageSimplified.ts#L169-L216)

## Detailed Component Analysis

### Audio Extraction from YouTube
- Strategy selection:
  - Environment-aware routing among yt-dlp, ytdown.io, and yt-mp3-go
  - Production preference for ytdown.io with M4A format
- Caching and storage:
  - Firebase Storage for permanent access; fallback to stream URLs with expiration
  - Simplified Firestore cache for metadata retrieval
- URL validation:
  - Pre-validate and test accessibility to avoid downstream failures

```mermaid
flowchart TD
Start(["Start Extraction"]) --> DetectEnv["Detect Environment Strategy"]
DetectEnv --> ChooseSvc{"Strategy"}
ChooseSvc --> |ytdown.io| CallYT["Call ytdown.io API"]
ChooseSvc --> |yt-dlp| CallYTDL["Call yt-dlp"]
ChooseSvc --> |yt-mp3-go| CallYTM["Call yt-mp3-go"]
CallYT --> GotURLs["Receive Audio URLs"]
CallYTDL --> GotURLs
CallYTM --> GotURLs
GotURLs --> ValidateURL["Validate URL Accessibility"]
ValidateURL --> CacheCheck["Check Firebase & Firestore Cache"]
CacheCheck --> CacheHit{"Cache Hit?"}
CacheHit --> |Yes| ReturnCache["Return Cached Result"]
CacheHit --> |No| Upload["Upload to Firebase Storage"]
Upload --> FinalURL["Final Accessible URL"]
FinalURL --> Done(["Done"])
ReturnCache --> Done
```

**Diagram sources**
- [audioExtractionSimplified.ts:84-120](file://src/services/audio/audioExtractionSimplified.ts#L84-L120)
- [audioExtractionSimplified.ts:605-799](file://src/services/audio/audioExtractionSimplified.ts#L605-L799)
- [ytdownIoAudioService.ts:87-155](file://src/services/youtube/ytdownIoAudioService.ts#L87-L155)
- [firebaseStorageSimplified.ts:169-216](file://src/services/firebase/firebaseStorageSimplified.ts#L169-L216)
- [urlValidationUtils.ts:49-104](file://src/utils/urlValidationUtils.ts#L49-L104)

**Section sources**
- [audioExtractionSimplified.ts:84-120](file://src/services/audio/audioExtractionSimplified.ts#L84-L120)
- [audioExtractionSimplified.ts:605-799](file://src/services/audio/audioExtractionSimplified.ts#L605-L799)
- [ytdownIoAudioService.ts:87-155](file://src/services/youtube/ytdownIoAudioService.ts#L87-L155)
- [firebaseStorageSimplified.ts:169-216](file://src/services/firebase/firebaseStorageSimplified.ts#L169-L216)
- [urlValidationUtils.ts:49-104](file://src/utils/urlValidationUtils.ts#L49-L104)

### Audio Utility Functions
- trim_silence_from_audio:
  - Removes silence from beginning and end using librosa effects
  - Returns trimmed waveform, sample rate, and trim timestamps
  - Graceful fallback to original audio on failure
- get_audio_duration:
  - Computes duration using librosa
  - Returns 0.0 on failure
- resample_audio:
  - Loads and resamples audio to target sample rate
  - Raises on failure
- validate_audio_file:
  - Validates loadability by loading a short segment
  - Falls back to filesystem existence check if librosa is unavailable

```mermaid
flowchart TD
A["trim_silence_from_audio(audio_path)"] --> Load["Load audio with librosa"]
Load --> Trim["Trim silence with librosa.effects.trim"]
Trim --> Times["Compute trim start/end times"]
Times --> Save{"Output path provided?"}
Save --> |Yes| Write["Write trimmed audio"]
Save --> |No| Skip["Skip writing"]
Write --> Return1["Return (trimmed, sr, start, end)"]
Skip --> Return1
Load --> Fail1{"Exception?"}
Fail1 --> |Yes| Fallback["Re-load original and return full duration"]
Fallback --> Return1
B["get_audio_duration(audio_path)"] --> L2["Load audio"]
L2 --> Dur["Compute duration with librosa"]
Dur --> RetDur["Return duration or 0.0"]
C["resample_audio(audio_path, target_sr)"] --> L3["Load with target_sr"]
L3 --> RetRs["Return (resampled, sr) or raise"]
D["validate_audio_file(audio_path)"] --> TryLib["Try librosa.load(duration=1s)"]
TryLib --> Ok{"Valid?"}
Ok --> |Yes| True["Return True"]
Ok --> |No| FS["Check file exists and size > 0"]
FS --> RetVal["Return True/False"]
```

**Diagram sources**
- [audio_utils.py:12-131](file://python_backend/services/audio/audio_utils.py#L12-L131)

**Section sources**
- [audio_utils.py:12-131](file://python_backend/services/audio/audio_utils.py#L12-L131)

### Temporary File Management and Buffer Handling
- Temporary file management:
  - Context-managed creation and cleanup of temporary files and directories
  - Dedicated audio file context with sensible prefixes
  - Manual cleanup utility and path generation helpers
- Buffer handling:
  - Web AudioBuffer to WAV conversion with strict bounds checking
  - Robust validation for channels, length, sample rate, and buffer sizes
  - Sample quantization and safe write operations

```mermaid
classDiagram
class TempFiles {
+temporary_file(suffix, prefix, delete) str
+temporary_audio_file(suffix) str
+temporary_directory(prefix) str
+cleanup_temp_file(file_path) bool
+get_temp_file_path(suffix, prefix) str
}
class AudioBufferUtils {
+audioBufferToWav(audioBuffer) Blob
}
TempFiles <.. AudioBufferUtils : "used for temp files in backend"
```

**Diagram sources**
- [tempfiles.py:15-136](file://python_backend/services/audio/tempfiles.py#L15-L136)
- [audioBufferUtils.ts:4-87](file://src/utils/audioBufferUtils.ts#L4-L87)

**Section sources**
- [tempfiles.py:15-136](file://python_backend/services/audio/tempfiles.py#L15-L136)
- [audioBufferUtils.ts:4-87](file://src/utils/audioBufferUtils.ts#L4-L87)

### Quality Control Measures
- URL accessibility validation:
  - Allowed domains and safe timeouts to prevent 403 and timeouts
  - Hostname filtering and optional localhost allowance in development
- File content validation:
  - HEAD requests to verify availability
  - Partial metadata extraction to confirm reasonable durations
- Error handling:
  - Comprehensive try/catch around extraction and storage
  - Graceful degradation to stream URLs with expiration when storage fails

```mermaid
flowchart TD
V["parseAndValidateAudioSourceUrl(url)"] --> CheckDomain["Check hostname against allowed list"]
CheckDomain --> DevLocal{"Development localhost?"}
DevLocal --> |Yes| AllowDev["Allow if enabled"]
DevLocal --> |No| BlockDev["Block"]
AllowDev --> HeadReq["HEAD request to test URL"]
BlockDev --> HeadReq
HeadReq --> Valid{"Response OK?"}
Valid --> |Yes| Meta["Extract metadata (partial)"]
Meta --> Reasonable{"Duration reasonable?"}
Reasonable --> |Yes| Accept["Accept URL"]
Reasonable --> |No| Reject["Reject URL"]
Valid --> |No| Reject
```

**Diagram sources**
- [urlValidationUtils.ts:49-104](file://src/utils/urlValidationUtils.ts#L49-L104)
- [ytdownIoAudioService.ts:160-168](file://src/services/youtube/ytdownIoAudioService.ts#L160-L168)
- [utils.py:267-329](file://sheetsage/src/sheetsage_upstream/sheetsage/utils.py#L267-L329)

**Section sources**
- [urlValidationUtils.ts:49-104](file://src/utils/urlValidationUtils.ts#L49-L104)
- [ytdownIoAudioService.ts:160-168](file://src/services/youtube/ytdownIoAudioService.ts#L160-L168)
- [utils.py:267-329](file://sheetsage/src/sheetsage_upstream/sheetsage/utils.py#L267-L329)

### Practical Examples of Audio Processing Workflows
- Extract audio from a YouTube video:
  - Use AudioProcessingService.extractAudioFromYouTube to trigger extraction
  - The API route handles request parsing and forwards to the simplified extractor
  - The extractor chooses ytdown.io, validates URLs, caches metadata, and returns a usable audio URL
- Preprocess audio:
  - Trim silence with trim_silence_from_audio
  - Validate format with validate_audio_file
  - Resample with resample_audio if needed
- Convert buffers:
  - Convert Web AudioBuffer to WAV using audioBufferToWav for client-side processing

**Section sources**
- [audioProcessingService.ts:43-109](file://src/services/audio/audioProcessingService.ts#L43-L109)
- [route.ts:35-73](file://src/app/api/extract-audio/route.ts#L35-L73)
- [audioExtractionSimplified.ts:605-799](file://src/services/audio/audioExtractionSimplified.ts#L605-L799)
- [audio_utils.py:12-131](file://python_backend/services/audio/audio_utils.py#L12-L131)
- [audioBufferUtils.ts:4-87](file://src/utils/audioBufferUtils.ts#L4-L87)

## Dependency Analysis
- Frontend dependencies:
  - Next.js API route depends on AudioProcessingService
  - AudioProcessingService depends on AudioExtractionSimplified
  - AudioExtractionSimplified depends on ytdown.io service and Firebase utilities
- Backend dependencies:
  - Python audio utilities depend on librosa and soundfile
  - Temporary file management wraps Python’s tempfile and os
- External dependencies:
  - ytdown.io for audio extraction
  - Firebase for storage and caching
  - URL validation utilities for safe access

```mermaid
graph LR
Route["route.ts"] --> APS["audioProcessingService.ts"]
APS --> AES["audioExtractionSimplified.ts"]
AES --> YTIO["ytdownIoAudioService.ts"]
AES --> FSS["firebaseStorageSimplified.ts"]
AES --> UVU["urlValidationUtils.ts"]
PYA["audio_utils.py"] --> Librosa["librosa"]
PYA --> SndFile["soundfile"]
PYT["tempfiles.py"] --> Tmp["tempfile/os"]
```

**Diagram sources**
- [route.ts:35-73](file://src/app/api/extract-audio/route.ts#L35-L73)
- [audioProcessingService.ts:43-109](file://src/services/audio/audioProcessingService.ts#L43-L109)
- [audioExtractionSimplified.ts:69-120](file://src/services/audio/audioExtractionSimplified.ts#L69-L120)
- [ytdownIoAudioService.ts:75-155](file://src/services/youtube/ytdownIoAudioService.ts#L75-L155)
- [firebaseStorageSimplified.ts:169-216](file://src/services/firebase/firebaseStorageSimplified.ts#L169-L216)
- [urlValidationUtils.ts:49-104](file://src/utils/urlValidationUtils.ts#L49-L104)
- [audio_utils.py:12-131](file://python_backend/services/audio/audio_utils.py#L12-L131)
- [tempfiles.py:15-136](file://python_backend/services/audio/tempfiles.py#L15-L136)

**Section sources**
- [route.ts:35-73](file://src/app/api/extract-audio/route.ts#L35-L73)
- [audioProcessingService.ts:43-109](file://src/services/audio/audioProcessingService.ts#L43-L109)
- [audioExtractionSimplified.ts:69-120](file://src/services/audio/audioExtractionSimplified.ts#L69-L120)
- [ytdownIoAudioService.ts:75-155](file://src/services/youtube/ytdownIoAudioService.ts#L75-L155)
- [firebaseStorageSimplified.ts:169-216](file://src/services/firebase/firebaseStorageSimplified.ts#L169-L216)
- [urlValidationUtils.ts:49-104](file://src/utils/urlValidationUtils.ts#L49-L104)
- [audio_utils.py:12-131](file://python_backend/services/audio/audio_utils.py#L12-L131)
- [tempfiles.py:15-136](file://python_backend/services/audio/tempfiles.py#L15-L136)

## Performance Considerations
- Parallel pipeline:
  - Start Firebase upload in parallel with immediate processing to reduce latency
- Stream URL optimization:
  - Prefer direct URLs when compatible with backend to avoid extra downloads
- Memory optimization:
  - Use AudioBuffer to WAV conversion with strict bounds to prevent oversized buffers
  - Validate sample rates and channel counts to avoid unnecessary conversions
- Caching:
  - Firebase Storage cache reduces repeated downloads
  - Simplified Firestore cache accelerates metadata retrieval

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- Corrupted or incompatible files:
  - Use validate_audio_file to detect invalid formats
  - For librosa-dependent operations, catch exceptions and fall back to filesystem checks
- Format compatibility issues:
  - ytdown.io extracts M4A; ensure downstream processing supports it
  - Use validate_file_content_with_metadata to verify real duration and accessibility
- Network and timeout issues:
  - Apply URL validation with safe timeouts
  - Retry mechanisms in storage upload services
- Large audio files:
  - Prefer direct URL processing when possible
  - Use temporary file management to avoid disk exhaustion

**Section sources**
- [audio_utils.py:111-131](file://python_backend/services/audio/audio_utils.py#L111-L131)
- [ytdownIoAudioService.ts:499-535](file://src/services/youtube/ytMp3GoService.ts#L499-L535)
- [urlValidationUtils.ts:49-104](file://src/utils/urlValidationUtils.ts#L49-L104)
- [grainPlayerPitchShiftService.ts:385-422](file://src/services/audio/grainPlayerPitchShiftService.ts#L385-L422)

## Conclusion
The ChordMiniApp audio pipeline combines robust extraction, preprocessing, and quality control to deliver reliable audio processing. By leveraging environment-aware strategies, caching, and validation, it minimizes failures and optimizes performance. The provided utilities and patterns enable scalable handling of diverse audio sources and formats.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Supported Formats and Extraction Details
- MP3, WAV, FLAC, M4A:
  - Extraction primarily produces M4A via ytdown.io
  - Python utilities support decoding/encoding with librosa and soundfile
  - Sheetsage upstream demonstrates decoding/encoding across formats and options like mono, normalization, and duration/offset

**Section sources**
- [ytdownIoAudioService.ts:97-126](file://src/services/youtube/ytdownIoAudioService.ts#L97-L126)
- [utils.py:267-329](file://sheetsage/src/sheetsage_upstream/sheetsage/utils.py#L267-L329)
- [utils_test.py:149-171](file://sheetsage/src/sheetsage_upstream/sheetsage/utils_test.py#L149-L171)

### Preprocessing Operations Reference
- Silence trimming:
  - trim_silence_from_audio with configurable thresholds and frame sizes
- Duration calculation:
  - get_audio_duration using librosa
- Resampling:
  - resample_audio to target sample rate
- Normalization:
  - Optional normalization in decoding utilities

**Section sources**
- [audio_utils.py:12-131](file://python_backend/services/audio/audio_utils.py#L12-L131)
- [utils.py:267-329](file://sheetsage/src/sheetsage_upstream/sheetsage/utils.py#L267-L329)

### Temporary File and Buffer Utilities
- Temporary file management:
  - Context managers for safe creation and cleanup
  - Helpers for audio-specific temp files and directories
- Buffer conversion:
  - audioBufferToWav with strict validation and safe quantization

**Section sources**
- [tempfiles.py:15-136](file://python_backend/services/audio/tempfiles.py#L15-L136)
- [audioBufferUtils.ts:4-87](file://src/utils/audioBufferUtils.ts#L4-L87)