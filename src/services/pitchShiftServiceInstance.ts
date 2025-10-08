/**
 * Pitch Shift Service Instance
 *
 * Global singleton instance of GrainPlayerPitchShiftService for volume control access
 */

import { GrainPlayerPitchShiftService } from './grainPlayerPitchShiftService';

let pitchShiftServiceInstance: GrainPlayerPitchShiftService | null = null;

export function getPitchShiftService(): GrainPlayerPitchShiftService | null {
  return pitchShiftServiceInstance;
}

export function setPitchShiftService(service: GrainPlayerPitchShiftService | null): void {
  pitchShiftServiceInstance = service;
}

