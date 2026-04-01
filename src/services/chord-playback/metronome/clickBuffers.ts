import type { MetronomeBufferPair, MetronomeSoundStyle } from './types';

const EXTERNAL_AUDIO_PREFIX = 'librosa_';
const EXTERNAL_AUDIO_BASE_URL = '/audio/metronome';

function isExternalAudioStyle(style: MetronomeSoundStyle): boolean {
  return style.startsWith(EXTERNAL_AUDIO_PREFIX);
}

async function loadExternalAudioFile(
  audioContext: AudioContext,
  url: string,
): Promise<AudioBuffer | null> {
  const tryFetch = async (target: string) => {
    const response = await fetch(target, { cache: 'force-cache' });
    return response.ok ? response : null;
  };

  try {
    let response = await tryFetch(url);

    if (!response && typeof window !== 'undefined') {
      response = await tryFetch(new URL(url, window.location.origin).toString());
    }

    if (!response) {
      console.warn(`Metronome sample not found (404): ${url}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return await audioContext.decodeAudioData(arrayBuffer);
  } catch (error) {
    console.warn(`Error loading external audio file ${url}:`, error);
    return null;
  }
}

function generateTraditionalClick(
  data: Float32Array,
  sampleRate: number,
  isDownbeat: boolean,
): void {
  const baseFreq = isDownbeat ? 1800 : 1200;
  const attackTime = 0.001;

  for (let i = 0; i < data.length; i += 1) {
    const t = i / sampleRate;
    const phase = 2 * Math.PI * baseFreq * t;
    const sample = Math.sin(phase);
    const envelope = t < attackTime ? t / attackTime : Math.exp(-t * 25);
    data[i] = sample * envelope * 0.9;
  }
}

function generateDigitalClick(
  data: Float32Array,
  sampleRate: number,
  isDownbeat: boolean,
): void {
  const baseFreq = isDownbeat ? 1400 : 900;
  const attackTime = 0.001;

  for (let i = 0; i < data.length; i += 1) {
    const t = i / sampleRate;
    const phase = 2 * Math.PI * baseFreq * t;
    let sample = Math.sin(phase) * 0.8;
    sample += Math.sin(phase * 2) * 0.15;
    const envelope = t < attackTime ? t / attackTime : Math.exp(-t * 15);
    data[i] = sample * envelope;
  }
}

function generateWoodClick(
  data: Float32Array,
  sampleRate: number,
  isDownbeat: boolean,
): void {
  const baseFreq = isDownbeat ? 800 : 600;
  const attackTime = 0.001;

  for (let i = 0; i < data.length; i += 1) {
    const t = i / sampleRate;
    let sample = (Math.random() * 2 - 1) * 0.4;
    const phase1 = 2 * Math.PI * baseFreq * t;
    const phase2 = 2 * Math.PI * (baseFreq * 1.5) * t;
    const phase3 = 2 * Math.PI * (baseFreq * 2.2) * t;

    sample += Math.sin(phase1) * 0.3 * Math.exp(-t * 20);
    sample += Math.sin(phase2) * 0.2 * Math.exp(-t * 25);
    sample += Math.sin(phase3) * 0.1 * Math.exp(-t * 30);

    const envelope = t < attackTime ? t / attackTime : Math.exp(-t * 25);
    data[i] = sample * envelope;
  }
}

function generateBellClick(
  data: Float32Array,
  sampleRate: number,
  isDownbeat: boolean,
): void {
  const baseFreq = isDownbeat ? 1600 : 1200;
  const attackTime = 0.003;
  const sustainTime = 0.02;
  const releaseTime = 0.055;

  for (let i = 0; i < data.length; i += 1) {
    const t = i / sampleRate;
    const phase1 = 2 * Math.PI * baseFreq * t;
    const phase2 = 2 * Math.PI * (baseFreq * 2.76) * t;
    const phase3 = 2 * Math.PI * (baseFreq * 5.4) * t;
    const phase4 = 2 * Math.PI * (baseFreq * 8.93) * t;

    let sample = Math.sin(phase1) * 0.5;
    sample += Math.sin(phase2) * 0.25 * Math.exp(-t * 8);
    sample += Math.sin(phase3) * 0.15 * Math.exp(-t * 12);
    sample += Math.sin(phase4) * 0.1 * Math.exp(-t * 16);

    let envelope = 1;
    if (t < attackTime) {
      envelope = Math.sin((t / attackTime) * Math.PI / 2);
    } else if (t >= attackTime + sustainTime) {
      const releaseProgress = (t - attackTime - sustainTime) / releaseTime;
      envelope = Math.exp(-releaseProgress * 4);
    }

    data[i] = sample * envelope;
  }
}

function generateClickBuffer(
  audioContext: AudioContext,
  isDownbeat: boolean,
  style: MetronomeSoundStyle,
  clickDuration: number,
): AudioBuffer | null {
  if (isExternalAudioStyle(style)) {
    return null;
  }

  const sampleRate = audioContext.sampleRate;
  const length = Math.floor(sampleRate * clickDuration);
  const buffer = audioContext.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  switch (style) {
    case 'traditional':
      generateTraditionalClick(data, sampleRate, isDownbeat);
      break;
    case 'digital':
      generateDigitalClick(data, sampleRate, isDownbeat);
      break;
    case 'wood':
      generateWoodClick(data, sampleRate, isDownbeat);
      break;
    case 'bell':
      generateBellClick(data, sampleRate, isDownbeat);
      break;
    default:
      generateTraditionalClick(data, sampleRate, isDownbeat);
      break;
  }

  return buffer;
}

export async function loadMetronomeBuffers(
  audioContext: AudioContext,
  style: MetronomeSoundStyle,
  clickDuration: number,
): Promise<MetronomeBufferPair | null> {
  try {
    let downbeatBuffer: AudioBuffer | null = null;
    let regularBuffer: AudioBuffer | null = null;

    if (isExternalAudioStyle(style)) {
      const [downbeatResult, regularResult] = await Promise.all([
        loadExternalAudioFile(audioContext, `${EXTERNAL_AUDIO_BASE_URL}/${style}_downbeat.wav`),
        loadExternalAudioFile(audioContext, `${EXTERNAL_AUDIO_BASE_URL}/${style}_regular.wav`),
      ]);

      downbeatBuffer = downbeatResult;
      regularBuffer = regularResult;

      if (!downbeatBuffer || !regularBuffer) {
        console.warn(`External audio files failed for ${style}, falling back to traditional generation`);
        downbeatBuffer = generateClickBuffer(audioContext, true, 'traditional', clickDuration);
        regularBuffer = generateClickBuffer(audioContext, false, 'traditional', clickDuration);
      }
    } else {
      downbeatBuffer = generateClickBuffer(audioContext, true, style, clickDuration);
      regularBuffer = generateClickBuffer(audioContext, false, style, clickDuration);
    }

    if (!downbeatBuffer || !regularBuffer) {
      throw new Error(`Failed to build metronome buffers for style: ${style}`);
    }

    return {
      downbeat: downbeatBuffer,
      regular: regularBuffer,
    };
  } catch (error) {
    console.error(`Error loading metronome buffers for style ${style}:`, error);
    return null;
  }
}
