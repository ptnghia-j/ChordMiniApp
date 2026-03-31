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

  private getContextState(ctx: AudioContext | null = this._ctx): AudioContextState | 'interrupted' | 'closed' {
    if (!ctx) {
      return 'closed';
    }
    return ctx.state as AudioContextState | 'interrupted';
  }

  static get instance(): AudioContextManager {
    if (!this._instance) this._instance = new AudioContextManager();
    return this._instance;
  }

  // Create or return the shared AudioContext
  getContext(): AudioContext {
    if (typeof window === 'undefined') {
      throw new Error('AudioContext is only available in browser environment');
    }

    if (!this._ctx || this._ctx.state === 'closed') {
      if (this._ctx?.state === 'closed') {
        this._ctx = null;
      }

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
    const currentState = this.getContextState();
    if (currentState === 'closed') return;

    if ((currentState === 'suspended' || currentState === 'interrupted') && !this._isInitializing) {
      this._isInitializing = true;
      try {
        await this._ctx.resume();
      } finally {
        this._isInitializing = false;
      }
    }

    const resumedState = this.getContextState();
    const shouldRecreateContext = resumedState === 'interrupted'
      || (
        resumedState === 'suspended'
        && typeof document !== 'undefined'
        && document.visibilityState === 'visible'
      );

    if (!shouldRecreateContext) {
      return;
    }

    const staleContext = this._ctx;
    this._ctx = null;

    try {
      await staleContext?.close();
    } catch {
      // Some browsers refuse to close a context that is already effectively gone.
      // In that case we still continue by creating a fresh one below.
    }

    const freshContext = this.getContext();
    const freshState = this.getContextState(freshContext);
    if (freshState === 'suspended' || freshState === 'interrupted') {
      await freshContext.resume();
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
