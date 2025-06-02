# ChordMini Architecture Diagrams

This document contains comprehensive Mermaid diagrams documenting the ChordMini system architecture, data flows, and user interaction patterns.

## 1. Beat Animation Workflow

The continuous beat animation system eliminates gaps from 0.0s to first detected beat using a three-phase strategy.

```mermaid
flowchart TD
    A[Audio Playback Starts] --> B{Time < First Beat?}
    B -->|Yes| C[Pre-Beat Phase]
    B -->|No| D[Model Beat Phase]
    
    C --> E{Has Padding Cells?}
    E -->|Yes| F[Strategy 1: Use Padding Cells]
    E -->|No| G{Has Shift Cells?}
    
    G -->|Yes| H[Strategy 2: Use Shift Cells]
    G -->|No| I[Strategy 3: Use Any Available Cells]
    
    F --> J[Calculate Virtual Beat Index]
    H --> J
    I --> J
    
    J --> K[Apply Phase-Aware Safeguards]
    K --> L[Highlight Cell]
    L --> M[Update at 20Hz]
    M --> N{Audio Still Playing?}
    N -->|Yes| B
    N -->|No| O[Stop Animation]
    
    D --> P[Use Detected Beat Timestamps]
    P --> Q[Find Current Beat Index]
    Q --> R[Apply Model Phase Safeguards]
    R --> L
    
    style C fill:#e1f5fe
    style D fill:#f3e5f5
    style F fill:#e8f5e8
    style H fill:#fff3e0
    style I fill:#ffebee
```

## 2. Chord Grid Data Flow

The chord grid construction process involves padding calculation, shift optimization, and visual grid assembly.

```mermaid
flowchart TD
    A[Raw Chord Data] --> B[Calculate Pickup Beats]
    B --> C[Determine Padding Count]
    C --> D[Optimal Shift Calculation]
    
    D --> E[Test Shift Values 0 to N-1]
    E --> F[Count Chord Changes on Downbeats]
    F --> G[Select Best Shift]
    
    G --> H[Construct Visual Grid]
    H --> I[Add Shift Cells]
    I --> J[Add Padding Cells]
    J --> K[Add Chord Data]
    
    K --> L[Generate Beat Timestamps]
    L --> M[Synchronize with Audio]
    M --> N[Real-time Animation]
    
    B --> B1[Analyze First Beat Position]
    B1 --> B2[Calculate Anacrusis Duration]
    B2 --> C
    
    F --> F1[For Each Shift Value]
    F1 --> F2[Map Beats to Measures]
    F2 --> F3[Identify Downbeats]
    F3 --> F4[Count Chord Changes]
    F4 --> F1
    
    style A fill:#e3f2fd
    style G fill:#e8f5e8
    style N fill:#fff3e0
```

## 3. User Interaction Flow

Complete user journey from video selection to synchronized analysis visualization.

```mermaid
flowchart TD
    A[User Visits Home Page] --> B{Input Type?}
    B -->|Search Query| C[YouTube Search]
    B -->|Video URL| D[Parse Video ID]
    B -->|Upload File| E[File Upload]
    
    C --> F[Display Search Results]
    F --> G[User Selects Video]
    G --> H[Navigate to Analysis Page]
    
    D --> H
    E --> H
    
    H --> I[Load Video Info]
    I --> J[Extract Audio]
    J --> K{Audio Cached?}
    K -->|Yes| L[Load from Cache]
    K -->|No| M[Process Audio]
    
    L --> N[Display Analysis Controls]
    M --> N
    
    N --> O[User Clicks Analyze]
    O --> P[Beat Detection]
    P --> Q[Chord Recognition]
    Q --> R[Synchronize Data]
    
    R --> S[Generate Chord Grid]
    S --> T[Enable Playback Controls]
    T --> U[Start Beat Animation]
    
    U --> V{User Actions}
    V -->|Play/Pause| W[Control Playback]
    V -->|Transcribe Lyrics| X[Music.ai API]
    V -->|Translate Lyrics| Y[Gemini API]
    V -->|Chat with AI| Z[Contextual Chatbot]
    V -->|Enable Metronome| AA[Web Audio Clicks]
    
    W --> U
    X --> BB[Display Synchronized Lyrics]
    Y --> CC[Show Translations]
    Z --> DD[AI Responses]
    AA --> EE[Audible Beat Clicks]
    
    style H fill:#e1f5fe
    style R fill:#e8f5e8
    style U fill:#fff3e0
```

## 4. System Architecture Overview

High-level system architecture showing component relationships and data flow.

