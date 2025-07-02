/**
 * Test setup file for the analyze page test suite
 * Configures global mocks and test environment
 */

import '@testing-library/jest-dom';

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock HTMLMediaElement methods
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  writable: true,
  value: jest.fn().mockImplementation(() => Promise.resolve()),
});

Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  writable: true,
  value: jest.fn(),
});

Object.defineProperty(HTMLMediaElement.prototype, 'load', {
  writable: true,
  value: jest.fn(),
});

// Mock HTMLMediaElement properties
Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
  writable: true,
  value: 0,
});

Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
  writable: true,
  value: 180,
});

Object.defineProperty(HTMLMediaElement.prototype, 'playbackRate', {
  writable: true,
  value: 1,
});

Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
  writable: true,
  value: 1,
});

Object.defineProperty(HTMLMediaElement.prototype, 'muted', {
  writable: true,
  value: false,
});

Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
  writable: true,
  value: true,
});

Object.defineProperty(HTMLMediaElement.prototype, 'ended', {
  writable: true,
  value: false,
});

Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
  writable: true,
  value: 4, // HAVE_ENOUGH_DATA
});

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => 'mocked-url');
global.URL.revokeObjectURL = jest.fn();

// Mock fetch
global.fetch = jest.fn();

// Mock console methods to reduce noise in tests
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterEach(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Mock Firebase
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(),
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  getDocs: jest.fn(),
}));

// Mock Next.js Image component
jest.mock('next/image', () => {
  return function MockImage(props: any) {
    return props;
  };
});

// Mock Next.js Link component
jest.mock('next/link', () => {
  return function MockLink({ children, href, ...props }: any) {
    return { children, href, ...props };
  };
});

// Mock environment variables
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'mock-api-key';
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'mock-auth-domain';
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'mock-project-id';
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'mock-storage-bucket';
process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = 'mock-sender-id';
process.env.NEXT_PUBLIC_FIREBASE_APP_ID = 'mock-app-id';

// Mock Web Audio API
const mockAudioContext = {
  createAnalyser: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    fftSize: 2048,
    frequencyBinCount: 1024,
    getByteFrequencyData: jest.fn(),
    getByteTimeDomainData: jest.fn(),
  })),
  createGain: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    gain: { value: 1 },
  })),
  createMediaElementSource: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
  })),
  destination: {},
  sampleRate: 44100,
  currentTime: 0,
  state: 'running',
  suspend: jest.fn(),
  resume: jest.fn(),
  close: jest.fn(),
};

global.AudioContext = jest.fn(() => mockAudioContext);
global.webkitAudioContext = jest.fn(() => mockAudioContext);

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn((cb) => setTimeout(cb, 16));
global.cancelAnimationFrame = jest.fn((id) => clearTimeout(id));

// Mock performance API
global.performance = {
  ...global.performance,
  now: jest.fn(() => Date.now()),
};

// Mock Worker
global.Worker = class MockWorker {
  constructor(stringUrl: string | URL) {}
  postMessage(message: any) {}
  terminate() {}
  addEventListener(type: string, listener: EventListener) {}
  removeEventListener(type: string, listener: EventListener) {}
  dispatchEvent(event: Event): boolean { return true; }
  onmessage: ((this: Worker, ev: MessageEvent) => any) | null = null;
  onmessageerror: ((this: Worker, ev: MessageEvent) => any) | null = null;
  onerror: ((this: AbstractWorker, ev: ErrorEvent) => any) | null = null;
};

// Mock Blob
global.Blob = class MockBlob {
  constructor(parts?: BlobPart[], options?: BlobPropertyBag) {}
  size: number = 0;
  type: string = '';
  arrayBuffer(): Promise<ArrayBuffer> { return Promise.resolve(new ArrayBuffer(0)); }
  slice(start?: number, end?: number, contentType?: string): Blob { return new MockBlob(); }
  stream(): ReadableStream<Uint8Array> { return new ReadableStream(); }
  text(): Promise<string> { return Promise.resolve(''); }
};

// Mock FileReader
global.FileReader = class MockFileReader {
  readAsArrayBuffer(blob: Blob) {}
  readAsDataURL(blob: Blob) {}
  readAsText(blob: Blob) {}
  abort() {}
  result: string | ArrayBuffer | null = null;
  error: DOMException | null = null;
  readyState: number = 0;
  onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
  onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
  onabort: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
  onloadstart: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
  onloadend: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
  onprogress: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
  addEventListener(type: string, listener: EventListener) {}
  removeEventListener(type: string, listener: EventListener) {}
  dispatchEvent(event: Event): boolean { return true; }
  EMPTY: number = 0;
  LOADING: number = 1;
  DONE: number = 2;
};

// Export test utilities
export const createMockAnalysisResults = (overrides = {}) => ({
  chords: [
    { chord: 'C', time: 0.5 },
    { chord: 'F', time: 2.0 },
    { chord: 'G', time: 3.5 },
  ],
  beats: [
    { time: 0.5 },
    { time: 1.0 },
    { time: 1.5 },
    { time: 2.0 },
  ],
  downbeats: [0.5, 2.5],
  downbeats_with_measures: [0.5, 2.5],
  synchronizedChords: [
    { chord: 'C', beatIndex: 0, beatNum: 1 },
    { chord: 'F', beatIndex: 2, beatNum: 1 },
  ],
  beatModel: 'beat-transformer',
  chordModel: 'chord-cnn-lstm',
  audioDuration: 180,
  beatDetectionResult: {
    time_signature: 4,
    bpm: 120,
    beatShift: 0,
  },
  ...overrides,
});

export const createMockVideoMetadata = (overrides = {}) => ({
  videoId: 'dQw4w9WgXcQ',
  title: 'Test Video Title',
  duration: '3:30',
  channel: 'Test Channel',
  thumbnail: 'https://example.com/thumb.jpg',
  ...overrides,
});

export const waitForNextTick = () => new Promise(resolve => setTimeout(resolve, 0));
