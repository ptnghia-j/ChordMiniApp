import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { BROWSER_YTDLP_MAX_FINAL_BYTES } from '@/services/audio/browserYtDlpConfig';
import { getFirebaseAdminAuth, getFirebaseAdminStorageBucket } from '@/utils/firebaseAdmin';
import { validateBrowserAudioCandidate, YOUTUBE_VIDEO_ID_PATTERN, sha256Hex } from '@/utils/browserAudioValidation';
import { verifyAppCheckRequest } from '@/utils/serverAppCheck';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function normalizeTitle(value: unknown, videoId: string): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().slice(0, 240)
    : `YouTube Video ${videoId}`;
}

function buildFirebaseDownloadUrl(bucketName: string, objectPath: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(token)}`;
}

function splitCookiePair(cookie: string): { name: string; value: string } | null {
  const separatorIndex = cookie.indexOf('=');
  if (separatorIndex <= 0) {
    return null;
  }

  const name = cookie.slice(0, separatorIndex).trim();
  const value = cookie.slice(separatorIndex + 1).trim();
  if (!name || /[\t\r\n]/.test(name) || /[\r\n]/.test(value)) {
    return null;
  }

  return { name, value };
}

function toNetscapeCookieFile(rawCookie: string): string {
  const trimmed = rawCookie.trim();
  if (trimmed.startsWith('# Netscape HTTP Cookie File')) {
    return trimmed.endsWith('\n') ? trimmed : `${trimmed}\n`;
  }

  const lines = [
    '# Netscape HTTP Cookie File',
    '# Generated from the YOUTUBE_COOKIE environment variable.',
  ];

  for (const part of trimmed.split(';')) {
    const pair = splitCookiePair(part);
    if (!pair) {
      continue;
    }

    const secure = pair.name.startsWith('__Secure-') || pair.name === 'SAPISID' || pair.name === 'SSID' || pair.name === 'LOGIN_INFO';
    lines.push(`.youtube.com\tTRUE\t/\t${secure ? 'TRUE' : 'FALSE'}\t0\t${pair.name}\t${pair.value}`);
  }

  if (lines.length <= 2) {
    throw new Error('YOUTUBE_COOKIE did not contain any usable YouTube cookies.');
  }

  return `${lines.join('\n')}\n`;
}

function getPlayerClients(): string[] {
  const configured = process.env.YTDLP_PLAYER_CLIENTS || 'android_vr,tv,web';
  return configured
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function runCommand(command: string, args: string[], timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (result: CommandResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ code: null, stdout, stderr: `${stderr}\n${command} timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      finish({ code: null, stdout, stderr: error.message });
    });

    child.on('close', (code) => {
      finish({ code, stdout, stderr });
    });
  });
}

async function findDownloadedSource(tempDir: string, stdout: string): Promise<string | null> {
  const printedPath = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith(tempDir));

  if (printedPath) {
    try {
      await fs.access(printedPath);
      return printedPath;
    } catch {}
  }

  const files = await fs.readdir(tempDir);
  const source = files.find((file) => /\.(m4a|webm|opus|mp4)$/i.test(file));
  return source ? path.join(tempDir, source) : null;
}

async function downloadSourceAudio(params: {
  videoId: string;
  cookieFile?: string;
  tempDir: string;
}): Promise<{ sourcePath: string; playerClient: string }> {
  const errors: string[] = [];
  const authModes = params.cookieFile
    ? [
        { label: 'cookie', cookieFile: params.cookieFile },
        { label: 'no-cookie' },
      ]
    : [{ label: 'no-cookie' }];

  for (const authMode of authModes) {
    for (const playerClient of getPlayerClients()) {
      const attemptName = `${authMode.label}:${playerClient}`;
      const outputTemplate = path.join(params.tempDir, `${params.videoId}-${authMode.label}-${playerClient}.%(ext)s`);
      const args = [
        '--no-playlist',
        '--no-progress',
        '--extractor-args',
        `youtube:player_client=${playerClient}`,
        '-f',
        'bestaudio[ext=m4a]/bestaudio',
        '--output',
        outputTemplate,
        '--print',
        'after_move:filepath',
        `https://www.youtube.com/watch?v=${params.videoId}`,
      ];

      if (authMode.cookieFile) {
        args.unshift('--cookies', authMode.cookieFile);
      }

      const result = await runCommand('yt-dlp', args, 180000);
      if (result.code === 0) {
        const sourcePath = await findDownloadedSource(params.tempDir, result.stdout);
        if (sourcePath) {
          return { sourcePath, playerClient: attemptName };
        }
        errors.push(`${attemptName}: yt-dlp completed but no source audio file was found.`);
        continue;
      }

      errors.push(`${attemptName}: ${result.stderr.trim().slice(0, 1200) || `yt-dlp exited with code ${result.code}`}`);
    }
  }

  throw new Error(`Native yt-dlp source download failed. ${errors.join(' | ')}`);
}

