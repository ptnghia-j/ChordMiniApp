export const DRUM_TRACK_MASTER_GAIN = 1.0;
export const DRUM_TRACK_PLAYBACK_BOOST = 1.8;

function createNoiseBuffer(context: BaseAudioContext, durationSeconds: number): AudioBuffer {
  const frameCount = Math.max(1, Math.floor(context.sampleRate * durationSeconds));
  const noiseBuffer = context.createBuffer(1, frameCount, context.sampleRate);
  const data = noiseBuffer.getChannelData(0);

  for (let i = 0; i < frameCount; i += 1) {
    data[i] = (Math.random() * 2 - 1) * 0.6;
  }

  return noiseBuffer;
}

export function renderKick(
  context: BaseAudioContext,
  time: number,
  volume: number,
  masterVolume: number,
): void {
  const osc = context.createOscillator();
  const gain = context.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, time);
  osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);

  const targetGain = volume * masterVolume * 0.36 * DRUM_TRACK_MASTER_GAIN;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(targetGain, time + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

  osc.connect(gain);
  gain.connect(context.destination);
  osc.start(time);
  osc.stop(time + 0.18);
}

export function renderSnare(
  context: BaseAudioContext,
  time: number,
  volume: number,
  masterVolume: number,
): void {
  const noise = context.createBufferSource();
  const noiseHighpass = context.createBiquadFilter();
  const noiseLowpass = context.createBiquadFilter();
  const noiseGain = context.createGain();
  const bodyOsc = context.createOscillator();
  const bodyGain = context.createGain();

  noise.buffer = createNoiseBuffer(context, 0.14);
  noiseHighpass.type = 'highpass';
  noiseHighpass.frequency.setValueAtTime(1900, time);
  noiseLowpass.type = 'lowpass';
  noiseLowpass.frequency.setValueAtTime(6200, time);

  const targetNoiseGain = volume * masterVolume * 0.42 * DRUM_TRACK_MASTER_GAIN;
  noiseGain.gain.setValueAtTime(0.0001, time);
  noiseGain.gain.linearRampToValueAtTime(targetNoiseGain, time + 0.0025);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.11);

  bodyOsc.type = 'triangle';
  bodyOsc.frequency.setValueAtTime(210, time);
  bodyOsc.frequency.exponentialRampToValueAtTime(135, time + 0.09);

  const targetBodyGain = volume * masterVolume * 0.2 * DRUM_TRACK_MASTER_GAIN;
  bodyGain.gain.setValueAtTime(0.0001, time);
  bodyGain.gain.linearRampToValueAtTime(targetBodyGain, time + 0.002);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.085);

  noise.connect(noiseHighpass);
  noiseHighpass.connect(noiseLowpass);
  noiseLowpass.connect(noiseGain);
  noiseGain.connect(context.destination);

  bodyOsc.connect(bodyGain);
  bodyGain.connect(context.destination);

  noise.start(time);
  noise.stop(time + 0.12);
  bodyOsc.start(time);
  bodyOsc.stop(time + 0.1);
}

export function renderHiHat(
  context: BaseAudioContext,
  time: number,
  volume: number,
  masterVolume: number,
): void {
  const noise = context.createBufferSource();
  const highpass = context.createBiquadFilter();
  const bandpass = context.createBiquadFilter();
  const gain = context.createGain();

  noise.buffer = createNoiseBuffer(context, 0.06);
  highpass.type = 'highpass';
  highpass.frequency.setValueAtTime(6800, time);
  bandpass.type = 'bandpass';
  bandpass.frequency.setValueAtTime(9000, time);
  bandpass.Q.setValueAtTime(0.6, time);

  const targetGain = volume * masterVolume * 0.32 * DRUM_TRACK_MASTER_GAIN;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(targetGain, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.035);

  noise.connect(highpass);
  highpass.connect(bandpass);
  bandpass.connect(gain);
  gain.connect(context.destination);
  noise.start(time);
  noise.stop(time + 0.045);
}

export function renderDrumBeat(
  offlineContext: OfflineAudioContext,
  beatTime: number,
  beatInterval: number,
  isDownbeat: boolean,
  beatIndex: number,
  timeSignature: number,
  masterVolume: number,
): void {
  const beatInBar = beatIndex % timeSignature;
  renderKick(offlineContext, beatTime, isDownbeat ? 0.28 : 0.2, masterVolume);

  const shouldAddSnare = timeSignature >= 4
    ? beatInBar === 1 || beatInBar === 3
    : beatInBar === Math.floor(timeSignature / 2);
  if (shouldAddSnare) {
    renderSnare(offlineContext, beatTime, 0.38, masterVolume);
  }

  renderHiHat(offlineContext, beatTime, 0.18, masterVolume);
  const offbeatTime = beatTime + beatInterval * 0.5;
  if (offbeatTime < offlineContext.length / offlineContext.sampleRate) {
    renderHiHat(offlineContext, offbeatTime, 0.14, masterVolume);
  }
}
