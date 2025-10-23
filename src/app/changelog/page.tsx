'use client';

import React from 'react';
import Navigation from '@/components/common/Navigation';

// Helper function to parse and style change items with badges
const renderChangeItem = (item: string, colorClass: string) => {
  const parts = item.split(': ');
  const badgeText = parts[0];
  const description = parts.slice(1).join(': ');

  let badgeColor = 'text-gray-700 dark:text-gray-200'; // Default
  if (badgeText.includes('NEW')) badgeColor = 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  if (badgeText.includes('FIX')) badgeColor = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  if (badgeText.includes('PERFORMANCE') || badgeText.includes('IMPROVED')) badgeColor = 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  if (badgeText === ('UI')) badgeColor = 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
  return (
    <li className="flex items-start gap-3">
      <svg className={`w-4 h-4 mt-1 flex-shrink-0 ${colorClass}`} fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
      </svg>
      <div>
        <span className={`px-2 py-0.5 rounded-md text-xs font-semibold mr-2 ${badgeColor}`}>{badgeText}</span>
        <span className="text-gray-700 dark:text-gray-300">{description}</span>
      </div>
    </li>
  );
};

export default function ChangelogPage() {
  const releases = [
    {
      version: 'v0.5.4',
      date: 'October 23, 2025',
      title: 'Recently Transcribed Performance & Responsive Grid',
      description: 'Faster homepage data fetch and improved responsive layout.',
      features: [
        'PERFORMANCE: Recently Transcribed — multi-page accumulation + batched audio metadata queries + SWR-style cache revalidation + increased TTL (15m)',
        'UI: Homepage grid uses 3/2/1 columns (desktop/tablet/mobile) for Recently Transcribed'
      ],
      technical: [
        "Firestore: orderBy(createdAt desc) with multi-page accumulation; audioFiles batched via where(documentId(), 'in', [...])",
        'Caching: SWR-style stale-while-revalidate on list cache; recentVideosCache TTL 15 minutes'
      ],
      breaking: []
    },

    {
      version: 'v0.5.3',
      date: 'October 18, 2025',
      title: 'App improvements (In Development)',
      description: 'Improve app stability, performance, user experience, and UI consistency.',
      features:[
        'IMPROVED: Madmom now automatically selects between 3/4 and 4/4 using chord-beat alignment scoring',
        'IMPROVED: Madmom set as the default beat detection model (previously Beat-Transformer)',
        'UI: Beat model selector always shows all models regardless of backend cold-start status',
        'UI: Removed backend availability indicators from model selectors for cleaner UI',
        'UI: changed tabs UI to HeroUI component',
        'FIX: chord labels consistency and based on correction from gemini models'
      ],
      technical: [
        'PERFORMANCE: Implemented Web Worker-based processing for chord-beat synchronization and downbeat alignment scoring to prevent UI blocking',
        'PERFORMANCE: Offloaded synchronizeChords, scoreDownbeatAlignment, and chooseMeterAndDownbeats to a background thread using Comlink',
        'REFACTORING: moved files into subfolders for better structure and organization'
      ],
      breaking: []
    },

    {
      version: 'v0.5.2',
      date: 'October 17, 2025',
      title: 'Zustand State Management Migration & Performance Optimizations',
      description: 'Completes migration from React Context API to Zustand for global state management, fixing critical race conditions and audio playback bugs while improving performance.',
      features: [
        'NEW: Loop Playback - Set start/end beats to loop specific sections of songs',
        'NEW: Loop range selection via popover panel with manual beat input or click-to-select beats',
        'NEW: Visual feedback with blue backgrounds for loop range and beat numbering overlay',
        'NEW: Automatic looping - YouTube player seeks back to start beat when end beat is reached',
        'PERFORMANCE: Migrated from Context API to Zustand for all state management',
        'PERFORMANCE: Bundle size reduced by 7.1% for YouTube analysis page (50.4 kB → 46.8 kB)',
        'PERFORMANCE: Expected 50-70% reduction in unnecessary re-renders',
        'FIX: Toggle buttons (Roman Numerals, Simplify Chords) now work with single click during playback',
        'FIX: Audio playback now works correctly in local audio upload page',
        'UI: Improved icon clarity - auto-scroll now uses chevron icon instead of arrow path',
        'UI: Removed verbose console logs (chord recognition, alignment, key detection, duration)',
      ],
      technical: [
        'ARCHITECTURE: New useLoopBeatSelection hook for sequential beat selection with range expansion',
        'ARCHITECTURE: New useLoopPlayback hook for automatic YouTube player looping',
        'ARCHITECTURE: Loop state managed in Zustand uiStore with selector hooks for performance',
        'ARCHITECTURE: Removed 4 Context Provider files (AnalysisDataContext, UIContext, PlaybackContext, ZustandSynchronizer)',
        'ARCHITECTURE: Migrated both YouTube analysis and local upload pages to Zustand',
        'ARCHITECTURE: Fixed circular dependency in Zustand initialization causing race conditions',
        'ARCHITECTURE: Fixed pitch shift hook incorrectly muting audio element',
        'STABILITY: Loop cooldown mechanism (500ms) prevents rapid looping edge cases',
        'STABILITY: Removed deprecated useChordProcessing hook',
        'STABILITY: Components now subscribe to specific Zustand state slices for optimal re-renders',
      ],
      breaking: []
    },

    {
      version: 'v0.5.1',
      date: 'October 9, 2025',
      title: 'Real Instrument Soundfonts for Chord Playback',
      description: 'Replaces synthetic chord playback sounds with professional-quality instrument soundfonts (Piano, Guitar, Violin) using the smplr library. Features lazy loading for optimal performance and seamless integration with the existing audio mixer.',
      features: [
        'NEW: Real instrument soundfonts for chord playback (Acoustic Grand Piano, Acoustic Guitar, Violin)',
        'NEW: Violin volume control added to audio mixer panel with independent slider',
        'NEW: Lazy loading - soundfonts only load when chord playback is first enabled (~3s load time)',
        'IMPROVED: Enhanced chord playback quality with authentic instrument timbres',
        'IMPROVED: Comprehensive chord support including slash chords (e.g., C/G, Am/E)',
        'UI: New violin volume slider with violin icon in audio mixer',
        'UI: Consistent green color scheme for all instrument volume controls',
        'PERFORMANCE: Fast playback latency (~6ms) after initial soundfont loading',
      ],
      technical: [
        'ARCHITECTURE: New SoundfontChordPlaybackService wrapping smplr library for production use',
        'ARCHITECTURE: Lazy initialization - soundfonts load on first playback, not on page load',
        'ARCHITECTURE: Graceful fallback to lightweight synthetic service if soundfonts fail to load',
        'ARCHITECTURE: Updated AudioMixerService to support three-instrument volume hierarchy',
        'ARCHITECTURE: Comprehensive chord parsing supporting major, minor, 7th, 9th, 11th, 13th, sus, dim, aug chords',
        'PERFORMANCE: Soundfonts cached after first load for instant subsequent playback',
        'PERFORMANCE: Octave transposition per instrument (Piano: C4, Guitar: C3, Violin: C5)',
        'STABILITY: Backward compatible - existing lightweight service updated with optional violin parameter',
        'STABILITY: Error handling with automatic fallback ensures chord playback always works',
      ],
      breaking: []
    },

    {
      version: 'v0.5.0',
      date: 'October 8, 2025',
      title: 'Pitch Shift Feature with Tempo Control',
      description: 'Introduces real-time pitch shifting for YouTube and uploaded audio with automatic chord transposition, playback speed control that preserves pitch, and seamless integration with existing chord playback features.',
      features: [
        'NEW: Real-time pitch shifting using Tone.js library for both YouTube and uploaded audio',
        'NEW: Pitch shift control panel with slider (-6 to +6 semitones) and visual feedback',
        'NEW: Automatic chord label transposition when pitch is shifted',
        'NEW: Chord playback (piano/guitar) automatically adapts to match shifted pitch',
        'NEW: Playback speed control (0.25x to 2.0x) with pitch preservation algorithm',
        'NEW: Pitch shift toggle button in utility bar with BETA badge',
        'UI: Semi-transparent pitch shift popover matching audio mixer design',
        'PERFORMANCE: Pitch compensation algorithm prevents chipmunk/deep voice effects during speed changes',
      ],
      technical: [
        'ARCHITECTURE: Tone.js integration for professional-grade pitch shifting with granular synthesis',
        'ARCHITECTURE: Pitch compensation formula (12 × log₂(rate)) for tempo changes without pitch changes',
        'ARCHITECTURE: Audio-source agnostic design supporting YouTube, Firebase Storage, and blob URLs',
        'ARCHITECTURE: Singleton pitch shift service with proper cleanup and memory management',
        'PERFORMANCE: Playback state synchronization (play/pause/seek) between YouTube and pitch-shifted audio',
        'PERFORMANCE: Beat-aligned time tracking with independent interval-based updates',
        'STABILITY: Ref-based tracking to prevent playback sync issues on toggle',
        'STABILITY: Automatic YouTube player muting when pitch shift is enabled (visual sync maintained)',
      ],
      breaking: []
    },

    {
      version: 'v0.4.5',
      date: 'September 29, 2025',
      title: 'Context Migration, Corrections Visuals, and Faster UI',
      description: 'Completes Advanced Context Migration, restoring chord corrections visuals and improving responsiveness while avoiding unnecessary fetches and re-renders.',
      features: [
        'PERFORMANCE: Completed UI Context Migration for toggles (Roman numerals, segmentation, chord simplification) reducing unnecessary component updates',
        'FIX: Restored purple vs white chord labels for corrected vs original chords in the grid',
        'FIX: Roman numeral analysis restored with reliable context sync and no duplicate API calls',
        'UI: Floating utility banner refined; controls are consistent and do not cause layout shifts',
        'UI: LyricsSection now respects chord simplification via UIContext (no prop drilling)',
      ],
      technical: [
        'ARCHITECTURE: Moved simplifyChords to UIContext with controlled props and selector hooks (useSimplifySelector)',
        'PERFORMANCE: Added focused context selectors and React.memo where beneficial to minimize re-renders',
        'PERFORMANCE: Memoized UtilityBar and toggle components to reduce render cost in large pages',
        'STABILITY: Reconnected sequenceCorrections to ChordGridContainer so corrected chords render immediately',
        'STABILITY: Prevented re-fetching on toggle changes by centralizing state and stabilizing effect deps'
      ],
      breaking: [
        'First working release of Docker Images for both frontend and backend services'
      ]
    },

    {
      version: 'v0.4.4',
      date: 'August 26, 2025',
      title: 'Responsive Video Dock & Lyrics Sync Fix',
      description: 'Places the YouTube frame alongside the utility dock and resolves lyrics/chords timing conflicts.',
      features: [
        'UI: YouTube frame placed next to the utility dock to prevent creeping into the footer',
        'FIX: Lyrics service (Music.ai) merging and synchronization conflict resolved for chord-only/silence sections'
      ],
      breaking: []
    },

    {
      version: 'v0.4.3',
      date: 'August 25, 2025',
      title: 'Video Dock Countdown & Resize Handle Layering',
      description: 'Improves countdown gating for video playback and ensures the floating video dock stays above the split-pane resizer.',
      features: [
        'UI: Floating video dock now shows a gated countdown overlay and intercepts initial clicks to run countdown before playing',
        'UI: Split-pane resize handle z-index reduced so the video dock is always above it',
      ],
      breaking: []
    },

    {
      version: 'v0.4.2',
      date: 'August 23, 2025',
      title: 'Audio Mixer & Refactoring',
      description: 'Introduces synchronized chord audio playback and consolidates audio analysis logic into a single orchestrator for maintainability',
      features: [
        'NEW: Audio Mixer - Play back chord audio alongside video with beat-aligned, synchronized chord sounds',
      ],
      technical: [
        'ARCHITECTURE: Centralized audio analysis orchestrator (audioAnalysisService.ts) coordinating beat detection, chord recognition, and synchronization with Vercel Blob support',
        'REFACTOR: Backward-compatible facade (chordRecognitionService.ts) delegates to the orchestrator to reduce duplication and simplify imports',
      ],
      breaking: [
        'Audio mixture service supporting chord playback - initial release (no soundfont available) '
      ]
    },

    {
      version: 'v0.4.1',
      date: 'August 17, 2025',
      title: 'Roman Numeral Integration & Component Architecture Improvements',
      description: 'Enhanced Roman numeral functionality with guitar chord integration, major component refactoring, and UI/UX improvements',
      features: [
        'NEW: Roman Numeral Analysis in Guitar Chords Tab - Integrated Roman numeral chord analysis functionality directly into the guitar chords tab for comprehensive music theory analysis',
      ],
      technical: [
        'REFACTORING: Analysis Page Components - Completed major refactoring work across multiple analysis page components for improved maintainability and performance',
        'REFACTORING: Chord Grid Architecture - Restructured chord grid component architecture with better separation of concerns and reusable patterns',
        'REFACTORING: Lyrics Transcription Components - Broke down LeadSheetDisplay component into smaller, reusable components: LyricsControls, NoLyricsMessage, and LyricLine for better modularity',
        'FIX: Chord Label Display Consistency - Fixed guitar chord diagram display inconsistency with roman numeral analysis',
        'FIX: YouTube Video Player Resizing - Resolved video player resizing issues when lyrics or AI chat panels are opened for better space optimization',
        'UI: Roman Numeral Typography - Fixed typography and positioning for Roman numeral displays',
        'UI: Changelog Design - Redesigned changelog interface for enhanced readability and better information hierarchy',
        'UI: Layout Stability - Fixed layout shift issues in toggle button groups for smoother user interactions',
        'UI: Added background color for cell where modulation occurs to indicate key change'
      ],
      breaking: []
    },
    {
      version: 'v0.4.0',
      date: 'August 15, 2025',
      title: 'Roman Numeral Analysis & Backend Architecture Refactoring',
      description: 'Major feature release introducing Roman numeral chord analysis and comprehensive backend refactoring for improved maintainability',
      features: [
        'NEW: Roman Numeral Analysis (Beta) - Added Roman numeral chord notation display below chord labels for music theory analysis',
        'NEW: Key Detection Integration - Roman numerals automatically adapt to detected song key with proper chord function analysis',
        'NEW: Roman Numeral Toggle - Added dedicated toggle button with beta tag in the chord grid controls',
        'ARCHITECTURE: Backend Refactoring - Factored monolithic Python app.py into modular services, blueprints, and endpoints',
        'PERFORMANCE: Improved chord-to-Roman numeral mapping with robust sequence alignment handling',
        'UI: Enhanced chord grid with optional Roman numeral display for music education and analysis'
      ],
      technical: [
        'Implemented Roman numeral mapping logic with sequence correction handling for accurate chord function analysis',
        'Refactored Python backend from monolithic app.py into organized blueprints: audio, chord_recognition, debug, key_detection',
        'Created dedicated service modules for audio processing, chord utilities, and key analysis',
        'Added robust chord sequence alignment algorithm to handle timing discrepancies between UI and analysis data',
        'Integrated Roman numeral analysis with existing key detection and chord recognition pipelines',
        'Cleaned up debug console logs from Roman numeral mapping and authentication flows'
      ],
      breaking: [
        'Roman Numeral Analysis marked as [beta] - feature may evolve based on user feedback and music theory requirements'
      ]
    },
    {
      version: 'v0.3.5',
      date: 'July 27, 2025',
      title: 'Enharmonic Inversion Fixes & Beat Detection Optimization',
      description: 'Critical fixes for enharmonic chord inversions and madmom beat detection optimization for songs starting at 0 seconds',
      features: [
        'FIX: Enharmonic Inversion Corrections - Fixed enharmonic spelling for chord inversions with flats (Eb/3 → Eb/G, Bb/3 → Bb/D) and sharps (G#/3 → G#/B#)',
        'FIX: Madmom Beat Detection Optimization - Fixed madmom models skipping optimal shift calculations for songs with first beat detected at or near 0 seconds',
        'PERFORMANCE: Chord Grid Alignment - Improved chord-to-downbeat alignment for songs that start immediately with strong beats',
        'MINOR FIX: 6 beats per measure now displayed as 6/8 time signature'
      ],
      technical: [
        'Enhanced enharmonic inversion logic to properly handle flat and sharp chord inversions with correct bass note spelling',
        'Fixed calculatePaddingAndShift function to separate padding calculation from shift optimization logic',
        'Removed aggressive early return condition (≤0.05s) that prevented shift calculation for songs starting at 0 seconds',
        'Maintained shift calculation for optimal chord alignment regardless of first beat timing',
        'Cleaned up debug console logs from useScrollAndAnimation, Firebase services, and analysis components'
      ],
      breaking: []
    },
    {
      version: 'v0.3.4',
      date: 'July 25, 2025',
      title: 'Guitar Chord Diagram Database Integration & Synchronization Fixes',
      description: 'Critical fixes for guitar chord diagram accuracy and chord-lyrics synchronization with official database integration',
      features: [
        'SYNC FIX: Chord-Lyrics Synchronization (Partial Fix) - Added musical note symbols (♪) for each chord change to improve sync between chords and lyrics sections, addressing sync issues for chords',
        'PERFORMANCE: Enharmonic Correction Optimization - Fixed enharmonic chord matching logic and optimized performance from O(n²) to O(n) complexity using hash map lookups',
        'BUG FIX: Chord Padding Click Issue - Fixed non-clickable chord padding for "N.C." (No Chord) vs "N/C" notation handling',
        'FIX: Replaced hardcoded chord database with official @tombatossals/chords-db database, ensuring accurate chord fingering patterns for all supported chord types',
        'FIX: Replaced unformatted chord labels under guitar chord diagrams with formatted forms matching beat chord grid'
      ],
      technical: [
        'Integrated official @tombatossals/chords-db/lib/guitar.json with 2069+ accurate chord fingering patterns',
        'Enhanced chord name parsing to support both colon notation (C:minor) from ML models and standard notation (Cm)',
        'Fixed enharmonic mapping to match database keys: C# → Csharp, F# → Fsharp for proper chord lookup',
        'Implemented comprehensive suffix mapping for both ML model outputs and standard chord notation',
        'Removed hardcoded FALLBACK_CHORD_DATABASE with incorrect fret positions and fingering patterns',
        'Added support for Unicode musical symbols (♯, ♭) and enhanced chord parsing regex patterns'
      ],
      breaking: [
        'Guitar Chord Diagram Database Integration - Replaced hardcoded fallback chord database with official @tombatossals/chords-db database, ensuring accurate chord fingering patterns for all supported chord types'
      ]
    },
    {
      version: 'v0.3.3',
      date: 'July 21, 2025',
      title: 'Chord Simplification & UI Improvements',
      description: 'Enhanced user experience with chord simplification toggle and responsive UI improvements',
      features: [
        'NEW: Chord simplification toggle that converts complex chord progressions into 5 basic chord types (Major, Minor, Augmented, Diminished, Suspended)',
        'IMPROVED: Synchronized lyrics toggle converted from checkbox to modern toggle button design',
        'IMPROVED: Moved synchronized toggle to lyrics panel header for better space utilization',
        'IMPROVED: Enhanced responsive layout for toggle buttons above YouTube frame',
        'IMPROVED: Mobile experience with horizontal scrollable button container that prevents UI overflow'
      ],
      technical: [
        'Implemented comprehensive chord simplification algorithm with support for 5 basic chord types',
        'Enhanced LyricsPanel component with header reorganization and improved toggle placement',
        'Added responsive toggle button container with cross-browser scrollbar hiding',
        'Optimized mobile layout with proper max-width constraints and overflow handling',
        'Updated documentation with comprehensive changelog section and feature descriptions'
      ],
      breaking: []
    },
    {
      version: 'v0.3.2',
      date: 'July 19, 2025',
      title: 'Enhanced Lyrics & Chords Display System',
      description: 'Core implementation improvements focusing on comprehensive chord display and intelligent section handling in the lyrics and chords tab',
      features: [
        'ENHANCED: Complete chord coverage in lyrics and chords tab - all chords now display even when outside lyrical sections',
        'NEW: Intelligent instrumental section placeholders with visual indicators ([Intro], [Outro], [Instrumental]) that support chord positioning',
        'NEW: AI chatbot segment label integration - section labels automatically appear above corresponding lyrics when segmentation data is available',
        'IMPROVED: Synchronized section visualization between beat/chord grid and lyrics display for better song structure understanding'
      ],
      technical: [
        'Implemented comprehensive chord timeline merging algorithm that identifies gaps between lyrical sections',
        'Added intelligent grouping of consecutive chords into chord-only sections with configurable gap threshold (4 seconds)',
        'Enhanced LeadSheetDisplay component with segmentation data integration and section label rendering',
        'Optimized chord positioning logic to handle instrumental placeholders, chord-only sections, and regular lyrics uniformly',
        'Improved component architecture with proper TypeScript typing and memoization for performance'
      ],
      breaking: []
    },
    {
      version: 'v0.3.1',
      date: 'July 16, 2025',
      title: 'UI Performance Optimization',
      description: 'Release focused on addressing some UI performance issues',
      features: [
        'PERFORMANCE: reduced re-renders in ChatbotSection by optimizing buildSongContext with memoization',
        'PERFORMANCE: decreased font size recalculation by memoizing',
        'PERFORMANCE: optimized chord shift logic by caching shift calculation to prevent redundant calculations',
        'PERFORMANCE: memoized row grouping to avoid repeated array operatons during render',
        'PERFORMANCE: reduced DOM operations, cached active line arrays, optimized deep cloning'
      ],
      technical: [
        'Memoized calculateOptimalShift and shifted chords array to avoid recomputation on every render',
        'Throttled high-frequency useEffect tied to currentTime to prevent excessive DOM reads and layout reflows',
        'Cached character arrays and memoized color interpolation in active lyric lines to reduce render-time CPU load',
        'Memoized buildSongContext to avoid object recreation and reduce ChatbotSection re-renders'
      ],
      breaking: []
    },
    {
      version: 'v0.3.0',
      date: 'July 15, 2025',
      title: 'Song Segmentation & UI Revamp',
      description: 'Major feature release introducing AI-powered song segmentation visualization and temporary edit capabilities for enhanced music analysis workflow',
      features: [
        'NEW: Song segmentation visualization with color-coded beat/chord grid sections (verse, chorus, bridge, etc.)',
        'NEW: Temporary edit mode for song titles and individual chord labels with intuitive UI controls',
        'UI: New UI for guitar chord diagrams under segmentation',
        'UI: Homepage UI revamp with new layout and structure',
      ],
      technical: [
        'Segmentation features supported by LLM learning the context of chords and lyrics transcription',
        'Edit mode support temporary editing from users',
        'Synchronize beat chord grid between chord grid and guitar chord diagrams'
      ],
      breaking: [
        'Segmentation feature is in experimental mode - expect changes to the feature and its implementation'
      ]
    },
    {
      version: 'v0.2.6',
      date: 'July 9, 2025',
      title: 'UI Revamp & Model Selection Improvements',
      description: 'Major UI improvements with HeroUI component migration, streamlined model selection workflow, and enhanced user experience',
      features: [
        'UI: Migrated to HeroUI component library for better consistency and maintainability',
        'UI: Streamlined model selection workflow by removing redundant standalone model selection page',
        'UI: Enhanced embedded model selectors with improved accessibility (aria-labels and textValue props)',
        'UI: Fixed upload audio button styling with proper contrast and blue accent theme (#1e40af)',
        'UI: Improved API key management instructions with more concise Music.AI workflow setup guidance',
        'BACKEND: Fixed model selection API endpoint routing from direct backend calls to Next.js API routes',
        'BACKEND: Resolved status page localhost endpoint configuration issues'
      ],
      technical: [
        'Removed standalone /model-selection page and ModelSelectionInterface component to eliminate code duplication',
        'Fixed HeroUIChordModelSelector API endpoint from ${backendUrl}/chord-model-info to /api/model-info',
        'Added proper accessibility attributes to HeroUI Select components (textValue, aria-label)',
        'Enhanced button styling with explicit background colors and hover states for better contrast',
        'Simplified Music.AI API key setup instructions while maintaining essential workflow information'
      ],
      breaking: [
        'Removed /model-selection route - model selection is now embedded in analyze pages only'
      ]
    },
    {
      version: 'v0.2.5',
      date: 'July 8, 2025',
      title: 'Search UI Enhancements & Backend Port Update',
      description: 'Enhanced search functionality with improved dropdown width, simplified result display, and backend port configuration update for macOS compatibility',
      features: [
        'UI: Expanded sticky search bar dropdown width to span full width of search input and upload button combined',
        'UI: Simplified search results display by removing view count and duration metadata',
        'UI: Fixed search results clearing bug when search input is emptied',
        'UI: Enhanced beat timeline visualization with improved proportional downbeat bars',
        'UI: Improved mini search box functionality in navigation bar with dropdown results and state synchronization',
        'BACKEND: Updated localhost backend URL from port 5000 to 5001 to avoid conflict with macOS AirDrop/AirTunes',
        'BACKEND: Centralized backend URL configuration through environment variables for better maintainability'
      ],
      technical: [
        'Moved search dropdown positioning from form-relative to parent container-relative for full width spanning',
        'Removed duration and view count display from SearchResults ThumbnailImage component',
        'Enhanced search state synchronization between main and sticky search components',
        'Updated all backend URL references to use port 5001 instead of 5000',
        'Maintained 400ms debouncing for optimal search performance and YouTube API quota management'
      ],
      breaking: [
        'Backend port changed from 5000 to 5001 - update local development environment accordingly'
      ]
    },
    {
      version: 'v0.2.4',
      date: 'July 7, 2025',
      title: 'Critical Stability & UI Fixes',
      description: 'Essential fixes for React infinite loops, layout spacing issues, and production build optimizations',
      features: [
        'STABILITY: Fixed React "Maximum update depth exceeded" infinite loop errors in Lyrics & Chords tab',
        'STABILITY: Resolved circular dependencies in useScrollAndAnimation and LeadSheetDisplay components',
        'STABILITY: Eliminated duplicate beat tracking that caused state conflicts and crashes',
        'UI: Fixed excessive white space above "Analysis Results" title for better visual layout',
        'UI: Improved guitar chord diagram animation smoothness with reduced scale differences',
        'UI: Fixed musicAI.png image aspect ratio warning for proper rendering',
        'CLEANUP: Removed all console logging statements from guitar chord diagram functionality',
        'CLEANUP: Eliminated debug logs from chord parsing and pattern suffix mapping',
        'BUILD: Fixed TypeScript compilation errors and unused variable warnings'
      ],
      technical: [
        'useEffect dependency arrays optimized to prevent infinite re-renders',
        'Removed setCurrentTime from useScrollAndAnimation hook dependencies',
        'Fixed memoizedChords usage in LeadSheetDisplay component',
        'Eliminated redundant beat tracking in analyze page',
        'Reduced container padding from p-4 to px-4 pt-2 pb-1 for better spacing',
        'Image component aspect ratio properly maintained without style overrides'
      ],
      breaking: []
    },
    {
      version: 'v0.2.3',
      date: 'July 7, 2025',
      title: 'Music.AI Caching & UI Polish',
      description: 'Critical fixes for Music.AI lyrics caching, React performance optimizations, and enhanced user interface with globe icon for translations',
      features: [
        'CACHING: Fixed Music.AI lyrics caching to Firestore - no more expensive repeated API calls',
        'CACHING: Implemented unauthenticated public caching for ML model outputs (lyrics transcriptions)',
        'CACHING: Updated Firestore security rules to support safe public caching of transcription results',
        'PERFORMANCE: Fixed React "Maximum update depth exceeded" errors in lyrics & chord tab',
        'PERFORMANCE: Added proper memoization with useMemo and useCallback to prevent infinite re-renders',
        'PERFORMANCE: Optimized useEffect dependency arrays to eliminate unnecessary component updates',
        'UI: Added professional globe icon (🌐) to translate lyrics button with light/dark mode support',
        'UI: Enhanced visual consistency with custom SVG icon integration',
        'CLEANUP: Removed all remaining console logs with emoji prefixes for production-ready code',
        'CLEANUP: Eliminated debug logs from AnalyzePage, AudioProcessing, Metronome, and Auth services',
        'STABILITY: Fixed build issues with dynamic imports and improved error handling in cache routes'
      ],
      technical: [
        'Firebase authentication issue resolved for server-side API routes',
        'Firestore security rules updated to allow unauthenticated writes to lyrics collection',
        'React hooks optimized with proper dependency management',
        'LeadSheetDisplay component performance significantly improved',
        'Source map errors eliminated from production builds'
      ],
      breaking: []
    },
    {
      version: 'v0.2.2',
      date: 'July 6, 2025',
      title: 'Performance Revolution & Metronome Redesign',
      description: 'Major performance optimizations with 90%+ improvements and complete metronome system redesign for professional-grade functionality',
      features: [
        'PERFORMANCE: Beat-chord grid alignment optimization with two-pointer replacing brute force (90%+ improvement)',
        'PERFORMANCE: React component memoization reducing re-renders by 80-90%',
        'METRONOME: Complete redesign using pre-generated audio tracks for perfect synchronization',
        'METRONOME: 300% volume boost with 360% downbeat emphasis for clear audibility',
        'METRONOME: Perfect sync - starts from current playback position instead of restarting',
        'METRONOME: Continuous playback throughout entire song duration',
        'ANIMATION: Fixed critical regression where clicking chord cells froze beat tracking',
        'OPTIMIZATION: Binary search O(log n) beat tracking replacing O(n) algorithms',
        'OPTIMIZATION: Bundle size maintained at 438kB while adding significant functionality',
        'CLEANUP: Removed excessive console logging for cleaner development experience'
      ],
      breaking: [
        'Metronome now uses pre-generated tracks instead of real-time scheduling',
        'Legacy metronome scheduling methods deprecated but maintained for compatibility'
      ]
    },
    {
      version: 'v0.2.0',
      date: 'July 5, 2025',
      title: 'Guitar Chords Tab & Enhanced Music Analysis',
      description: 'Major feature release introducing interactive guitar chord diagrams with professional music notation',
      features: [
        'NEW: Guitar Chords tab with interactive chord diagram visualization',
        'Animated chord progression view that adapts to your screen size',
        'Professional musical notation with proper sharp (♯) and flat (♭) symbols',
        'Enhanced chord recognition with support for complex chord types',
        'Smoother animations and improved visual experience',
        'Comprehensive credits section acknowledging open-source contributions'
      ],
      breaking: [
        'Guitar Chords and Lyrics & Chords tabs marked as [beta] - features may evolve based on feedback'
      ]
    },
    {
      version: 'v0.1.2',
      date: 'July 4, 2025',
      title: 'Improved YouTube Audio Processing',
      description: 'Enhanced reliability and performance for YouTube audio extraction with better Unicode support',
      features: [
        'Improved YouTube audio extraction with better reliability',
        'Enhanced support for international song titles and artist names',
        'Streamlined setup process for local development',
        'Better error handling and user feedback during audio processing',
        'Improved performance and stability for production deployments'
      ],
      breaking: [
        'Local development now requires Python backend running on localhost:5001 (avoiding macOS AirTunes port 5000 conflict)'
      ]
    },
    {
      version: 'v0.1.1',
      date: 'July 2, 2025',
      title: 'Critical Bug Fixes & Performance Improvements',
      description: 'Resolved critical production issues affecting chord synchronization and performance warnings',
      features: [
        'Fixed chord synchronization API failure (HTTP 400 errors) for direct file uploads',
        'Resolved 413 "Payload Too Large" errors for files >4MB in blob upload workflow',
        'Created new /api/synchronize-chords endpoint for direct chord-beat synchronization',
        'Enhanced service worker error handling to prevent console warnings',
        'Optimized resource preloading to eliminate unused preload warnings',
        'Achieved functional equivalence between YouTube and direct upload workflows',
        'Improved production console output with cleaner error handling',
        'Enhanced blob upload workflow with proper API contract matching',
        'Zero build warnings and clean compilation for production deployment'
      ]
    },
    {
      version: 'v0.1.0',
      date: 'June 30, 2025',
      title: 'Production Ready Release',
      description: 'Complete chord recognition and music analysis platform with AI assistance',
      features: [
        'YouTube integration with audio extraction using yt-dlp',
        'Advanced chord recognition with multiple models (Chord-CNN-LSTM, BTC SL/PL)',
        'Beat detection using Beat-Transformer and madmom models',
        'Lyrics transcription and translation with Music.ai and Gemini APIs',
        'AI chatbot assistant with contextual music analysis',
        'Synchronized metronome with Web Audio API',
        'Dark/light mode theme support',
        'API key management with client-side encryption',
        'Firebase caching for analysis results and translations',
        'Karaoke-style lyrics with letter-by-letter synchronization',
        'Enharmonic chord correction with toggle functionality',
        'Lead sheet layout with professional music notation',
        'Dynamic chord grid visualization with beat alignment',
        'Multi-language lyrics translation support'
      ]
    }
  ];


  return (
    <div className="min-h-screen bg-white dark:bg-dark-bg transition-colors duration-300">
      <Navigation />
      <div className="container mx-auto px-4 py-12 md:py-16">
        {/* Header */}
        <div className="text-center mb-12 md:mb-16">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-black dark:text-white mb-4">
            Release Notes
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
            Follow the journey of our product. Here’s a detailed log of every feature, fix, and improvement we’ve shipped.
          </p>
        </div>

        {/* Announcement Banner */}
        {/* <div className="max-w-6xl mx-auto mb-12">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 rounded-full opacity-75 group-hover:opacity-100 blur transition duration-300"></div>
            <div className="relative flex items-center justify-center px-8 py-4 bg-black dark:bg-gray-900 rounded-full border border-gray-700">
              <span className="text-white font-mono text-sm md:text-base tracking-wide">
                🎵 PITCH SHIFTING & REAL INSTRUMENT SOUNDFONTS NOW AVAILABLE! →
              </span>
            </div>
          </div>
        </div> */}

        {/* Timeline Container */}
        <div className="relative max-w-6xl mx-auto">
          {/* The vertical line in the middle of the timeline */}
          <div className="absolute left-6 top-2 h-full w-0.5 bg-gray-200 dark:bg-gray-700" aria-hidden="true"></div>

          <div className="relative space-y-12">
            {releases.map((release, index) => (
              <div key={index} className="relative">
                {/* The dot on the timeline */}
                <div className="absolute left-6 top-2 w-4 h-4 rounded-full bg-primary-600 border-4 border-white dark:border-dark-bg transform -translate-x-1/2" aria-hidden="true"></div>

                {/* Main Content Flex Container */}
                <div className="flex flex-col md:flex-row gap-4 md:gap-8 ml-14">

                  {/* Left Column: Date and Version */}
                  <div className="w-full md:w-36 flex-shrink-0 md:text-right">
                    <p className="font-semibold text-gray-800 dark:text-gray-200">{release.date}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 text-xs font-semibold tracking-wide uppercase rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      {release.version}
                    </span>
                  </div>

                  {/* Right Column: Release Details */}
                  <div className="flex-grow bg-gray-50 dark:bg-content-bg p-6 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                    <h2 className="text-2xl font-bold text-black dark:text-white">{release.title}</h2>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">{release.description}</p>

                    <div className="mt-6 space-y-6">
                      {/* Features Section */}
                      {release.features && release.features.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">Features & Improvements</h3>
                          <ul className="mt-3 space-y-3">
                            {release.features.map((item, index) => (
                              <li key={index}>{renderChangeItem(item, 'text-blue-500 dark:text-blue-400')}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Technical Section */}
                      {release.technical && release.technical.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold uppercase tracking-wider text-green-600 dark:text-green-400">Technical</h3>
                          <ul className="mt-3 space-y-3">
                            {release.technical.map((item, index) => (
                              <li key={index}>{renderChangeItem(item, 'text-green-500 dark:text-green-400')}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Breaking Changes Section */}
                      {release.breaking && release.breaking.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">Core Changes</h3>
                          <ul className="mt-3 space-y-3">
                            {release.breaking.map((item, index) => (
                              <li key={index} className="flex items-start gap-3">
                                <svg className="w-4 h-4 mt-1 flex-shrink-0 text-red-500 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M8.257 3.099c.636-1.214 2.26-1.214 2.896 0l6.363 12.176c.61 1.166-.27 2.612-1.58 2.612H3.078c-1.31 0-2.19-1.446-1.58-2.612L8.257 3.099zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-3a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd"></path>
                                </svg>
                                <span className="text-gray-700 dark:text-gray-300">{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}