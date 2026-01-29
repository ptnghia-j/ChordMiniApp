/**
 * MetronomeProcessor - AudioWorklet for precise metronome timing
 * Runs in a separate thread, immune to UI interactions and main thread blocking
 */
class MetronomeProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // State management
    this.isPlaying = false;
    this.nextClickTime = 0;
    this.bpm = 120;
    this.clickDuration = 0.06; // 60ms clicks
    this.volume = 1.0;
    this.volumeBoost = 3.0;
    this.beatInterval = 60 / this.bpm;

    // Timing and synchronization
    this.startTime = 0;
    this.pauseTime = 0;
    this.currentBeatIndex = 0;
    this.beats = [];
    this.useBeatsArray = false;

    // Click sound generation parameters
    this.clickFrequency = 1200;
    this.clickAttack = 0.002; // 2ms attack
    this.clickDecay = 25; // Exponential decay factor

    // Handle messages from main thread
    this.port.onmessage = (event) => {
      const { type, data } = event.data;

      switch (type) {
        case 'start':
          this.handleStart(data);
          break;
        case 'stop':
          this.handleStop();
          break;
        case 'seek':
          this.handleSeek(data);
          break;
        case 'updateBPM':
          this.updateBPM(data.bpm);
          break;
        case 'updateVolume':
          this.updateVolume(data.volume);
          break;
        case 'setBeats':
          this.setBeats(data.beats);
          break;
        case 'updateTime':
          this.updateCurrentTime(data.time);
          break;
      }
    };
  }

  handleStart(data) {
    this.isPlaying = true;
    this.startTime = currentTime;
    this.pauseTime = 0;

    if (data.bpm) this.bpm = data.bpm;
    if (data.volume !== undefined) this.volume = data.volume;
    if (data.beats) this.setBeats(data.beats);
    if (data.currentTime !== undefined) {
      this.seekToTime(data.currentTime);
    } else {
      this.currentBeatIndex = 0;
      this.calculateNextClickTime();
    }

    this.beatInterval = 60 / this.bpm;

    // Send confirmation
    this.port.postMessage({ type: 'started' });
  }

  handleStop() {
    this.isPlaying = false;
    this.pauseTime = currentTime;
    this.port.postMessage({ type: 'stopped' });
  }

  handleSeek(data) {
    if (data.time !== undefined) {
      this.seekToTime(data.time);
    }
  }

  seekToTime(targetTime) {
    if (this.useBeatsArray && this.beats.length > 0) {
      // Find the next beat after the target time
      this.currentBeatIndex = 0;
      for (let i = 0; i < this.beats.length; i++) {
        if (this.beats[i] > targetTime) {
          this.currentBeatIndex = i;
          break;
        }
      }

      if (this.currentBeatIndex < this.beats.length) {
        this.nextClickTime = this.beats[this.currentBeatIndex];
      } else {
        this.nextClickTime = Infinity; // No more beats
      }
    } else {
      // Calculate beat position based on BPM
      const beatsSinceStart = Math.floor(targetTime / this.beatInterval);
      this.currentBeatIndex = beatsSinceStart;
      this.nextClickTime = (beatsSinceStart + 1) * this.beatInterval;
    }
  }

  updateBPM(bpm) {
    if (bpm > 0 && bpm <= 300) {
      this.bpm = bpm;
      this.beatInterval = 60 / this.bpm;

      if (!this.useBeatsArray) {
        this.calculateNextClickTime();
      }
    }
  }

  updateVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  setBeats(beats) {
    if (Array.isArray(beats) && beats.length > 0) {
      // Filter out null values and ensure all are numbers
      this.beats = beats.filter(b => typeof b === 'number' && !isNaN(b));
      this.useBeatsArray = this.beats.length > 0;

      if (this.useBeatsArray) {
        this.currentBeatIndex = 0;
        this.calculateNextClickTime();
      }
    } else {
      this.beats = [];
      this.useBeatsArray = false;
    }
  }

  updateCurrentTime(time) {
    // Synchronize with external time source
    if (this.isPlaying) {
      this.seekToTime(time);
    }
  }

  calculateNextClickTime() {
    if (this.useBeatsArray && this.beats.length > 0) {
      if (this.currentBeatIndex < this.beats.length) {
        this.nextClickTime = this.beats[this.currentBeatIndex];
      } else {
        this.nextClickTime = Infinity; // No more beats
      }
    } else if (this.beatInterval > 0) {
      this.nextClickTime = (this.currentBeatIndex + 1) * this.beatInterval;
    }
  }

  generateClick(output, startSample, numSamples) {
    const effectiveVolume = this.volume * this.volumeBoost;
    const attackSamples = Math.floor(this.clickAttack * sampleRate);
    const clickSamples = Math.floor(this.clickDuration * sampleRate);

    for (let channel = 0; channel < output.length; channel++) {
      const outputChannel = output[channel];

      for (let i = 0; i < numSamples && i < clickSamples; i++) {
        const sampleIndex = startSample + i;
        const t = sampleIndex / sampleRate;

        // Generate click sound (sine wave)
        const phase = 2 * Math.PI * this.clickFrequency * t;
        const sample = Math.sin(phase);

        // Apply envelope
        let envelope;
        if (sampleIndex < attackSamples) {
          // Attack phase
          envelope = sampleIndex / attackSamples;
        } else {
          // Decay phase
          envelope = Math.exp(-t * this.clickDecay);
        }

        outputChannel[i] = sample * envelope * effectiveVolume * 0.5; // 0.5 to prevent clipping
      }
    }

    // Send click event to main thread
    this.port.postMessage({
      type: 'click',
      beatIndex: this.currentBeatIndex,
      time: this.nextClickTime
    });

    // Move to next beat
    this.currentBeatIndex++;
    this.calculateNextClickTime();
  }

  process(inputs, outputs, parameters) {
    if (!this.isPlaying || outputs.length === 0) {
      return true; // Keep processor alive
    }

    const output = outputs[0];
    const numSamples = output[0].length;

    // Clear output buffer first
    for (let channel = 0; channel < output.length; channel++) {
      output[channel].fill(0);
    }

    // Check if we need to generate a click in this render quantum
    const quantumDuration = numSamples / sampleRate;
    const quantumStartTime = currentTime;
    const quantumEndTime = quantumStartTime + quantumDuration;

    // Check if next click falls within this quantum
    if (this.nextClickTime >= quantumStartTime && this.nextClickTime < quantumEndTime) {
      // Calculate sample position for the click
      const clickOffsetTime = this.nextClickTime - quantumStartTime;
      const clickStartSample = Math.floor(clickOffsetTime * sampleRate);

      // Generate the click
      this.generateClick(output, clickStartSample, numSamples - clickStartSample);
    }

    return true; // Keep processor alive
  }
}

// Register the processor
registerProcessor('metronome-processor', MetronomeProcessor);