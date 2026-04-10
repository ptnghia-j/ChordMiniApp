import React from 'react';

/**
 * Provides consistent font size and styling for chord labels
 * Uses a standardized approach rather than responsive sizing to ensure consistency
 *
 * @param chordName The chord name to display
 * @returns CSS class for the chord label
 */
export function getResponsiveChordFontSize(): string {
  // Use uniform font weight for cleaner appearance, matching commercial products
  // All chord parts use regular weight for consistent styling
  return "font-normal text-gray-800 dark:text-gray-200 text-base whitespace-normal transition-colors duration-300";
}

/**
 * Generates professional inline styles for chord labels
 * Based on industry-standard music notation software like Chordify
 *
 * @param chordName The chord name to display
 * @returns Object with CSS styles for professional chord display
 */
export function getChordLabelStyles(): React.CSSProperties {
  return {
    padding: '0.125rem 0.125rem 0.125rem 0.0625rem', // Minimal left padding (1px), small right padding
    lineHeight: '1.2', // Slightly tighter line height
    width: '100%',
    display: 'flex',
    justifyContent: 'flex-start', // Left-align like commercial products
    alignItems: 'center',
    minHeight: '1.5rem', // Reduced min height
    minWidth: '2rem', // Reduced min width
    fontFamily: 'var(--font-varela-round), "Varela Round", "Helvetica Neue", "Arial", sans-serif',
    fontWeight: '600',
    letterSpacing: '0.005em', // Minimal letter spacing for cleaner look
    fontSize: '0.95rem', // Previous chord-label sizing baseline
    overflow: 'visible', // Prevent truncation
    textOverflow: 'clip', // Don't use ellipsis
    hyphens: 'none', // Prevent hyphenation
    wordBreak: 'keep-all', // Prevent breaking within chord names
    // Remove text shadow for cleaner appearance like commercial apps
  };
}

/**
 * FIXED: Generates container styles for chord labels with stable layout for superscripts
 * Prevents layout shifts and auto-scroll jitter by providing consistent dimensions
 *
 * @returns Object with CSS styles for the chord container
 */
export function getChordContainerStyles(): React.CSSProperties {
  return {
    display: 'flex',
    justifyContent: 'flex-start', // Left-align container to match label alignment
    alignItems: 'center',
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'visible', // Allow superscripts to extend beyond container
    padding: '0.0625rem', // Minimal padding for very tight layout
    // CRITICAL: Reserve space for superscripts to prevent layout shifts
    minHeight: '1.5em', // Ensure enough vertical space for superscripts
    lineHeight: '1.2', // Consistent line height for stable measurements
  };
}

/**
 * Formats Roman numerals with proper figure bass notation
 */
export const formatRomanNumeral = (romanNumeral: string): React.ReactElement | string => {
  if (!romanNumeral) return '';

  // Handle figure bass notation (e.g., "I64", "ii6", "V7")
  const figureMatch = romanNumeral.match(/^([ivxIVX]+)(.*)$/);
  if (figureMatch) {
    const [, baseRoman, figures] = figureMatch;

    if (figures) {
      // Handle different figure bass patterns
      if (figures === '64') {
        // Create I64 with stacked superscript figures
        return React.createElement('span', {
          style: {
            position: 'relative',
            display: 'inline-block',
          },
          key: 'roman-64'
        }, [
          React.createElement('span', { key: 'base' }, baseRoman),
          React.createElement('span', {
            key: 'figures',
            style: {
              position: 'absolute',
              left: '100%',
              top: '-0.5em',
              fontSize: '0.7em', // Consistent with chord superscripts
              lineHeight: '1', // Stable line height
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginLeft: '1px', // Reduced margin for closer positioning
              fontWeight: 'normal',
              zIndex: 10
            }
          }, [
            React.createElement('span', {
              key: '6',
              style: {
                display: 'block',
                textAlign: 'center'
              }
            }, '6'),
            React.createElement('span', {
              key: '4',
              style: {
                display: 'block',
                marginTop: '-0.15em',
                textAlign: 'center'
              }
            }, '4')
          ])
        ]);
      } else if (figures === '43') {
        return React.createElement('span', { style: { position: 'relative', display: 'inline-block' } }, [
          baseRoman,
          React.createElement('span', {
            key: 'figures',
            style: {
              position: 'absolute',
              left: '100%',
              top: '-0.3em',
              fontSize: '0.6em',
              lineHeight: '0.8',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginLeft: '1px'
            }
          }, [
            React.createElement('span', { key: '4' }, '4'),
            React.createElement('span', { key: '3' }, '3')
          ])
        ]);
      } else if (figures === '6') {
        return React.createElement('span', {}, [
          baseRoman,
          React.createElement('sup', { key: 'sup', style: { fontSize: '0.7em' } }, '6')
        ]);
      } else if (figures === '7') {
        return React.createElement('span', {}, [
          baseRoman,
          React.createElement('sup', {
            key: 'sup',
            style: {
              fontSize: '0.7em',
              lineHeight: '1',
              verticalAlign: 'super'
            }
          }, '7')
        ]);
      } else if (figures.includes('/')) {
        // Handle secondary dominants like "V7/vi"
        return React.createElement('span', {}, romanNumeral);
      } else {
        // FIXED: Handle other figure combinations with consistent styling
        return React.createElement('span', {}, [
          baseRoman,
          React.createElement('sup', {
            key: 'sup',
            style: {
              fontSize: '0.7em',
              lineHeight: '1',
              verticalAlign: 'super'
            }
          }, figures)
        ]);
      }
    }

    return baseRoman;
  }

  return romanNumeral;
};
