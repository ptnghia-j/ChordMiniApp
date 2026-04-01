import type { InstrumentEnvelopeConfig } from '../instrumentEnvelopeConfig';
import type { LoadableInstrument, SoundfontInstrumentInstance } from './types';

let smplrModule: typeof import('smplr') | null = null;

async function getSmplr() {
  if (!smplrModule) {
    smplrModule = await import('smplr');
  }
  return smplrModule;
}

export async function loadSoundfontInstrument(
  audioContext: AudioContext,
  instrumentName: string,
  envelope: InstrumentEnvelopeConfig,
  soundfontKit?: string,
): Promise<SoundfontInstrumentInstance> {
  const { Soundfont } = await getSmplr();
  const instrument = new Soundfont(audioContext, {
    instrument: instrumentName,
    ...(soundfontKit ? { kit: soundfontKit } : {}),
    decayTime: envelope.decayTime,
    loadLoopData: envelope.loadLoopData,
  });

  const loadable = instrument as unknown as LoadableInstrument;
  if (typeof loadable.load === 'function') {
    await loadable.load();
  } else if (typeof loadable.loaded === 'function') {
    await loadable.loaded();
  }

  return instrument as unknown as SoundfontInstrumentInstance;
}
