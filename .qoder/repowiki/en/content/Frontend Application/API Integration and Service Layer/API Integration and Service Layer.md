# API Integration and Service Layer

<cite>
**Referenced Files in This Document**
- [apiService.ts](file://src/services/api/apiService.ts)
- [rateLimiting.ts](file://src/utils/rateLimiting.ts)
- [parallelPipelineService.ts](file://src/services/api/parallelPipelineService.ts)
- [segmentationAsyncService.ts](file://src/services/api/segmentationAsyncService.ts)
- [segmentationAsyncService.ts](file://src/services/api/segmentationAsyncService.ts)
- [lyricsService.ts](file://src/services/lyrics/lyricsService.ts)
- [lrclibService.ts](file://src/services/lyrics/lrclibService.ts)
- [customMusicAiClient.ts](file://src/services/api/customMusicAiClient.ts)
- [firebase.ts](file://src/config/firebase.ts)
- [streamingFirebaseUpload.ts](file://src/services/firebase/streamingFirebaseUpload.ts)
- [api.ts](file://src/config/api.ts)
- [genius_service.py](file://python_backend/services/lyrics/genius_service.py)
- [lrclib_service.py](file://python_backend/services/lyrics/lrclib_service.py)
- [orchestrator.py](file://python_backend/services/lyrics/orchestrator.py)
- [error_handlers.py](file://python_backend/error_handlers.py)
- [app.py](file://python_backend/app.py)
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

## Introduction
This document explains the API integration architecture, focusing on the service layer pattern, API client implementations, and robust error handling strategies. It covers integrations with backend services, Firebase, and external APIs such as Genius and LRClib. It also documents caching mechanisms, rate limiting, retry strategies, and the parallel pipeline service for concurrent operations and job management. Examples of API calls, response handling, and error recovery patterns are included, along with authentication and security considerations for API interactions.

## Project Structure
The API integration spans three primary areas:
- Frontend API service layer: centralized request orchestration, rate limiting, and retries
- Backend Python services: ML inference and lyrics orchestration
- Firebase integration: secure storage and App Check attestation

```mermaid
graph TB
subgraph "Frontend"
A["apiService.ts<br/>Enhanced API client"]
B["rateLimiting.ts<br/>Client-side rate limiter"]
C["parallelPipelineService.ts<br/>Parallel audio processing"]
D["segmentationAsyncService.ts<br/>Long-running job polling"]
E["lyricsService.ts<br/>Lyrics orchestration"]
F["lrclibService.ts<br/>LRClib client"]
G["customMusicAiClient.ts<br/>Music.ai client"]
H["firebase.ts<br/>Firebase config & App Check"]
I["streamingFirebaseUpload.ts<br/>Streaming upload"]
J["api.ts<br/>Endpoint routing"]
end
subgraph "Backend"
K["app.py<br/>Flask app factory"]
L["error_handlers.py<br/>Centralized error handling"]
M["orchestrator.py<br/>Lyrics orchestration"]
N["genius_service.py<br/>Genius lyrics"]
O["lrclib_service.py<br/>LRClib lyrics"]
end
A --> J
A --> H
A --> K
E --> A
F --> A
C --> I
C --> H
D --> K
G --> K
M --> N
M --> O
K --> L
```

**Diagram sources**
- [apiService.ts:1-407](file://src/services/api/apiService.ts#L1-L407)
- [rateLimiting.ts:1-266](file://src/utils/rateLimiting.ts#L1-L266)
- [parallelPipelineService.ts:1-350](file://src/services/api/parallelPipelineService.ts#L1-L350)
- [segmentationAsyncService.ts:1-211](file://src/services/api/segmentationAsyncService.ts#L1-L211)
- [lyricsService.ts:1-197](file://src/services/lyrics/lyricsService.ts#L1-L197)
- [lrclibService.ts:1-266](file://src/services/lyrics/lrclibService.ts#L1-L266)
- [customMusicAiClient.ts:1-711](file://src/services/api/customMusicAiClient.ts#L1-L711)
- [firebase.ts:1-537](file://src/config/firebase.ts#L1-L537)
- [streamingFirebaseUpload.ts:1-563](file://src/services/firebase/streamingFirebaseUpload.ts#L1-L563)
- [api.ts:1-158](file://src/config/api.ts#L1-L158)
- [app.py:1-186](file://python_backend/app.py#L1-L186)
- [error_handlers.py:1-161](file://python_backend/error_handlers.py#L1-L161)
- [orchestrator.py:1-184](file://python_backend/services/lyrics/orchestrator.py#L1-L184)
- [genius_service.py:1-215](file://python_backend/services/lyrics/genius_service.py#L1-L215)
- [lrclib_service.py:1-172](file://python_backend/services/lyrics/lrclib_service.py#L1-L172)

**Section sources**
- [apiService.ts:1-407](file://src/services/api/apiService.ts#L1-L407)
- [api.ts:1-158](file://src/config/api.ts#L1-L158)

## Core Components
- Enhanced API service with rate limiting and retries
- Client-side rate limiter and exponential backoff
- Parallel pipeline service for concurrent audio processing and Firebase uploads
- Async job service for long-running tasks exceeding platform timeouts
- Lyrics orchestration with Genius and LRClib fallback
- Firebase configuration with App Check and streaming upload utilities
- Backend error handling and centralized response formatting

**Section sources**
- [apiService.ts:29-407](file://src/services/api/apiService.ts#L29-L407)
- [rateLimiting.ts:210-266](file://src/utils/rateLimiting.ts#L210-L266)
- [parallelPipelineService.ts:34-350](file://src/services/api/parallelPipelineService.ts#L34-L350)
- [segmentationAsyncService.ts:30-211](file://src/services/api/segmentationAsyncService.ts#L30-L211)
- [lyricsService.ts:72-197](file://src/services/lyrics/lyricsService.ts#L72-L197)
- [firebase.ts:475-537](file://src/config/firebase.ts#L475-L537)
- [streamingFirebaseUpload.ts:273-431](file://src/services/firebase/streamingFirebaseUpload.ts#L273-L431)
- [error_handlers.py:13-161](file://python_backend/error_handlers.py#L13-L161)

## Architecture Overview
The frontend API layer encapsulates all outbound requests, applies rate limiting and retries, attaches App Check tokens, and routes endpoints to either Vercel-hosted routes or external Python backend. The backend exposes ML and lyrics endpoints with centralized error handling. Firebase provides secure storage and App Check attestation for API requests.

```mermaid
sequenceDiagram
participant FE as "Frontend Client"
participant API as "apiService.ts"
participant RL as "rateLimiting.ts"
participant FB as "Firebase App Check"
participant BE as "Python Backend"
FE->>API : "POST /api/recognize-chords"
API->>RL : "Check client-side rate limit"
RL-->>API : "Allowed or delay"
API->>FB : "Get App Check token"
FB-->>API : "Token or null"
API->>BE : "Forward request with X-Firebase-AppCheck"
BE-->>API : "JSON response or error"
API-->>FE : "Unified ApiResponse"
```

**Diagram sources**
- [apiService.ts:56-241](file://src/services/api/apiService.ts#L56-L241)
- [rateLimiting.ts:210-266](file://src/utils/rateLimiting.ts#L210-L266)
- [firebase.ts:522-536](file://src/config/firebase.ts#L522-L536)
- [app.py:87-186](file://python_backend/app.py#L87-L186)

## Detailed Component Analysis

### Enhanced API Service
The API service centralizes request construction, timeout handling, rate limiting, retries, and response parsing. It supports GET/POST/FormData endpoints and integrates with Firebase App Check.

```mermaid
classDiagram
class ApiService {
-string backendUrl
-string frontendUrl
-ClientRateLimiter clientLimiter
+request(endpoint, options) ApiResponse
+get(endpoint, options) ApiResponse
+post(endpoint, data, options) ApiResponse
+postFormData(endpoint, formData, options) ApiResponse
+detectBeats(audioFile, options) ApiResponse
+recognizeChords(audioFile, options) ApiResponse
+getGeniusLyrics(artist, title, searchQuery) ApiResponse
+getLrcLibLyrics(artist, title, duration) ApiResponse
+clearRateLimit(endpoint) void
+getBaseUrl(endpoint) string
}
class ClientRateLimiter {
-Map~string, number[]~ requests
-number windowMs
-number maxRequests
+isAllowed(key) boolean
+getRetryAfter(key) number
+clear(key) void
}
ApiService --> ClientRateLimiter : "uses"
```

**Diagram sources**
- [apiService.ts:29-407](file://src/services/api/apiService.ts#L29-L407)
- [rateLimiting.ts:210-266](file://src/utils/rateLimiting.ts#L210-L266)

Key behaviors:
- Client-side rate limiting per endpoint key
- Timeout management with AbortController
- Retry with exponential backoff for transient failures
- Specialized endpoints for beats/chords with long timeouts
- Lyrics endpoints for Genius and LRClib
- App Check token injection for API requests

**Section sources**
- [apiService.ts:56-241](file://src/services/api/apiService.ts#L56-L241)
- [rateLimiting.ts:120-187](file://src/utils/rateLimiting.ts#L120-L187)

### Rate Limiting Utilities
Provides client-side rate limiting, exponential backoff, and retry logic for both client and server responses.

```mermaid
flowchart TD
Start(["Request Initiated"]) --> CheckLimit["Check Client Rate Limit"]
CheckLimit --> Allowed{"Allowed?"}
Allowed --> |No| Wait["Compute Retry-After"]
Allowed --> |Yes| Fetch["Perform Fetch"]
Fetch --> RespOK{"Response OK?"}
RespOK --> |Yes| Done(["Return Success"])
RespOK --> |No| Status{"Status Code"}
Status --> |429| RateErr["Create RateLimitError"]
Status --> |5xx| Retry["Exponential Backoff Retry"]
Status --> |Other| Fail["Return Error"]
RateErr --> Retry
Retry --> Fetch
Wait --> Fetch
Fail --> End(["Return Error"])
```

**Diagram sources**
- [rateLimiting.ts:120-187](file://src/utils/rateLimiting.ts#L120-L187)
- [rateLimiting.ts:210-266](file://src/utils/rateLimiting.ts#L210-L266)

**Section sources**
- [rateLimiting.ts:20-54](file://src/utils/rateLimiting.ts#L20-L54)
- [rateLimiting.ts:59-115](file://src/utils/rateLimiting.ts#L59-L115)
- [rateLimiting.ts:120-187](file://src/utils/rateLimiting.ts#L120-L187)

### Parallel Pipeline Service
Optimizes audio processing by downloading the complete audio file and running Google Cloud Run processing in parallel with Firebase upload. Includes caching, background uploads, and result retrieval.

```mermaid
sequenceDiagram
participant Client as "Client"
participant PPS as "parallelPipelineService.ts"
participant FS as "Firebase Upload"
participant GC as "Google Cloud Run"
Client->>PPS : "startParallelPipeline({directUrl})"
PPS->>PPS : "Download complete audio file"
PPS->>FS : "uploadBlobToFirebaseInBackground(blob)"
PPS->>GC : "Store blob in cache for immediate processing"
FS-->>PPS : "Background upload result"
PPS-->>Client : "ParallelPipelineResult"
```

**Diagram sources**
- [parallelPipelineService.ts:34-98](file://src/services/api/parallelPipelineService.ts#L34-L98)
- [parallelPipelineService.ts:173-203](file://src/services/api/parallelPipelineService.ts#L173-L203)
- [streamingFirebaseUpload.ts:436-483](file://src/services/firebase/streamingFirebaseUpload.ts#L436-L483)

**Section sources**
- [parallelPipelineService.ts:34-98](file://src/services/api/parallelPipelineService.ts#L34-L98)
- [parallelPipelineService.ts:148-261](file://src/services/api/parallelPipelineService.ts#L148-L261)

### Async Job Service
Manages long-running jobs that exceed platform timeouts. Creates jobs, polls for completion, and provides progress updates.

```mermaid
sequenceDiagram
participant Client as "Client"
participant AJS as "segmentationAsyncService.ts"
participant BE as "Backend Jobs API"
Client->>AJS : "extractAudio(videoId, onProgress)"
AJS->>BE : "POST /api/extract-audio"
BE-->>AJS : "{jobId}"
loop Polling
AJS->>BE : "GET /api/segmentation/jobs/{jobId}"
BE-->>AJS : "{status, progress, audioUrl}"
AJS-->>Client : "onProgress(status)"
end
AJS-->>Client : "AsyncJobResult"
```

**Diagram sources**
- [segmentationAsyncService.ts:52-101](file://src/services/api/segmentationAsyncService.ts#L52-L101)
- [segmentationAsyncService.ts:106-177](file://src/services/api/segmentationAsyncService.ts#L106-L177)

**Section sources**
- [segmentationAsyncService.ts:30-211](file://src/services/api/segmentationAsyncService.ts#L30-L211)

### Lyrics Orchestration and Providers
The frontend lyrics service coordinates LRClib and Genius fallback strategies. The backend orchestrator composes provider services and normalizes responses.

```mermaid
sequenceDiagram
participant Client as "Client"
participant LS as "lyricsService.ts"
participant LR as "lrclibService.ts"
participant AS as "apiService.ts"
participant BE as "Python Backend"
participant ORCH as "orchestrator.py"
participant G as "genius_service.py"
participant L as "lrclib_service.py"
Client->>LS : "searchLyricsWithFallback(params)"
alt prefer_synchronized
LS->>LR : "searchLRCLibLyrics()"
LR-->>LS : "LRCLibResponse or null"
end
alt LRClib fails
LS->>AS : "getGeniusLyrics(artist,title,query)"
AS->>BE : "POST /api/genius-lyrics"
BE->>ORCH : "fetch_with_fallback()"
ORCH->>G : "fetch_lyrics()"
ORCH->>L : "fetch_lyrics()"
ORCH-->>BE : "Normalized result"
BE-->>AS : "JSON response"
AS-->>LS : "ApiResponse"
LS-->>Client : "LyricsServiceResponse"
end
```

**Diagram sources**
- [lyricsService.ts:72-172](file://src/services/lyrics/lyricsService.ts#L72-L172)
- [lrclibService.ts:32-145](file://src/services/lyrics/lrclibService.ts#L32-L145)
- [apiService.ts:348-366](file://src/services/api/apiService.ts#L348-L366)
- [orchestrator.py:95-147](file://python_backend/services/lyrics/orchestrator.py#L95-L147)
- [genius_service.py:135-215](file://python_backend/services/lyrics/genius_service.py#L135-L215)
- [lrclib_service.py:76-172](file://python_backend/services/lyrics/lrclib_service.py#L76-L172)

**Section sources**
- [lyricsService.ts:72-172](file://src/services/lyrics/lyricsService.ts#L72-L172)
- [orchestrator.py:95-147](file://python_backend/services/lyrics/orchestrator.py#L95-L147)

### Firebase Integration and Security
Firebase configuration initializes App Check and provides streaming upload utilities. App Check tokens are attached to API requests for attestation.

```mermaid
sequenceDiagram
participant FE as "Frontend"
participant FB as "firebase.ts"
participant API as "apiService.ts"
participant BE as "Backend"
FE->>FB : "initializeFirebase()"
FB-->>FE : "App Check provider ready"
FE->>API : "request(endpoint, options)"
API->>FB : "getAppCheckTokenForApi()"
FB-->>API : "token or null"
API->>BE : "X-Firebase-AppCheck : token"
BE-->>API : "Response"
API-->>FE : "ApiResponse"
```

**Diagram sources**
- [firebase.ts:475-537](file://src/config/firebase.ts#L475-L537)
- [apiService.ts:106-121](file://src/services/api/apiService.ts#L106-L121)

**Section sources**
- [firebase.ts:475-537](file://src/config/firebase.ts#L475-L537)
- [streamingFirebaseUpload.ts:273-431](file://src/services/firebase/streamingFirebaseUpload.ts#L273-L431)

### Backend Error Handling
Centralized error handlers return consistent JSON responses for HTTP exceptions and application-specific errors.

```mermaid
flowchart TD
A["Exception Thrown"] --> B{"Is HTTPException?"}
B --> |Yes| C["Return JSON with name, description, status_code"]
B --> |No| D{"Is ChordMiniException?"}
D --> |Yes| E["Return JSON with error, message, status_code"]
D --> |No| F["Return generic 500 JSON with error"]
```

**Diagram sources**
- [error_handlers.py:13-94](file://python_backend/error_handlers.py#L13-L94)
- [error_handlers.py:142-161](file://python_backend/error_handlers.py#L142-L161)

**Section sources**
- [error_handlers.py:13-161](file://python_backend/error_handlers.py#L13-L161)

### Music.ai Client
A flexible client for Music.ai with multiple endpoint/auth fallbacks, job creation, polling, and file upload utilities.

```mermaid
classDiagram
class CustomMusicAiClient {
-string apiKey
-string baseUrl
-string apiPath
-number timeout
+addJob(workflow, params) string
+waitForJobCompletion(jobId, timeout) MusicAiJob
+getJob(jobId) MusicAiJob
+listWorkflows() string[]
+getSignedUrls() object
+uploadFile(fileData, contentType) string
+uploadLocalFile(filePath, contentType) string
}
```

**Diagram sources**
- [customMusicAiClient.ts:77-711](file://src/services/api/customMusicAiClient.ts#L77-L711)

**Section sources**
- [customMusicAiClient.ts:77-711](file://src/services/api/customMusicAiClient.ts#L77-L711)

## Dependency Analysis
- Frontend API service depends on rate limiting utilities, Firebase App Check, and endpoint routing configuration.
- Lyrics orchestration depends on frontend API service for Genius and on LRClib client for direct API calls.
- Backend Flask app registers error handlers and routes to blueprints; the orchestrator composes provider services.
- Parallel pipeline service depends on streaming Firebase upload utilities and maintains in-memory caches.

```mermaid
graph TB
API["apiService.ts"] --> RL["rateLimiting.ts"]
API --> FB["firebase.ts"]
API --> RT["api.ts"]
LYR["lyricsService.ts"] --> API
LYR --> LR["lrclibService.ts"]
ORCH["orchestrator.py"] --> G["genius_service.py"]
ORCH --> L["lrclib_service.py"]
PPS["parallelPipelineService.ts"] --> SFU["streamingFirebaseUpload.ts"]
APP["app.py"] --> EH["error_handlers.py"]
```

**Diagram sources**
- [apiService.ts:1-407](file://src/services/api/apiService.ts#L1-L407)
- [rateLimiting.ts:1-266](file://src/utils/rateLimiting.ts#L1-L266)
- [firebase.ts:1-537](file://src/config/firebase.ts#L1-L537)
- [api.ts:1-158](file://src/config/api.ts#L1-L158)
- [lyricsService.ts:1-197](file://src/services/lyrics/lyricsService.ts#L1-L197)
- [lrclibService.ts:1-266](file://src/services/lyrics/lrclibService.ts#L1-L266)
- [orchestrator.py:1-184](file://python_backend/services/lyrics/orchestrator.py#L1-L184)
- [genius_service.py:1-215](file://python_backend/services/lyrics/genius_service.py#L1-L215)
- [lrclib_service.py:1-172](file://python_backend/services/lyrics/lrclib_service.py#L1-L172)
- [parallelPipelineService.ts:1-350](file://src/services/api/parallelPipelineService.ts#L1-L350)
- [streamingFirebaseUpload.ts:1-563](file://src/services/firebase/streamingFirebaseUpload.ts#L1-L563)
- [app.py:1-186](file://python_backend/app.py#L1-L186)
- [error_handlers.py:1-161](file://python_backend/error_handlers.py#L1-L161)

**Section sources**
- [apiService.ts:1-407](file://src/services/api/apiService.ts#L1-L407)
- [lyricsService.ts:1-197](file://src/services/lyrics/lyricsService.ts#L1-L197)
- [parallelPipelineService.ts:1-350](file://src/services/api/parallelPipelineService.ts#L1-L350)

## Performance Considerations
- Client-side rate limiting prevents overload and reduces wasted retries.
- Exponential backoff with jitter mitigates thundering herd and server spikes.
- Parallel pipeline downloads the complete audio file and runs processing concurrently with Firebase upload to reduce total latency.
- Long-running jobs are polled with tuned intervals based on song duration to balance responsiveness and cost.
- Streaming uploads avoid local buffering and respect Vercel operation budgets.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and recovery patterns:
- Rate limit exceeded: The API service detects 429 responses and returns a structured error with retry-after guidance. Client-side rate limiter also enforces quotas.
- Network timeouts: The API service sets AbortController timeouts and returns user-friendly messages. For long operations, use async job service or parallel pipeline.
- External provider failures: Lyrics orchestration falls back from LRClib to Genius and vice versa. Health checks can be used to monitor provider availability.
- Firebase upload failures: Streaming upload utilities implement retry logic and budget-aware delays. Background results are tracked and can be queried.
- Backend errors: Centralized error handlers return consistent JSON with status codes and messages for debugging.

**Section sources**
- [apiService.ts:137-241](file://src/services/api/apiService.ts#L137-L241)
- [rateLimiting.ts:190-205](file://src/utils/rateLimiting.ts#L190-L205)
- [lyricsService.ts:176-197](file://src/services/lyrics/lyricsService.ts#L176-L197)
- [streamingFirebaseUpload.ts:334-431](file://src/services/firebase/streamingFirebaseUpload.ts#L334-L431)
- [error_handlers.py:13-94](file://python_backend/error_handlers.py#L13-L94)

## Conclusion
The API integration architecture employs a robust service layer with client-side rate limiting, exponential backoff, and parallel processing to optimize performance and reliability. The frontend API service unifies endpoint routing, authentication via App Check, and response handling, while backend services provide centralized error handling and provider orchestration. Firebase integration ensures secure storage and attestation, and specialized clients manage external APIs with resilient fallback strategies.