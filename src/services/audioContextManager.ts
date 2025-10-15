/*
 * Centralized AudioContext manager (singleton)
 * - Lazy initializes on first access
 * - Handles resume/suspend for autoplay policies (Safari/iOS friendly)
 * - Exposes convenience helpers for currentTime and lifecycle
 */

export class AudioContextManager {
  private static _instance: AudioContextManager | null = null;
  private _ctx: AudioContext | null = null;
  private _isInitializing = false;

  static get instance(): AudioContextManager {
    if (!this._instance) this._instance = new AudioContextManager();
    return this._instance;
  }

  // Create or return the shared AudioContext
  getContext(): AudioContext {
    if (typeof window === 'undefined') {
      throw new Error('AudioContext is only available in browser environment');
    }

    if (!this._ctx) {
      // Use webkitAudioContext fallback for Safari
      const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      this._ctx = new Ctor({ latencyHint: 'interactive', sampleRate: 44100 } as AudioContextOptions);

      // Best effort: ensure resume on first user interaction
      this.attachAutoResumeListeners();
    }
    return this._ctx;
  }

  getCurrentTime(): number {
    return this._ctx?.currentTime ?? 0;
  }

  async resume(): Promise<void> {
    if (!this._ctx) return;
    if (this._ctx.state === 'suspended' && !this._isInitializing) {
      this._isInitializing = true;
      try {
        await this._ctx.resume();
      } finally {
        this._isInitializing = false;
      }
    }
  }

  async suspend(): Promise<void> {
    if (!this._ctx) return;
    if (this._ctx.state === 'running') {
      try { await this._ctx.suspend(); } catch { /* noop */ }
    }
  }

  async close(): Promise<void> {
    if (!this._ctx) return;
    try {
      await this._ctx.close();
    } catch { /* noop */ }
    this._ctx = null;
  }

  private _autoResumeHandler = async () => {
    try { await this.resume(); } catch { /* noop */ }
  };

  private attachAutoResumeListeners() {
    if (typeof window === 'undefined') return;
    const evts: Array<keyof WindowEventMap> = ['click', 'touchstart', 'keydown'];
    evts.forEach(evt => window.addEventListener(evt, this._autoResumeHandler, { once: true, passive: true }));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this._autoResumeHandler();
      }
    });
  }
}

export const audioContextManager = AudioContextManager.instance;