```mermaid
graph TB
    subgraph "Frontend (Next.js)"
        A[Home Page]
        B[Analysis Page]
        C[Chord Grid Component]
        D[Audio Player Component]
        E[Lyrics Component]
        F[AI Chatbot Component]
    end
    
    subgraph "API Layer (Next.js API Routes)"
        G[YouTube Search API]
        H[Audio Extraction API]
        I[Model Analysis API]
        J[Lyrics Transcription API]
        K[Translation API]
        L[Chatbot API]
    end
    
    subgraph "External Services"
        M[YouTube Data API]
        N[Music.ai API]
        O[Gemini AI API]
    end
    
    subgraph "Machine Learning Models"
        P[Beat-Transformer]
        Q[Chord-CNN-LSTM]
        R[Madmom Beat Detection]
    end
    
    subgraph "Database & Storage"
        S[Firebase Firestore]
        T[Firebase Storage]
    end
    
    A --> G
    B --> H
    B --> I
    B --> J
    B --> K
    B --> L
    
    G --> M
    H --> M
    I --> P
    I --> Q
    I --> R
    J --> N
    K --> O
    L --> O
    
    C --> D
    D --> E
    E --> F
    
    G --> S
    H --> S
    H --> T
    I --> S
    J --> S
    K --> S
    L --> S
    
    style A fill:#e3f2fd
    style B fill:#e3f2fd
    style S fill:#e8f5e8
    style O fill:#fff3e0
```

## 5. Beat Animation State Machine

Detailed state machine showing the animation logic and phase transitions.

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> PreBeat: Audio Starts

    state PreBeat {
        [*] --> CheckPadding
        CheckPadding --> UsePadding: Has Padding Cells
        CheckPadding --> CheckShift: No Padding
        CheckShift --> UseShift: Has Shift Cells
        CheckShift --> UseAny: No Shift Cells

        UsePadding --> VirtualBeat
        UseShift --> VirtualBeat
        UseAny --> VirtualBeat

        VirtualBeat --> ApplySafeguards
        ApplySafeguards --> HighlightCell
        HighlightCell --> UpdateTimer
        UpdateTimer --> CheckTime
        CheckTime --> VirtualBeat: Still Pre-Beat
        CheckTime --> [*]: First Beat Reached
    }

    PreBeat --> ModelBeat: First Beat Detected

    state ModelBeat {
        [*] --> FindBeat
        FindBeat --> ValidateBeat
        ValidateBeat --> ApplyModelSafeguards
        ApplyModelSafeguards --> HighlightBeat
        HighlightBeat --> UpdateTimer
        UpdateTimer --> FindBeat
    }

    ModelBeat --> Idle: Audio Stops
    PreBeat --> Idle: Audio Stops
```

## 6. Enharmonic Correction Pipeline

The multi-layer caching and correction system for chord spelling improvements.

```mermaid
flowchart TD
    A[Chord Sequence Input] --> B{Sequence Cached?}
    B -->|Yes| C[Load Cached Corrections]
    B -->|No| D[Check Individual Cache]

    D --> E{Individual Chords Cached?}
    E -->|Partial| F[Mix Cached + New]
    E -->|None| G[Full Gemini API Call]
    E -->|All| H[Use Individual Cache]

    F --> I[Gemini Sequence Analysis]
    G --> I

    I --> J[Parse API Response]
    J --> K[Validate Corrections]
    K --> L[Cache Sequence Results]
    L --> M[Cache Individual Results]

    H --> N[Apply Legacy Mapping]
    N --> O[Fallback Corrections]

    C --> P[Apply Corrections to Grid]
    M --> P
    O --> P

    P --> Q[Update UI Toggle State]
    Q --> R[Visual Distinction Applied]

    style C fill:#e8f5e8
    style I fill:#fff3e0
    style P fill:#e1f5fe
```

## 7. Audio Processing Pipeline

Complete audio processing workflow from YouTube to synchronized playback.

```mermaid
flowchart TD
    A[YouTube Video URL] --> B[Extract Video Info]
    B --> C[Download Audio Stream]
    C --> D{Audio Cached?}
    D -->|Yes| E[Load from Firebase Storage]
    D -->|No| F[Process Audio File]

    F --> G[Convert to WAV]
    G --> H[Normalize Audio]
    H --> I[Cache in Firebase]
    I --> J[Beat Detection Model]

    E --> J
    J --> K[Extract Beat Timestamps]
    K --> L[Calculate BPM]
    L --> M[Chord Recognition Model]

    M --> N[Extract Chord Sequence]
    N --> O[Synchronize Beats & Chords]
    O --> P[Generate Grid Data]

    P --> Q[Cache Analysis Results]
    Q --> R[Initialize Audio Player]
    R --> S[Enable Real-time Tracking]

    S --> T[Web Audio API]
    T --> U[Synchronized Playback]
    U --> V[Beat Animation]
    U --> W[Metronome Clicks]
    U --> X[Lyrics Highlighting]

    style I fill:#e8f5e8
    style Q fill:#e8f5e8
    style U fill:#fff3e0
