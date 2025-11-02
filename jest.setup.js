import '@testing-library/jest-dom'

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}
global.localStorage = localStorageMock

// Mock sessionStorage
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}
global.sessionStorage = sessionStorageMock

// Mock window.matchMedia
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
})

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() {
    return null
  }
  disconnect() {
    return null
  }
  unobserve() {
    return null
  }
}

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  observe() {
    return null
  }
  disconnect() {
    return null
  }
  unobserve() {
    return null
  }
}

// Mock fetch
global.fetch = jest.fn()

// Mock Web Audio API
global.AudioContext = jest.fn().mockImplementation(() => ({
  createOscillator: jest.fn(() => ({
    connect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    frequency: { value: 440 }
  })),
  createGain: jest.fn(() => ({
    connect: jest.fn(),
    gain: { value: 1 }
  })),
  destination: {},
  sampleRate: 44100,
  currentTime: 0,
  state: 'running',
  resume: jest.fn(() => Promise.resolve()),
  suspend: jest.fn(() => Promise.resolve()),
  close: jest.fn(() => Promise.resolve())
}))

global.webkitAudioContext = global.AudioContext

// Mock Tone.js
jest.mock('tone', () => {
  const mockContext = {
    dispose: jest.fn(),
    resume: jest.fn(() => Promise.resolve()),
    suspend: jest.fn(() => Promise.resolve()),
    state: 'running',
    currentTime: 0,
    sampleRate: 44100,
    destination: {}
  };

  return {
    Context: jest.fn().mockImplementation(() => mockContext),
    setContext: jest.fn(),
    getContext: jest.fn(() => mockContext),
    start: jest.fn().mockResolvedValue(undefined),
    now: jest.fn(() => Date.now() / 1000),
    GrainPlayer: jest.fn().mockImplementation((options) => ({
      load: jest.fn(() => Promise.resolve()),
      start: jest.fn(),
      stop: jest.fn(),
      dispose: jest.fn(),
      connect: jest.fn(),
      loaded: true,
      buffer: {
        duration: 180,
        get: jest.fn(() => ({}))
      },
      pitch: 0,
      playbackRate: 1,
      volume: { value: 1 },
      detune: 0,
      onload: options?.onload
    })),
    Gain: jest.fn(() => ({
      gain: {
        rampTo: jest.fn(),
        value: 1
      },
      connect: jest.fn(),
      dispose: jest.fn()
    })),
    Filter: jest.fn(() => ({
      frequency: {
        rampTo: jest.fn(),
        value: 16000
      },
      connect: jest.fn(),
      dispose: jest.fn()
    })),
    Limiter: jest.fn(() => ({
      toDestination: jest.fn(),
      dispose: jest.fn()
    }))
  };
});

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // Uncomment to ignore specific console methods
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
}

// Mock next/router
jest.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '/',
      query: {},
      asPath: '/',
      push: jest.fn(),
      pop: jest.fn(),
      reload: jest.fn(),
      back: jest.fn(),
      prefetch: jest.fn(),
      beforePopState: jest.fn(),
      events: {
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
      },
    }
  },
}))

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    }
  },
  useSearchParams() {
    return new URLSearchParams()
  },
  usePathname() {
    return '/'
  },
  useParams() {
    return {}
  },
}))

// Mock Firebase
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  getApp: jest.fn(),
}))

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
}))

// Mock dynamic imports
jest.mock('next/dynamic', () => (func) => {
  const DynamicComponent = (props) => {
    const Component = func()
    return Component.default ? <Component.default {...props} /> : <Component {...props} />
  }
  DynamicComponent.displayName = 'DynamicComponent'
  return DynamicComponent
})

// Suppress specific warnings in tests
const originalError = console.error
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is no longer supported')
    ) {
      return
    }
    originalError.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalError
})
