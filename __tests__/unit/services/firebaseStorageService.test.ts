const mockStorageRef = jest.fn();
const mockGetDownloadURL = jest.fn();
const mockDeleteObject = jest.fn();
const mockGetStorageInstance = jest.fn();
const mockListAll = jest.fn();
const mockGetMetadata = jest.fn();

jest.mock('@/config/firebase', () => ({
  db: { kind: 'db' },
  getStorageInstance: (...args: unknown[]) => mockGetStorageInstance(...args),
}));

jest.mock('firebase/firestore', () => ({
  Timestamp: { now: jest.fn(() => ({ toMillis: () => Date.now() })) },
  serverTimestamp: jest.fn(() => 'server-timestamp'),
}));

jest.mock('firebase/storage', () => ({
  ref: (...args: unknown[]) => mockStorageRef(...args),
  getDownloadURL: (...args: unknown[]) => mockGetDownloadURL(...args),
  deleteObject: (...args: unknown[]) => mockDeleteObject(...args),
  listAll: (...args: unknown[]) => mockListAll(...args),
  getMetadata: (...args: unknown[]) => mockGetMetadata(...args),
  uploadBytes: jest.fn(),
}));

import { getAudioFileMetadata } from '@/services/firebase/firebaseStorageService';

describe('firebaseStorageService.getAudioFileMetadata', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockStorageRef.mockReturnValue('storage-ref');
    mockGetStorageInstance.mockResolvedValue({ kind: 'storage' });
    mockGetMetadata.mockResolvedValue({ size: 123456 });
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns null when no matching audio file exists in storage', async () => {
    mockListAll.mockResolvedValue({ items: [] });

    await expect(getAudioFileMetadata('abc123def45')).resolves.toBeNull();
  });

  it('resolves audio metadata from storage when a matching file exists', async () => {
    const mockItem = {
      name: 'audio_[abc123def45]_1234567890.mp3',
      fullPath: 'audio/audio_[abc123def45]_1234567890.mp3',
    };
    mockListAll.mockResolvedValue({ items: [mockItem] });
    mockGetDownloadURL.mockResolvedValue('https://public.example/audio.mp3');

    const result = await getAudioFileMetadata('abc123def45');

    expect(result).not.toBeNull();
    expect(result!.audioUrl).toBe('https://public.example/audio.mp3');
    expect(result!.videoId).toBe('abc123def45');
    expect(result!.storagePath).toBe('audio/audio_[abc123def45]_1234567890.mp3');
    expect(result!.fileSize).toBe(123456);
  });

  it('returns null when storage is not initialized', async () => {
    mockGetStorageInstance.mockResolvedValue(null);

    await expect(getAudioFileMetadata('abc123def45')).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('Firebase Storage not initialized');
  });
});
