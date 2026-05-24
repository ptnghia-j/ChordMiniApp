import {
  createUserFriendlyError,
  getTroubleshootingSteps,
  isVideoExtractionError,
} from '@/utils/errorMessageUtils';

describe('errorMessageUtils', () => {
  describe('createUserFriendlyError', () => {
    it.each([
      [
        'Extraction service is currently unavailable',
        'Video Processing Unavailable',
        true,
        true,
      ],
      [
        'YouTube video is not available',
        'Video Not Available',
        true,
        true,
      ],
      [
        'This YouTube Short is unsupported',
        'YouTube Shorts Not Supported',
        true,
        true,
      ],
      [
        'Processing timeout while extracting audio',
        'Processing Timeout',
        true,
        true,
      ],
      [
        'Blob upload failed during processing',
        'File Too Large',
        false,
        false,
      ],
      [
        'Network error while fetching resource',
        'Connection Error',
        true,
        true,
      ],
      [
        'Serverless function failed on deployment',
        'Service Temporarily Unavailable',
        true,
        true,
      ],
      [
        'Backend service temporarily unavailable',
        'Service Temporarily Unavailable',
        false,
        false,
      ],
      [
        'Chord recognition pipeline failed',
        'Audio Analysis Failed',
        false,
        false,
      ],
      [
        'Unsupported codec format',
        'Unsupported Format',
        true,
        true,
      ],
    ])(
      'maps "%s" to the expected user-facing category',
      (error, title, showTryAnotherButton, extractionError) => {
        expect(createUserFriendlyError(error)).toMatchObject({
          title,
          showTryAnotherButton,
          isVideoExtractionError: extractionError,
        });
      }
    );

    it('falls back to a generic extraction failure for unknown errors', () => {
      expect(createUserFriendlyError('Unexpected failure')).toMatchObject({
        title: 'Processing Failed',
        isVideoExtractionError: true,
        showTryAnotherButton: true,
      });
    });
  });

  describe('isVideoExtractionError', () => {
    it('detects common extraction keywords', () => {
      expect(isVideoExtractionError('Audio download failed')).toBe(true);
      expect(isVideoExtractionError('YouTube audio extraction error')).toBe(true);
    });

    it('does not flag unrelated backend errors', () => {
      expect(isVideoExtractionError('Firestore write failed')).toBe(false);
    });
  });

  describe('getTroubleshootingSteps', () => {
    it('returns category-specific guidance for shorts, timeouts, restrictions, and network issues', () => {
      expect(getTroubleshootingSteps('youtube short')).toEqual(
        expect.arrayContaining(['Please try a regular YouTube video instead'])
      );
      expect(getTroubleshootingSteps('timeout')).toEqual(
        expect.arrayContaining(['Try searching for a shorter version of the song (under 5 minutes)'])
      );
      expect(getTroubleshootingSteps('video restricted')).toEqual(
        expect.arrayContaining(['The video may be geo-restricted or private'])
      );
      expect(getTroubleshootingSteps('network connection lost')).toEqual(
        expect.arrayContaining(['Check your internet connection'])
      );
    });

    it('falls back to generic steps for unknown errors', () => {
      expect(getTroubleshootingSteps('mystery issue')).toEqual(
        expect.arrayContaining(['Consider using the "Upload Audio File" option instead'])
      );
    });
  });
});
