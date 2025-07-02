/**
 * Simple test to validate Jest setup
 */

describe('Jest Setup Validation', () => {
  it('should run basic tests', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle async operations', async () => {
    const result = await Promise.resolve('test');
    expect(result).toBe('test');
  });

  it('should mock functions', () => {
    const mockFn = jest.fn();
    mockFn('test');
    expect(mockFn).toHaveBeenCalledWith('test');
  });
});

describe('Environment Setup', () => {
  it('should have jsdom environment', () => {
    expect(typeof window).toBe('object');
    expect(typeof document).toBe('object');
  });

  it('should have localStorage mock', () => {
    expect(typeof localStorage).toBe('object');
    expect(typeof localStorage.getItem).toBe('function');
  });
});