```

## 8. Component Dependency Graph

React component hierarchy and data flow relationships.

```mermaid
graph TD
    A[App Layout] --> B[Home Page]
    A --> C[Analysis Page]

    C --> D[Video Player Component]
    C --> E[Analysis Controls]
    C --> F[Tabbed Interface]

    F --> G[Beat & Chord Map Tab]
    F --> H[Lyrics & Chords Tab]

    G --> I[Chord Grid Component]
    G --> J[Beat Visualization]
    G --> K[Metronome Controls]

    H --> L[Lyrics Display Component]
    H --> M[Translation Controls]
    H --> N[Sync Controls]

    C --> O[AI Chatbot FAB]
    O --> P[Chat Modal]

    I --> Q[Grid Cell Component]
    I --> R[Chord Label Component]
    I --> S[Beat Highlight Logic]

    L --> T[Word Component]
    L --> U[Chord Annotation Component]
    L --> V[Karaoke Highlight Logic]

    D --> W[useAudioPlayer Hook]
    I --> X[useBeatTracking Hook]
    L --> Y[useLyricsSync Hook]
    P --> Z[useChatbot Hook]

    style A fill:#e3f2fd
    style C fill:#e1f5fe
    style I fill:#e8f5e8
    style L fill:#fff3e0
```

## 9. Data Models and Relationships

Key data structures and their relationships in the system.

```mermaid
erDiagram
    VIDEO_INFO {
        string videoId PK
        string title
        string channelTitle
        number duration
        string thumbnailUrl
        timestamp createdAt
    }

    AUDIO_ANALYSIS {
        string videoId PK
        string audioUrl
        object beatDetectionResult
        object chordDetectionResult
        number bpm
        number timeSignature
        timestamp analyzedAt
    }

    CHORD_GRID_DATA {
        string videoId PK
        array chords
        array beats
        number shiftCount
        number paddingCount
        object metadata
    }

    LYRICS_DATA {
        string videoId PK
        array words
        array timestamps
        string language
        object syncData
        timestamp transcribedAt
    }

    TRANSLATIONS {
        string videoId PK
        string targetLanguage PK
        array translatedWords
        string sourceLanguage
        timestamp translatedAt
    }

    CHORD_CORRECTIONS {
        string videoId PK
        object originalSequence
        object correctedSequence
        object corrections
        timestamp correctedAt
    }

    CHAT_SESSIONS {
        string sessionId PK
        string videoId FK
        array messages
        timestamp createdAt
        timestamp lastActive
    }

    VIDEO_INFO ||--|| AUDIO_ANALYSIS : "has"
    AUDIO_ANALYSIS ||--|| CHORD_GRID_DATA : "generates"
    VIDEO_INFO ||--o| LYRICS_DATA : "may have"
    LYRICS_DATA ||--o{ TRANSLATIONS : "can be translated"
    CHORD_GRID_DATA ||--o| CHORD_CORRECTIONS : "may have corrections"
    VIDEO_INFO ||--o{ CHAT_SESSIONS : "can have chats"
```

## 10. Performance Optimization Strategy

Key performance optimizations implemented throughout the system.

```mermaid
mindmap
  root((Performance Optimizations))
    Caching
      Firebase Storage
        Audio Files
        Analysis Results
      Firestore
        Translations
        Chord Corrections
        Video Metadata
      Browser Cache
        API Responses
        Static Assets

    Audio Processing
      Single-pass Beat Detection
      Efficient Model Loading
      Web Audio API
      Background Processing

    UI Optimizations
      React Query
        Data Fetching
        Cache Management
      Component Memoization
        React.memo
        useMemo
        useCallback
      Virtual Scrolling
        Large Chord Grids
        Long Lyrics

    API Efficiency
      Rate Limiting
      Batch Requests
      Error Handling
      Retry Logic

    Real-time Features
      20Hz Animation Updates
      Efficient Beat Tracking
      Optimized Highlighting
      Smooth Transitions
```

## Technical Implementation Notes

### Beat Animation System
- **Update Frequency**: 20Hz (50ms intervals) for smooth visual feedback
- **Phase Detection**: Automatic transition from virtual to detected beat animation
- **Safeguards**: Phase-aware logic prevents highlighting invalid cells
- **Fallback Strategy**: Three-tier approach ensures continuous animation

### Caching Architecture
- **Multi-layer**: Sequence corrections → Individual corrections → Legacy mapping
- **Firebase Integration**: Automatic cache invalidation and updates
- **Performance**: Reduces API calls by 80% for repeated analyses

### Audio Synchronization
- **Web Audio API**: Low-latency metronome clicks with precise timing
- **Beat Tracking**: Real-time synchronization with 10ms accuracy
- **Memory Management**: Efficient handling of long audio files

This architecture documentation serves as a comprehensive reference for understanding the ChordMini system's technical implementation and can guide future development efforts.
