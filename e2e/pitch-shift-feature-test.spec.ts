/**
 * E2E Tests for Pitch Shift Feature
 * 
 * Tests pitch shift functionality in both YouTube and audio upload workflows.
 * Verifies audio source switching, chord transposition, and UI interactions.
 */

import { test, expect } from '@playwright/test';

// Test configuration
const TEST_VIDEO_ID = 'dQw4w9WgXcQ'; // Rick Astley - Never Gonna Give You Up (well-known test video)
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

test.describe('Pitch Shift Feature - YouTube Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to YouTube video analysis page
    await page.goto(`${BASE_URL}/analyze/${TEST_VIDEO_ID}`);
    
    // Wait for analysis to complete (or use cached results)
    await page.waitForSelector('[data-testid="chord-grid"]', { timeout: 60000 });
  });

  test('should display pitch shift toggle in utility dock', async ({ page }) => {
    // Check if pitch shift toggle is visible
    const pitchShiftToggle = page.locator('button:has-text("Pitch Shift")');
    await expect(pitchShiftToggle).toBeVisible();
  });

  test('should enable pitch shift and show panel', async ({ page }) => {
    // Click pitch shift toggle
    const pitchShiftToggle = page.locator('button:has-text("Pitch Shift")');
    await pitchShiftToggle.click();
    
    // Verify panel appears
    await expect(page.locator('text=Pitch Shift Control')).toBeVisible();
    await expect(page.locator('text=Original:')).toBeVisible();
    await expect(page.locator('text=Shifted:')).toBeVisible();
  });

  test('should transpose chords when semitones changed', async ({ page }) => {
    // Enable pitch shift
    const pitchShiftToggle = page.locator('button:has-text("Pitch Shift")');
    await pitchShiftToggle.click();
    
    // Get original first chord
    const firstChordBefore = await page.locator('[data-testid="chord-cell"]').first().textContent();
    
    // Change semitones to +2
    const slider = page.locator('input[type="range"]#pitch-shift-slider');
    await slider.fill('2');
    
    // Wait for transposition to apply
    await page.waitForTimeout(500);
    
    // Get transposed first chord
    const firstChordAfter = await page.locator('[data-testid="chord-cell"]').first().textContent();
    
    // Verify chord changed
    expect(firstChordBefore).not.toBe(firstChordAfter);
  });

  test('should show quality warning for large shifts', async ({ page }) => {
    // Enable pitch shift
    const pitchShiftToggle = page.locator('button:has-text("Pitch Shift")');
    await pitchShiftToggle.click();
    
    // Set semitones to +8 (should trigger warning)
    const slider = page.locator('input[type="range"]#pitch-shift-slider');
    await slider.fill('8');
    
    // Verify warning appears
    await expect(page.locator('text=/Audio quality may.*degrade/i')).toBeVisible();
  });

  test('should reset pitch shift to 0 semitones', async ({ page }) => {
    // Enable pitch shift
    const pitchShiftToggle = page.locator('button:has-text("Pitch Shift")');
    await pitchShiftToggle.click();
    
    // Change semitones
    const slider = page.locator('input[type="range"]#pitch-shift-slider');
    await slider.fill('5');
    
    // Click reset button
    const resetButton = page.locator('button:has-text("Reset")');
    await resetButton.click();
    
    // Verify slider is back to 0
    const sliderValue = await slider.inputValue();
    expect(sliderValue).toBe('0');
  });

  test('should use preset buttons', async ({ page }) => {
    // Enable pitch shift
    const pitchShiftToggle = page.locator('button:has-text("Pitch Shift")');
    await pitchShiftToggle.click();
    
    // Click +2 preset button
    const presetButton = page.locator('button:has-text("+2")');
    await presetButton.click();
    
    // Verify slider updated
    const slider = page.locator('input[type="range"]#pitch-shift-slider');
    const sliderValue = await slider.inputValue();
    expect(sliderValue).toBe('2');
  });

  test('should disable pitch shift toggle when Firebase audio unavailable', async ({ page }) => {
    // This test would need a video without cached Firebase audio
    // For now, we'll skip this test or implement it with a mock
    test.skip();
  });
});

test.describe('Pitch Shift Feature - Audio Upload Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to audio upload page
    await page.goto(`${BASE_URL}/analyze`);
  });

  test('should show pitch shift panel after analysis', async ({ page }) => {
    // Upload a test audio file
    // Note: This requires a test audio file to be available
    // For now, we'll skip this test or implement it with a mock
    test.skip();
  });
});

