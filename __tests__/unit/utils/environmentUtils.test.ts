/**
 * Unit Tests: environmentUtils
 *
 * Covers environment detection, AbortSignal timeout fallback behavior, and
 * environment-specific error message variants.
 */

import {
  createSafeTimeoutSignal,
  detectEnvironment,
  getEnvironmentSpecificErrorMessage,
  isAbortSignalTimeoutAvailable,
} from '@/utils/environmentUtils';

describe('environmentUtils', () => {
  const originalEnv = process.env;
  const originalTimeout = AbortSignal.timeout;
  const originalUserAgent = navigator.userAgent;

  const restoreUserAgent = () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
    });
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    process.env = { ...originalEnv };
    Object.defineProperty(AbortSignal, 'timeout', {
      value: originalTimeout,
      configurable: true,
    });
    restoreUserAgent();
  });

  afterAll(() => {
    process.env = originalEnv;
    Object.defineProperty(AbortSignal, 'timeout', {
      value: originalTimeout,
      configurable: true,
    });
    restoreUserAgent();
  });

  it('detects a Vercel production environment with runtime metadata', () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL = '1';
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'JestBrowser/1.0',
      configurable: true,
    });

    const env = detectEnvironment();

    expect(env.isProduction).toBe(true);
    expect(env.isVercel).toBe(true);
    expect(env.isLocalDevelopment).toBe(false);
    expect(env.nodeVersion).toBe(process.version);
    expect(env.userAgent).toBe('JestBrowser/1.0');
  });

  it('detects local development when not running in production or Vercel', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;

    const env = detectEnvironment();

    expect(env.isProduction).toBe(false);
    expect(env.isVercel).toBe(false);
    expect(env.isLocalDevelopment).toBe(true);
  });

  it('reports AbortSignal.timeout availability accurately', () => {
    Object.defineProperty(AbortSignal, 'timeout', {
      value: jest.fn(),
      configurable: true,
    });
    expect(isAbortSignalTimeoutAvailable()).toBe(true);

    Object.defineProperty(AbortSignal, 'timeout', {
      value: undefined,
      configurable: true,
    });
    expect(isAbortSignalTimeoutAvailable()).toBe(false);
  });

  it('uses AbortSignal.timeout when it is available', () => {
    const controller = new AbortController();
    const timeoutSpy = jest.fn(() => controller.signal);

    Object.defineProperty(AbortSignal, 'timeout', {
      value: timeoutSpy,
      configurable: true,
    });

    const signal = createSafeTimeoutSignal(250);

    expect(signal).toBe(controller.signal);
    expect(timeoutSpy).toHaveBeenCalledWith(250);
  });

  it('falls back to AbortController when AbortSignal.timeout throws', () => {
    jest.useFakeTimers();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    Object.defineProperty(AbortSignal, 'timeout', {
      value: jest.fn(() => {
        throw new Error('Unsupported runtime');
      }),
      configurable: true,
    });

    const signal = createSafeTimeoutSignal(50);
    expect(signal.aborted).toBe(false);

    jest.advanceTimersByTime(50);

    expect(signal.aborted).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
  });

  describe('getEnvironmentSpecificErrorMessage', () => {
    const cases = [
      {
        label: 'Vercel timeout guidance',
        env: { NODE_ENV: 'production', VERCEL: '1' },
        type: 'timeout' as const,
        match: "Vercel's 60-second timeout limit",
      },
      {
        label: 'production timeout guidance',
        env: { NODE_ENV: 'production' },
        type: 'timeout' as const,
        match: 'server timeout limits',
      },
      {
        label: 'local timeout guidance',
        env: { NODE_ENV: 'development' },
        type: 'timeout' as const,
        match: 'shorter audio file',
      },
      {
        label: 'Vercel network guidance',
        env: { NODE_ENV: 'production', VERCEL_ENV: 'preview' },
        type: 'network' as const,
        match: "Vercel's network configuration",
      },
      {
        label: 'local network guidance',
        env: { NODE_ENV: 'development' },
        type: 'network' as const,
        match: 'internet connection',
      },
      {
        label: 'Vercel compatibility guidance',
        env: { NODE_ENV: 'production', VERCEL: '1' },
        type: 'compatibility' as const,
        match: 'production environment',
      },
      {
        label: 'production compatibility guidance',
        env: { NODE_ENV: 'production' },
        type: 'compatibility' as const,
        match: 'browser compatibility issue',
      },
      {
        label: 'local compatibility guidance',
        env: { NODE_ENV: 'development' },
        type: 'compatibility' as const,
        match: 'may be a browser compatibility issue',
      },
      {
        label: 'Vercel general guidance',
        env: { NODE_ENV: 'production', VERCEL: '1' },
        type: 'general' as const,
        match: "Vercel's production environment",
      },
      {
        label: 'production general guidance',
        env: { NODE_ENV: 'production' },
        type: 'general' as const,
        match: 'contact support',
      },
      {
        label: 'local general guidance',
        env: { NODE_ENV: 'development' },
        type: 'general' as const,
        match: 'Please try again.',
      },
    ];

    it.each(cases)('returns $label', ({ env, type, match }) => {
      process.env = { ...originalEnv, ...env };
      delete process.env.VERCEL;
      delete process.env.VERCEL_ENV;
      process.env = { ...process.env, ...env };

      const message = getEnvironmentSpecificErrorMessage('Base error.', type);

      expect(message).toContain('Base error.');
      expect(message).toContain(match);
    });
  });
});