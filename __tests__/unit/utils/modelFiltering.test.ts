describe('modelFiltering', () => {
  const loadModule = async () => import('@/utils/modelFiltering');

  afterEach(() => {
    jest.resetModules();
  });

  it('treats the default jsdom localhost origin as development and keeps BTC models available', async () => {
    const {
      areBTCModelsAvailable,
      filterChordModels,
      getAvailableChordModels,
      getSafeChordModel,
      getChordRecognitionEndpoint,
      getModelDescription,
    } = await loadModule();

    expect(areBTCModelsAvailable()).toBe(true);
    expect(filterChordModels(['chord-cnn-lstm', 'btc-sl', 'btc-pl'])).toEqual([
      'chord-cnn-lstm',
      'btc-sl',
      'btc-pl',
    ]);
    expect(getAvailableChordModels()).toEqual(['chord-cnn-lstm', 'btc-sl', 'btc-pl']);
    expect(getSafeChordModel('btc-sl')).toBe('btc-sl');
    expect(getChordRecognitionEndpoint('btc-pl')).toBe('/api/recognize-chords-btc-pl');
    expect(getModelDescription('btc-sl')).toContain('Development only');
  });

  it('returns the standard endpoint and description for the always-available base model', async () => {
    const {
      getChordRecognitionEndpoint,
      getModelDescription,
    } = await loadModule();

    expect(getChordRecognitionEndpoint('chord-cnn-lstm')).toBe('/api/recognize-chords');
    expect(getModelDescription('chord-cnn-lstm')).toContain('CNN+LSTM model');
  });
});
