/**
 * Secure API Key Storage Service
 * Handles encryption, storage, and retrieval of user-provided API keys
 */

import { 
  ApiKeyConfig, 
  EncryptedApiKeyData, 
  API_KEY_STORAGE_KEYS 
} from '@/types/apiKeyTypes';

class ApiKeyStorageService {
  private static instance: ApiKeyStorageService;
  private encryptionKey: CryptoKey | null = null;

  private constructor() {}

  public static getInstance(): ApiKeyStorageService {
    if (!ApiKeyStorageService.instance) {
      ApiKeyStorageService.instance = new ApiKeyStorageService();
    }
    return ApiKeyStorageService.instance;
  }

  /**
   * Check if we're running in a browser environment
   */
  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  /**
   * Safe localStorage access that works in both client and server environments
   */
  private getLocalStorage(): Storage | null {
    if (!this.isBrowser()) {
      return null;
    }
    return localStorage;
  }

  /**
   * Generate or retrieve encryption key for API key storage
   */
  private async getEncryptionKey(): Promise<CryptoKey> {
    if (this.encryptionKey) {
      return this.encryptionKey;
    }

    const storage = this.getLocalStorage();
    if (!storage) {
      throw new Error('localStorage not available - API key storage requires browser environment');
    }

    // Check if we have a stored salt
    let salt = storage.getItem(API_KEY_STORAGE_KEYS.ENCRYPTION_SALT);

    if (!salt) {
      // Generate new salt
      const saltArray = crypto.getRandomValues(new Uint8Array(16));
      salt = Array.from(saltArray, byte => byte.toString(16).padStart(2, '0')).join('');
      storage.setItem(API_KEY_STORAGE_KEYS.ENCRYPTION_SALT, salt);
    }

    // Convert salt back to Uint8Array
    const saltArray = new Uint8Array(
      salt.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || []
    );

    // Derive key from a combination of salt and browser-specific data
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(salt + navigator.userAgent.slice(0, 50)),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    this.encryptionKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltArray,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    return this.encryptionKey;
  }

  /**
   * Encrypt API key for secure storage
   */
  private async encryptApiKey(apiKey: string): Promise<EncryptedApiKeyData> {
    const key = await this.getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const salt = crypto.getRandomValues(new Uint8Array(16));

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(apiKey)
    );

    return {
      encryptedData: Array.from(new Uint8Array(encrypted), byte => 
        byte.toString(16).padStart(2, '0')
      ).join(''),
      iv: Array.from(iv, byte => byte.toString(16).padStart(2, '0')).join(''),
      salt: Array.from(salt, byte => byte.toString(16).padStart(2, '0')).join('')
    };
  }

  /**
   * Decrypt API key from storage
   */
  private async decryptApiKey(encryptedData: EncryptedApiKeyData): Promise<string> {
    const key = await this.getEncryptionKey();
    
    const iv = new Uint8Array(
      encryptedData.iv.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || []
    );
    
    const encrypted = new Uint8Array(
      encryptedData.encryptedData.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || []
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Store API key securely
   */
  public async storeApiKey(service: 'musicAi' | 'gemini', apiKey: string): Promise<void> {
    const storage = this.getLocalStorage();
    if (!storage) {
      throw new Error('localStorage not available - API key storage requires browser environment');
    }

    try {
      const encryptedData = await this.encryptApiKey(apiKey);
      const storageKey = service === 'musicAi'
        ? API_KEY_STORAGE_KEYS.MUSIC_AI
        : API_KEY_STORAGE_KEYS.GEMINI;

      storage.setItem(storageKey, JSON.stringify(encryptedData));

      // Store metadata for quick access
      storage.setItem(`${storageKey}_meta`, JSON.stringify({
        hasKey: true,
        storedAt: new Date().toISOString()
      }));

      console.log(`API key for ${service} stored securely`);
    } catch (error) {
      console.error(`Failed to store API key for ${service}:`, error);
      throw new Error(`Failed to store API key securely`);
    }
  }

  /**
   * Retrieve API key securely
   */
  public async getApiKey(service: 'musicAi' | 'gemini'): Promise<string | null> {
    const storage = this.getLocalStorage();
    if (!storage) {
      // In server environment, return null (will fallback to environment variables)
      return null;
    }

    try {
      const storageKey = service === 'musicAi'
        ? API_KEY_STORAGE_KEYS.MUSIC_AI
        : API_KEY_STORAGE_KEYS.GEMINI;

      const encryptedDataStr = storage.getItem(storageKey);
      if (!encryptedDataStr) {
        return null;
      }

      const encryptedData: EncryptedApiKeyData = JSON.parse(encryptedDataStr);
      return await this.decryptApiKey(encryptedData);
    } catch (error) {
      console.error(`Failed to retrieve API key for ${service}:`, error);
      return null;
    }
  }

  /**
   * Check if API key exists for service
   */
  public hasApiKey(service: 'musicAi' | 'gemini'): boolean {
    const storage = this.getLocalStorage();
    if (!storage) {
      // In server environment, return false (will fallback to environment variables)
      return false;
    }

    const storageKey = service === 'musicAi'
      ? API_KEY_STORAGE_KEYS.MUSIC_AI
      : API_KEY_STORAGE_KEYS.GEMINI;

    const metaData = storage.getItem(`${storageKey}_meta`);
    if (!metaData) return false;

    try {
      const meta = JSON.parse(metaData);
      return meta.hasKey === true;
    } catch {
      return false;
    }
  }

  /**
   * Remove API key
   */
  public removeApiKey(service: 'musicAi' | 'gemini'): void {
    const storage = this.getLocalStorage();
    if (!storage) {
      console.warn('localStorage not available - cannot remove API key');
      return;
    }

    const storageKey = service === 'musicAi'
      ? API_KEY_STORAGE_KEYS.MUSIC_AI
      : API_KEY_STORAGE_KEYS.GEMINI;

    storage.removeItem(storageKey);
    storage.removeItem(`${storageKey}_meta`);

    console.log(`API key for ${service} removed`);
  }

  /**
   * Get all stored API keys
   */
  public async getAllApiKeys(): Promise<ApiKeyConfig> {
    const config: ApiKeyConfig = {};
    
    if (this.hasApiKey('musicAi')) {
      config.musicAi = await this.getApiKey('musicAi') || undefined;
    }
    
    if (this.hasApiKey('gemini')) {
      config.gemini = await this.getApiKey('gemini') || undefined;
    }
    
    return config;
  }

  /**
   * Clear all stored API keys
   */
  public clearAllApiKeys(): void {
    const storage = this.getLocalStorage();
    if (!storage) {
      console.warn('localStorage not available - cannot clear API keys');
      return;
    }

    this.removeApiKey('musicAi');
    this.removeApiKey('gemini');
    storage.removeItem(API_KEY_STORAGE_KEYS.ENCRYPTION_SALT);
    this.encryptionKey = null;

    console.log('All API keys cleared');
  }

  /**
   * Check if Web Crypto API is available
   */
  public isEncryptionSupported(): boolean {
    return this.isBrowser() &&
           typeof crypto !== 'undefined' &&
           typeof crypto.subtle !== 'undefined' &&
           typeof crypto.getRandomValues !== 'undefined';
  }
}

export const apiKeyStorage = ApiKeyStorageService.getInstance();
