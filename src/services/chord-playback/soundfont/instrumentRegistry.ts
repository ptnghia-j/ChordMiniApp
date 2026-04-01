import { UNLOAD_DELAY_MS } from './constants';
import { loadSoundfontInstrument } from './smplrLoader';
import type { InstrumentEnvelopeConfig } from '../instrumentEnvelopeConfig';
import type { InstrumentName } from '@/utils/instrumentNoteGeneration';
import type { InstrumentRenderConfig, SoundfontInstrumentInstance } from './types';

export class SoundfontInstrumentRegistry {
  private instruments = new Map<InstrumentName, SoundfontInstrumentInstance>();
  private loadedInstruments = new Set<InstrumentName>();
  private loadingInstruments = new Set<InstrumentName>();
  private instrumentLoadPromises = new Map<InstrumentName, Promise<void>>();
  private unloadTimers = new Map<InstrumentName, NodeJS.Timeout>();

  constructor(
    private readonly getAudioContext: () => AudioContext | null,
    private readonly getEnvelope: (instrumentName: InstrumentName) => InstrumentEnvelopeConfig,
    private readonly getRenderConfig: (instrumentName: InstrumentName) => InstrumentRenderConfig,
    private readonly stopInstrumentNotes: (instrumentName: InstrumentName) => void,
  ) {}

  reset(): void {
    this.unloadTimers.forEach((timer) => {
      clearTimeout(timer);
    });
    this.unloadTimers.clear();
    this.instruments.clear();
    this.loadedInstruments.clear();
    this.loadingInstruments.clear();
    this.instrumentLoadPromises.clear();
  }

  getInstrument(instrumentName: InstrumentName): SoundfontInstrumentInstance | undefined {
    return this.instruments.get(instrumentName);
  }

  hasLoadedInstrument(instrumentName: InstrumentName): boolean {
    return this.loadedInstruments.has(instrumentName);
  }

  forEachLoadedInstrument(callback: (instrumentName: InstrumentName) => void): void {
    this.instruments.forEach((_instrument, instrumentName) => {
      callback(instrumentName);
    });
  }

  scheduleUnload(instrumentName: InstrumentName): void {
    const existingTimer = this.unloadTimers.get(instrumentName);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.unload(instrumentName);
      this.unloadTimers.delete(instrumentName);
    }, UNLOAD_DELAY_MS);

    this.unloadTimers.set(instrumentName, timer);
  }

  async ensureLoaded(instrumentName: InstrumentName): Promise<void> {
    if (this.loadedInstruments.has(instrumentName)) {
      const unloadTimer = this.unloadTimers.get(instrumentName);
      if (unloadTimer) {
        clearTimeout(unloadTimer);
        this.unloadTimers.delete(instrumentName);
      }
      return;
    }

    const existingPromise = this.instrumentLoadPromises.get(instrumentName);
    if (existingPromise) {
      await existingPromise;
      return;
    }

    const loadPromise = (async () => {
      const audioContext = this.getAudioContext();
      if (!audioContext) {
        throw new Error('AudioContext not available');
      }

      this.loadingInstruments.add(instrumentName);
      try {
        const renderConfig = this.getRenderConfig(instrumentName);
        const instrument = await loadSoundfontInstrument(
          audioContext,
          renderConfig.soundfontInstrument,
          this.getEnvelope(instrumentName),
          renderConfig.soundfontKit,
        );
        this.instruments.set(instrumentName, instrument);
        this.loadedInstruments.add(instrumentName);
      } finally {
        this.loadingInstruments.delete(instrumentName);
        this.instrumentLoadPromises.delete(instrumentName);
      }
    })();

    this.instrumentLoadPromises.set(instrumentName, loadPromise);
    await loadPromise;
  }

  dispose(): void {
    this.reset();
  }

  private unload(instrumentName: InstrumentName): void {
    if (!this.loadedInstruments.has(instrumentName)) {
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`🗑️ Unloading ${instrumentName} to free memory`);
    }

    this.stopInstrumentNotes(instrumentName);
    this.instruments.delete(instrumentName);
    this.loadedInstruments.delete(instrumentName);
  }
}
