import { TextDecoder, TextEncoder } from 'util';
import { API_KEY_STORAGE_KEYS } from '@/types/apiKeyTypes';

describe('apiKeyStorageService', () => {
  const storageState = new Map<string, string>();
  const originalCrypto = global.crypto;
  const originalLocalStorage = global.localStorage;
  const originalTextEncoder = global.TextEncoder;
  const originalTextDecoder = global.TextDecoder;

  const installStorageBackedMocks = () => {
    Object.defineProperty(global, 'localStorage', {
      configurable: true,
      value: {
        getItem: jest.fn((key: string) => (storageState.has(key) ? storageState.get(key) : null)),
        setItem: jest.fn((key: string, value: string) => {
          storageState.set(key, value);
        }),
        removeItem: jest.fn((key: string) => {
          storageState.delete(key);
        }),
        clear: jest.fn(() => {
          storageState.clear();
        }),
      },
    });
  };

  const installCryptoMock = () => {
    const getRandomValues = jest.fn((array: Uint8Array) => {
      array.forEach((_, index) => {
        array[index] = index + 1;
      });
      return array;
    });

    const subtle = {
      importKey: jest.fn(async () => ({ id: 'key-material' })),
      deriveKey: jest.fn(async () => ({ id: 'derived-key' })),
      encrypt: jest.fn(async () => Uint8Array.from([10, 11, 12]).buffer),
      decrypt: jest.fn(async () => new TextEncoder().encode('stored-api-key').buffer),
    };

    Object.defineProperty(global, 'crypto', {
      configurable: true,
      value: { getRandomValues, subtle },
    });

    return { getRandomValues, subtle };
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    storageState.clear();
    installStorageBackedMocks();
    Object.defineProperty(global, 'TextEncoder', {
      configurable: true,
      value: TextEncoder,
    });
    Object.defineProperty(global, 'TextDecoder', {
      configurable: true,
      value: TextDecoder,
    });
  });

  afterAll(() => {
    Object.defineProperty(global, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
    Object.defineProperty(global, 'crypto', {
      configurable: true,
      value: originalCrypto,
    });
    Object.defineProperty(global, 'TextEncoder', {
      configurable: true,
      value: originalTextEncoder,
    });
    Object.defineProperty(global, 'TextDecoder', {
      configurable: true,
      value: originalTextDecoder,
    });
  });

  it('stores and retrieves encrypted API keys with metadata', async () => {
    const { subtle } = installCryptoMock();
    const { apiKeyStorage } = await import('@/services/cache/apiKeyStorageService');

    await apiKeyStorage.storeApiKey('musicAi', 'plain-api-key');

    expect(storageState.get(API_KEY_STORAGE_KEYS.ENCRYPTION_SALT)).toBe('0102030405060708090a0b0c0d0e0f10');
    expect(storageState.get(API_KEY_STORAGE_KEYS.MUSIC_AI)).toBe(
      JSON.stringify({
        encryptedData: '0a0b0c',
        iv: '0102030405060708090a0b0c',
        salt: '0102030405060708090a0b0c0d0e0f10',
      })
    );
    expect(storageState.get(`${API_KEY_STORAGE_KEYS.MUSIC_AI}_meta`)).toContain('"hasKey":true');

    await expect(apiKeyStorage.getApiKey('musicAi')).resolves.toBe('stored-api-key');
    expect(subtle.deriveKey).toHaveBeenCalledTimes(1);
  });

  it('reports key presence from metadata and handles malformed metadata safely', async () => {
    const { apiKeyStorage } = await import('@/services/cache/apiKeyStorageService');

    storageState.set(`${API_KEY_STORAGE_KEYS.GEMINI}_meta`, JSON.stringify({ hasKey: true }));
    expect(apiKeyStorage.hasApiKey('gemini')).toBe(true);

    storageState.set(`${API_KEY_STORAGE_KEYS.GEMINI}_meta`, 'not-json');
    expect(apiKeyStorage.hasApiKey('gemini')).toBe(false);
  });

  it('returns null when there is no stored key or decryption fails', async () => {
    installCryptoMock();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { apiKeyStorage } = await import('@/services/cache/apiKeyStorageService');

    await expect(apiKeyStorage.getApiKey('songformerAccess')).resolves.toBeNull();

    storageState.set(API_KEY_STORAGE_KEYS.SONGFORMER_ACCESS, 'not-json');
    await expect(apiKeyStorage.getApiKey('songformerAccess')).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('removes individual keys and clears all stored credentials including the salt', async () => {
    installCryptoMock();
    const { apiKeyStorage } = await import('@/services/cache/apiKeyStorageService');

    storageState.set(API_KEY_STORAGE_KEYS.MUSIC_AI, 'music');
    storageState.set(`${API_KEY_STORAGE_KEYS.MUSIC_AI}_meta`, '{}');
    storageState.set(API_KEY_STORAGE_KEYS.GEMINI, 'gemini');
    storageState.set(`${API_KEY_STORAGE_KEYS.GEMINI}_meta`, '{}');
    storageState.set(API_KEY_STORAGE_KEYS.SONGFORMER_ACCESS, 'songformer');
    storageState.set(`${API_KEY_STORAGE_KEYS.SONGFORMER_ACCESS}_meta`, '{}');
    storageState.set(API_KEY_STORAGE_KEYS.ENCRYPTION_SALT, 'salt');

    apiKeyStorage.removeApiKey('musicAi');
    expect(storageState.has(API_KEY_STORAGE_KEYS.MUSIC_AI)).toBe(false);

    apiKeyStorage.clearAllApiKeys();
    expect(storageState.size).toBe(0);
  });

  it('builds a config object from all available keys and exposes encryption support', async () => {
    installCryptoMock();
    const { apiKeyStorage } = await import('@/services/cache/apiKeyStorageService');

    storageState.set(`${API_KEY_STORAGE_KEYS.MUSIC_AI}_meta`, JSON.stringify({ hasKey: true }));
    storageState.set(API_KEY_STORAGE_KEYS.MUSIC_AI, JSON.stringify({
      encryptedData: '0a0b0c',
      iv: '0102030405060708090a0b0c',
      salt: '0102030405060708090a0b0c0d0e0f10',
    }));
    storageState.set(`${API_KEY_STORAGE_KEYS.GEMINI}_meta`, JSON.stringify({ hasKey: true }));
    storageState.set(API_KEY_STORAGE_KEYS.GEMINI, JSON.stringify({
      encryptedData: '0a0b0c',
      iv: '0102030405060708090a0b0c',
      salt: '0102030405060708090a0b0c0d0e0f10',
    }));

    await expect(apiKeyStorage.getAllApiKeys()).resolves.toEqual({
      musicAi: 'stored-api-key',
      gemini: 'stored-api-key',
    });
    expect(apiKeyStorage.isEncryptionSupported()).toBe(true);
  });
});
