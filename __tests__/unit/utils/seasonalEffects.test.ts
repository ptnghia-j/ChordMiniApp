import { shouldShowSnowEffect } from '@/utils/seasonalEffects';

describe('shouldShowSnowEffect', () => {
  const originalDate = global.Date;

  afterEach(() => {
    global.Date = originalDate;
  });

  const mockDate = (dateStr: string) => {
    const mock = class extends originalDate {
      constructor(...args: any[]) {
        super(...args);
        if (args.length === 0) {
          return new originalDate(dateStr);
        }
      }
    };
    global.Date = mock as any;
  };

  describe('title based checks', () => {
    it('returns true for winter title keywords', () => {
      mockDate('2026-06-15T12:00:00'); // June (summer, should be false by date)
      expect(shouldShowSnowEffect('Snowing Day')).toBe(true);
      expect(shouldShowSnowEffect('WINTER SONG')).toBe(true);
      expect(shouldShowSnowEffect('Beautiful Snowflake')).toBe(true);
      expect(shouldShowSnowEffect('Dancing snowflakes')).toBe(true);
    });

    it('returns false for non-winter title keywords', () => {
      mockDate('2026-06-15T12:00:00'); // June
      expect(shouldShowSnowEffect('Summer breeze')).toBe(false);
      expect(shouldShowSnowEffect('Autumn leaves')).toBe(false);
      expect(shouldShowSnowEffect(undefined)).toBe(false);
    });
  });

  describe('date based checks', () => {
    it('returns true for dates between Dec 21 and Dec 31', () => {
      mockDate('2026-12-21T12:00:00');
      expect(shouldShowSnowEffect()).toBe(true);

      mockDate('2026-12-25T12:00:00');
      expect(shouldShowSnowEffect()).toBe(true);

      mockDate('2026-12-31T12:00:00');
      expect(shouldShowSnowEffect()).toBe(true);
    });

    it('returns true for dates between Jan 1 and Feb 29', () => {
      mockDate('2026-01-01T12:00:00');
      expect(shouldShowSnowEffect()).toBe(true);

      mockDate('2026-02-14T12:00:00');
      expect(shouldShowSnowEffect()).toBe(true);

      mockDate('2024-02-29T12:00:00'); // Leap year
      expect(shouldShowSnowEffect()).toBe(true);
    });

    it('returns true for dates between Mar 1 and Mar 20', () => {
      mockDate('2026-03-01T12:00:00');
      expect(shouldShowSnowEffect()).toBe(true);

      mockDate('2026-03-15T12:00:00');
      expect(shouldShowSnowEffect()).toBe(true);

      mockDate('2026-03-20T12:00:00');
      expect(shouldShowSnowEffect()).toBe(true);
    });

    it('returns false for dates outside Dec 21 - Mar 20', () => {
      mockDate('2026-03-21T12:00:00');
      expect(shouldShowSnowEffect()).toBe(false);

      mockDate('2026-06-21T12:00:00');
      expect(shouldShowSnowEffect()).toBe(false);

      mockDate('2026-12-20T12:00:00');
      expect(shouldShowSnowEffect()).toBe(false);
    });
  });
});
