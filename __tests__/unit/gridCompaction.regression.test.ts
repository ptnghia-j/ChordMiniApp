import { hasNaturalLeadingSilenceWithOffset } from '@/services/chord-analysis/gridCompaction';

describe('gridCompaction leading-silence guard regressions', () => {
  it('does not treat offset-only silence as natural silence (pSqFIK6vm0I pattern)', () => {
    // runEnd equals existing global offset => silence is artificial (shift/padding only)
    expect(hasNaturalLeadingSilenceWithOffset(3, 3)).toBe(false);
  });

  it('treats extra leading silence beyond offset as natural silence (5ly8tAU-n_w pattern)', () => {
    // runEnd exceeds existing offset => there is real leading silence in source sequence
    expect(hasNaturalLeadingSilenceWithOffset(6, 3)).toBe(true);
  });

  it('keeps short natural intro silence eligible for local realignment', () => {
    // natural run is 2 beats (5 - 3), below 4/4 threshold (3 beats)
    expect(hasNaturalLeadingSilenceWithOffset(5, 3, 4)).toBe(false);
  });

  it('returns false when no global offset exists', () => {
    expect(hasNaturalLeadingSilenceWithOffset(4, 0)).toBe(false);
    expect(hasNaturalLeadingSilenceWithOffset(0, 0)).toBe(false);
  });
});