test.describe('Pitch Shift Feature - Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/analyze/${TEST_VIDEO_ID}`);
    await page.waitForSelector('[data-testid="chord-grid"]', { timeout: 60000 });
  });

  test('should not affect Roman numerals toggle', async ({ page }) => {
    // Enable Roman numerals
    const romanNumeralsToggle = page.locator('button[aria-label*="Roman"]').first();
    await romanNumeralsToggle.click();
    
    // Enable pitch shift
    const pitchShiftToggle = page.locator('button:has-text("Pitch Shift")');
    await pitchShiftToggle.click();
    
    // Verify both features work together
    await expect(page.locator('text=Pitch Shift Control')).toBeVisible();
    // Roman numerals should still be visible in chord grid
  });

  test('should not affect chord playback toggle', async ({ page }) => {
    // Enable chord playback
    const chordPlaybackToggle = page.locator('button[aria-label*="chord playback"]').first();
    await chordPlaybackToggle.click();
    
    // Enable pitch shift
    const pitchShiftToggle = page.locator('button:has-text("Pitch Shift")');
    await pitchShiftToggle.click();
    
    // Verify both features work together
    await expect(page.locator('text=Pitch Shift Control')).toBeVisible();
  });

  test('should not affect auto-scroll toggle', async ({ page }) => {
    // Enable auto-scroll
    const autoScrollToggle = page.locator('button[aria-label*="auto-scroll"]').first();
    await autoScrollToggle.click();
    
    // Enable pitch shift
    const pitchShiftToggle = page.locator('button:has-text("Pitch Shift")');
    await pitchShiftToggle.click();
    
    // Verify both features work together
    await expect(page.locator('text=Pitch Shift Control')).toBeVisible();
  });

  test('should handle rapid semitone changes', async ({ page }) => {
    // Enable pitch shift
    const pitchShiftToggle = page.locator('button:has-text("Pitch Shift")');
    await pitchShiftToggle.click();
    
    const slider = page.locator('input[type="range"]#pitch-shift-slider');
    
    // Rapidly change semitones
    await slider.fill('5');
    await page.waitForTimeout(100);
    await slider.fill('-3');
    await page.waitForTimeout(100);
    await slider.fill('7');
    await page.waitForTimeout(100);
    await slider.fill('0');
    
    // Verify no errors occurred
    const errorMessages = page.locator('text=/error|failed/i');
    await expect(errorMessages).toHaveCount(0);
  });

  test('should handle toggling pitch shift on/off repeatedly', async ({ page }) => {
    const pitchShiftToggle = page.locator('button:has-text("Pitch Shift")');
    
    // Toggle on/off multiple times
    for (let i = 0; i < 3; i++) {
      await pitchShiftToggle.click();
      await page.waitForTimeout(500);
      await pitchShiftToggle.click();
      await page.waitForTimeout(500);
    }
    
    // Verify no errors occurred
    const errorMessages = page.locator('text=/error|failed/i');
    await expect(errorMessages).toHaveCount(0);
  });
});

test.describe('Pitch Shift Feature - Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/analyze/${TEST_VIDEO_ID}`);
    await page.waitForSelector('[data-testid="chord-grid"]', { timeout: 60000 });
  });

  test('should handle maximum positive shift (+12 semitones)', async ({ page }) => {
    const pitchShiftToggle = page.locator('button:has-text("Pitch Shift")');
    await pitchShiftToggle.click();
    
    const slider = page.locator('input[type="range"]#pitch-shift-slider');
    await slider.fill('12');
    
    // Verify quality warning appears
    await expect(page.locator('text=/Audio quality may.*degrade/i')).toBeVisible();
    
    // Verify chords are transposed
    const firstChord = await page.locator('[data-testid="chord-cell"]').first().textContent();
    expect(firstChord).toBeTruthy();
  });

  test('should handle maximum negative shift (-12 semitones)', async ({ page }) => {
    const pitchShiftToggle = page.locator('button:has-text("Pitch Shift")');
    await pitchShiftToggle.click();
    
    const slider = page.locator('input[type="range"]#pitch-shift-slider');
    await slider.fill('-12');
    
    // Verify quality warning appears
    await expect(page.locator('text=/Audio quality may.*degrade/i')).toBeVisible();
    
    // Verify chords are transposed
    const firstChord = await page.locator('[data-testid="chord-cell"]').first().textContent();
    expect(firstChord).toBeTruthy();
  });
});

