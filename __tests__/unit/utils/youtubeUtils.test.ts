import { convertToPrivacyEnhancedUrl, isYouTubeUrl } from '@/utils/youtubeUtils';

describe('youtubeUtils', () => {
  it('converts supported YouTube hosts to privacy-enhanced hosts', () => {
    expect(convertToPrivacyEnhancedUrl('https://www.youtube.com/embed/abc123')).toBe(
      'https://www.youtube-nocookie.com/embed/abc123'
    );
    expect(convertToPrivacyEnhancedUrl('https://youtube.com/embed/abc123')).toBe(
      'https://youtube-nocookie.com/embed/abc123'
    );
  });

  it('leaves non-YouTube hosts unchanged', () => {
    expect(convertToPrivacyEnhancedUrl('https://youtube.com.evil.test/embed/abc123')).toBe(
      'https://youtube.com.evil.test/embed/abc123'
    );
    expect(isYouTubeUrl('https://youtube.com.evil.test/embed/abc123')).toBe(false);
  });
});