async function convertToMediumMp3(sourcePath: string, outputPath: string): Promise<void> {
  const result = await runCommand('ffmpeg', [
    '-y',
    '-i',
    sourcePath,
    '-vn',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '192k',
    outputPath,
  ], 120000);

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || `ffmpeg exited with code ${result.code}`);
  }
}

export async function POST(request: NextRequest) {
  const appCheck = await verifyAppCheckRequest(request);
  if (!appCheck.ok) {
    return NextResponse.json({ success: false, error: appCheck.error }, { status: appCheck.status || 403 });
  }

  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ success: false, error: 'Missing Firebase auth token.' }, { status: 401 });
  }

  let tempDir = '';

  try {
    const body = await request.json();
    const videoId = typeof body.videoId === 'string' ? body.videoId : '';
    if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
      return NextResponse.json({ success: false, error: 'Invalid YouTube video ID.' }, { status: 400 });
    }

    const auth = await getFirebaseAdminAuth();
    await auth.verifyIdToken(token);

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `chordmini-ytdlp-${videoId}-`));
    const cookie = process.env.YOUTUBE_COOKIE?.trim();
    const cookieFile = cookie ? path.join(tempDir, 'youtube-cookies.txt') : undefined;
    const outputPath = path.join(tempDir, `${videoId}.mp3`);
    if (cookieFile && cookie) {
      await fs.writeFile(cookieFile, toNetscapeCookieFile(cookie), { mode: 0o600 });
    }

    const { sourcePath, playerClient } = await downloadSourceAudio({ videoId, cookieFile, tempDir });
    await convertToMediumMp3(sourcePath, outputPath);

    const buffer = await fs.readFile(outputPath);
    if (buffer.byteLength > BROWSER_YTDLP_MAX_FINAL_BYTES) {
      throw new Error('Extracted MP3 is larger than the 50MB Firebase cache limit.');
    }

    const sha256 = await sha256Hex(buffer);
    const validation = await validateBrowserAudioCandidate({
      buffer,
      contentType: 'audio/mpeg',
      expectedVideoId: videoId,
      expectedSha256: sha256,
      expectedFileSize: buffer.byteLength,
    });

    const bucket = await getFirebaseAdminStorageBucket();
    const timestamp = Date.now();
    const finalPath = `audio/audio_[${videoId}]_${timestamp}.mp3`;
    const downloadToken = randomUUID();
    const title = normalizeTitle(body.title, videoId);

    await bucket.file(finalPath).save(buffer, {
      resumable: false,
      metadata: {
        contentType: 'audio/mpeg',
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
          source: 'native-ytdlp-fallback',
          videoId,
          sha256,
          bitrate: '192k',
          playerClient,
          title,
          channelTitle: typeof body.channelTitle === 'string' ? body.channelTitle.slice(0, 240) : '',
          thumbnail: typeof body.thumbnail === 'string' ? body.thumbnail.slice(0, 500) : '',
          validatedAt: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({
      success: true,
      audioUrl: buildFirebaseDownloadUrl(bucket.name, finalPath, downloadToken),
      storagePath: finalPath,
      title,
      duration: validation.duration,
      fileSize: buffer.byteLength,
      isStreamUrl: false,
      method: 'native-ytdlp-fallback',
    });
  } catch (error) {
    console.error('Native yt-dlp fallback failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Native yt-dlp fallback failed.' },
      { status: 500 }
    );
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
