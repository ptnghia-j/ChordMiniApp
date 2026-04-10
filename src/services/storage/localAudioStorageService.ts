import path from 'path';
import { tmpdir } from 'os';
import { promises as fs } from 'fs';

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.opus', '.webm'] as const;
const PROJECT_LOCAL_AUDIO_DIR = path.join(process.cwd(), 'temp');
const LEGACY_LOCAL_AUDIO_DIR = path.join(tmpdir(), 'chordmini-ytdlp');
const LOCAL_AUDIO_METADATA_FILE = path.join(PROJECT_LOCAL_AUDIO_DIR, 'cache-metadata.json');

export interface LocalAudioMetadataEntry {
  videoId: string;
  audioUrl?: string;
  title?: string;
  duration?: number;
  fileSize?: number;
  createdAt?: string;
  filePath?: string;
  filename?: string;
}

export interface LocalAudioFileData {
  videoId: string;
  filename: string;
  filePath: string;
  fileSize: number;
  audioUrl: string;
  title?: string;
  duration?: number;
  createdAt?: string;
  sourceDir: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasAllowedAudioExtension(filename: string): boolean {
  return AUDIO_EXTENSIONS.some((extension) => filename.endsWith(extension));
}

export function buildLocalAudioServeUrl(filename: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  return `${baseUrl}/api/serve-local-audio?filename=${encodeURIComponent(filename)}`;
}

export function getLocalAudioSearchDirs(): string[] {
  return [PROJECT_LOCAL_AUDIO_DIR, LEGACY_LOCAL_AUDIO_DIR];
}

export async function ensureLocalAudioWriteDir(): Promise<string> {
  await fs.mkdir(PROJECT_LOCAL_AUDIO_DIR, { recursive: true });
  return PROJECT_LOCAL_AUDIO_DIR;
}

export function matchesLocalAudioVideoId(filename: string, videoId: string): boolean {
  if (!hasAllowedAudioExtension(filename)) {
    return false;
  }

  const basename = path.basename(filename, path.extname(filename));
  if (basename === videoId || basename.startsWith(`${videoId}_`) || basename.startsWith(`${videoId}-`)) {
    return true;
  }

  return new RegExp(`\\[${escapeRegExp(videoId)}\\]`).test(filename);
}

function inferTitleFromFilename(filename: string, videoId: string): string {
  const basename = path.basename(filename, path.extname(filename));
  const withoutVideoId = basename
    .replace(new RegExp(`-?\\[${escapeRegExp(videoId)}\\]$`), '')
    .trim();

  if (!withoutVideoId || withoutVideoId === videoId) {
    return `YouTube Video ${videoId}`;
  }

  return withoutVideoId.replace(/_/g, ' ').trim();
}

async function readLocalAudioMetadataEntries(): Promise<LocalAudioMetadataEntry[]> {
  try {
    const raw = await fs.readFile(LOCAL_AUDIO_METADATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as LocalAudioMetadataEntry[] : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    console.warn('Failed to read local audio metadata cache:', error);
    return [];
  }
}

function normalizeLocalAudioFileData(
  videoId: string,
  filename: string,
  filePath: string,
  fileSize: number,
  sourceDir: string,
  metadata?: LocalAudioMetadataEntry
): LocalAudioFileData {
  return {
    videoId,
    filename,
    filePath,
    fileSize,
    audioUrl: buildLocalAudioServeUrl(filename),
    title: metadata?.title || inferTitleFromFilename(filename, videoId),
    duration: metadata?.duration,
    createdAt: metadata?.createdAt,
    sourceDir,
  };
}

export async function findLocalAudioFileByFilename(filename: string): Promise<LocalAudioFileData | null> {
  const safeFilename = path.basename(filename);
  if (!safeFilename || safeFilename !== filename || !hasAllowedAudioExtension(safeFilename)) {
    return null;
  }

  for (const directory of getLocalAudioSearchDirs()) {
    const filePath = path.join(directory, safeFilename);

    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        continue;
      }

      return {
        videoId: '',
        filename: safeFilename,
        filePath,
        fileSize: stats.size,
        audioUrl: buildLocalAudioServeUrl(safeFilename),
        sourceDir: directory,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`Failed to inspect local audio file ${filePath}:`, error);
      }
    }
  }

  return null;
}

export async function findExistingLocalAudioFile(videoId: string): Promise<LocalAudioFileData | null> {
  const metadataEntries = await readLocalAudioMetadataEntries();
  const metadataByVideoId = new Map(
    metadataEntries
      .filter((entry) => entry.videoId)
      .map((entry) => [entry.videoId, entry])
  );

  const matches: Array<LocalAudioFileData & { modifiedAt: number }> = [];

  for (const directory of getLocalAudioSearchDirs()) {
    try {
      const files = await fs.readdir(directory);

      for (const filename of files) {
        if (!matchesLocalAudioVideoId(filename, videoId)) {
          continue;
        }

        const filePath = path.join(directory, filename);
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) {
          continue;
        }

        matches.push({
          ...normalizeLocalAudioFileData(
            videoId,
            filename,
            filePath,
            stats.size,
            directory,
            metadataByVideoId.get(videoId)
          ),
          modifiedAt: stats.mtimeMs,
        });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`Failed to scan local audio directory ${directory}:`, error);
      }
    }
  }

  matches.sort((left, right) => right.modifiedAt - left.modifiedAt);
  return matches[0] ?? null;
}

export async function findExistingLocalAudioFiles(videoIds: string[]): Promise<Map<string, LocalAudioFileData>> {
  const results = new Map<string, LocalAudioFileData>();

  for (const videoId of videoIds) {
    const match = await findExistingLocalAudioFile(videoId);
    if (match) {
      results.set(videoId, match);
    }
  }

  return results;
}

export async function saveLocalAudioMetadata(entry: LocalAudioMetadataEntry): Promise<void> {
  if (!entry.videoId) {
    return;
  }

  await ensureLocalAudioWriteDir();
  const entries = await readLocalAudioMetadataEntries();
  const resolvedFilename = entry.filename || (entry.filePath ? path.basename(entry.filePath) : undefined);
  const nextEntry: LocalAudioMetadataEntry = {
    ...entry,
    filename: resolvedFilename,
    audioUrl: entry.audioUrl || (resolvedFilename ? buildLocalAudioServeUrl(resolvedFilename) : entry.audioUrl),
    createdAt: entry.createdAt || new Date().toISOString(),
  };

  const existingIndex = entries.findIndex((current) => current.videoId === entry.videoId);
  if (existingIndex >= 0) {
    entries[existingIndex] = {
      ...entries[existingIndex],
      ...nextEntry,
    };
  } else {
    entries.push(nextEntry);
  }

  await fs.writeFile(LOCAL_AUDIO_METADATA_FILE, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
}
