/**
 * Pitch Shift Service Instance
 * 
 * Global singleton instance of PitchShiftService for volume control access
 */

import { PitchShiftService } from './pitchShiftService';

let pitchShiftServiceInstance: PitchShiftService | null = null;

export function getPitchShiftService(): PitchShiftService | null {
  return pitchShiftServiceInstance;
}

export function setPitchShiftService(service: PitchShiftService | null): void {
  pitchShiftServiceInstance = service;
}

