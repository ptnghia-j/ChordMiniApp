/**
 * Centralized dynamic imports for better bundle splitting
 * This file manages all heavy component imports to reduce initial bundle size
 */

// Audio processing imports - lazy load heavy services
export const loadAudioProcessor = () => import(
  /* webpackChunkName: "audio-processor" */
  /* webpackPreload: true */
  '@/services/audioProcessingService'
);
export const loadChordRecognition = () => import(
  /* webpackChunkName: "chord-recognition" */
  /* webpackPrefetch: true */
  '@/services/chordRecognitionService'
);
export const loadBeatDetection = () => import(
  /* webpackChunkName: "beat-detection" */
  /* webpackPrefetch: true */
  '@/services/beatDetectionService'
);

// Heavy UI components - split into separate chunks
export const loadChordGrid = () => import(
  /* webpackChunkName: "chord-grid" */
  /* webpackPrefetch: true */
  '@/components/ChordGrid'
);

// Lazy-loaded components for better bundle splitting
export const loadLazyRecentVideos = () => import(
  /* webpackChunkName: "recent-videos" */
  /* webpackPrefetch: true */
  '@/components/LazyRecentVideos'
);

export const loadLazySearchContainer = () => import(
  /* webpackChunkName: "search-container" */
  /* webpackPrefetch: true */
  '@/components/LazyIntegratedSearchContainer'
);
export const loadLeadSheetDisplay = () => import(
  /* webpackChunkName: "lead-sheet" */
  '@/components/LeadSheetDisplay'
);
export const loadLyricsSection = () => import(
  /* webpackChunkName: "lyrics-section" */
  '@/components/LyricsSection'
);
export const loadChatbotSection = () => import(
  /* webpackChunkName: "chatbot-section" */
  '@/components/ChatbotSection'
);

// Analysis components
export const loadAnalysisControls = () => import('@/components/AnalysisControls');
export const loadChordGridContainer = () => import('@/components/ChordGridContainer');
export const loadProcessingStatusBanner = () => import('@/components/ProcessingStatusBanner');

// Model selectors
export const loadBeatModelSelector = () => import('@/components/BeatModelSelector');
export const loadChordModelSelector = () => import('@/components/ChordModelSelector');

// Utility libraries (lazy loaded with chunk names)
export const loadChartJS = () => import(
  /* webpackChunkName: "chartjs-lib" */
  'chart.js'
);
export const loadFramerMotion = () => import(
  /* webpackChunkName: "framer-motion-lib" */
  'framer-motion'
);

// Firebase services - load only when needed (removed duplicates)
export const loadFirebaseAuth = () => import(
  /* webpackChunkName: "firebase-auth-service" */
  'firebase/auth'
);
export const loadFirebaseFirestore = () => import(
  /* webpackChunkName: "firebase-firestore-service" */
  'firebase/firestore'
);
export const loadFirebaseStorage = () => import(
  /* webpackChunkName: "firebase-storage-service" */
  'firebase/storage'
);

/**
 * Preload critical components during idle time
 */
export const preloadCriticalComponents = () => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => {
      // Preload components that are likely to be needed soon
      loadAnalysisControls();
      loadProcessingStatusBanner();
    });
  }
};

/**
 * Preload audio components when user shows intent to analyze
 */
export const preloadAudioComponents = () => {
  if (typeof window !== 'undefined') {
    // Use setTimeout as fallback for browsers without requestIdleCallback
    const preload = () => {
      loadAudioProcessor();
      loadChordRecognition();
      loadBeatDetection();
      loadChordGrid();
    };

    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(preload);
    } else {
      setTimeout(preload, 100);
    }
  }
};

/**
 * Load components based on user interaction
 */
export const loadOnDemand = {
  // Load when user clicks on analyze button
  analysis: () => Promise.all([
    loadAudioProcessor(),
    loadChordRecognition(),
    loadBeatDetection(),
    loadAnalysisControls()
  ]),

  // Load when user switches to lyrics tab
  lyrics: () => Promise.all([
    loadLyricsSection(),
    loadChatbotSection()
  ]),

  // Load when user needs visualization
  visualization: () => Promise.all([
    loadChordGrid(),
    loadLeadSheetDisplay(),
    loadChartJS()
  ]),

  // Load Firebase when authentication is needed
  firebase: () => Promise.all([
    loadFirebaseAuth(),
    loadFirebaseFirestore(),
    loadFirebaseStorage()
  ])
};

// Advanced dynamic import optimizations
export const preloadCriticalChunks = () => {
  if (typeof window !== 'undefined') {
    // Preload critical chunks during idle time
    requestIdleCallback(() => {
      loadFirebaseService();
      loadChartJS();
    });
  }
};

// Optimized Firebase service loading
// MIGRATION: Updated to use @/config/firebase instead of @/lib/firebase-lazy
export const loadFirebaseService = () => import(
  /* webpackChunkName: "firebase-service" */
  /* webpackPreload: true */
  '@/config/firebase'
);

// Optimized Chart.js loading with smaller chunks
export const loadChartJSCore = () => import(
  /* webpackChunkName: "chartjs-core" */
  'chart.js/auto'
);

// Chart.js plugins - only load if needed
export const loadChartJSPlugins = () => import(
  /* webpackChunkName: "chartjs-plugins" */
  'chart.js/helpers'
);