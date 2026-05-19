import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminAuth, getFirebaseAdminStorageBucket } from '@/utils/firebaseAdmin';
import { verifyAppCheckRequest } from '@/utils/serverAppCheck';
import {
  BROWSER_YTDLP_CANDIDATE_PATH_PATTERN,
  parseBrowserYtDlpCandidatePath,
  validateBrowserAudioCandidate,
  YOUTUBE_VIDEO_ID_PATTERN,
} from '@/utils/browserAudioValidation';
import { BROWSER_YTDLP_MAX_FINAL_BYTES } from '@/services/audio/browserYtDlpConfig';

export const runtime = 'nodejs';
export const maxDuration = 120;

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

export async function POST(request: NextRequest) {
  const appCheck = await verifyAppCheckRequest(request);
  if (!appCheck.ok) {
    return NextResponse.json({ success: false, error: appCheck.error }, { status: appCheck.status || 403 });
  }

  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'Missing Firebase auth token.' }, { status: 401 });
    }

    const body = await request.json();
    const videoId = typeof body.videoId === 'string' ? body.videoId : '';
    const candidatePath = typeof body.candidatePath === 'string' ? body.candidatePath : '';
    const sha256 = typeof body.sha256 === 'string' ? body.sha256 : '';
    const reportedFileSize = typeof body.fileSize === 'number' ? body.fileSize : undefined;

    if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
      return NextResponse.json({ success: false, error: 'Invalid YouTube video ID.' }, { status: 400 });
    }

    if (!BROWSER_YTDLP_CANDIDATE_PATH_PATTERN.test(candidatePath)) {
      return NextResponse.json({ success: false, error: 'Invalid audio candidate path.' }, { status: 400 });
    }

    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      return NextResponse.json({ success: false, error: 'Invalid audio candidate hash.' }, { status: 400 });
    }

    if (reportedFileSize !== undefined && (!Number.isFinite(reportedFileSize) || reportedFileSize <= 0 || reportedFileSize > BROWSER_YTDLP_MAX_FINAL_BYTES)) {
      return NextResponse.json({ success: false, error: 'Invalid audio candidate size.' }, { status: 400 });
    }

    const candidate = parseBrowserYtDlpCandidatePath(candidatePath);
    if (!candidate || candidate.videoId !== videoId || candidate.sha256 !== sha256) {
      return NextResponse.json({ success: false, error: 'Audio candidate path does not match the request.' }, { status: 400 });
    }

    const auth = await getFirebaseAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    if (decoded.uid !== candidate.uid) {
      return NextResponse.json({ success: false, error: 'Audio candidate owner does not match the authenticated user.' }, { status: 403 });
    }

    const bucket = await getFirebaseAdminStorageBucket();
    const sourceFile = bucket.file(candidatePath);
    const [exists] = await sourceFile.exists();
    if (!exists) {
      return NextResponse.json({ success: false, error: 'Audio candidate was not found.' }, { status: 404 });
    }

    const [sourceMetadata] = await sourceFile.getMetadata();
    const contentType = sourceMetadata.contentType;
    const size = Number(sourceMetadata.size || 0);
    if (!Number.isFinite(size) || size <= 0 || size > BROWSER_YTDLP_MAX_FINAL_BYTES) {
      return NextResponse.json({ success: false, error: 'Audio candidate size is invalid.' }, { status: 400 });
    }

    const [buffer] = await sourceFile.download();
    const validation = await validateBrowserAudioCandidate({
      buffer,
      contentType,
      expectedVideoId: videoId,
      expectedSha256: sha256,
      expectedFileSize: reportedFileSize,
    });

    const timestamp = Date.now();
    const finalPath = `audio/audio_[${videoId}]_${timestamp}.mp3`;
    const downloadToken = randomUUID();
    const title = normalizeTitle(body.title, videoId);
    const finalFile = bucket.file(finalPath);

    await finalFile.save(buffer, {
      resumable: false,
      metadata: {
        contentType: 'audio/mpeg',
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
          source: 'browser-ytdlp',
          videoId,
          sha256,
          bitrate: '192k',
          title,
          channelTitle: typeof body.channelTitle === 'string' ? body.channelTitle.slice(0, 240) : '',
          thumbnail: typeof body.thumbnail === 'string' ? body.thumbnail.slice(0, 500) : '',
          validatedAt: new Date().toISOString(),
        },
      },
    });

    await sourceFile.delete({ ignoreNotFound: true }).catch((error) => {
      console.warn('Failed to delete browser extraction candidate after promotion:', error);
    });

    return NextResponse.json({
      success: true,
      audioUrl: buildFirebaseDownloadUrl(bucket.name, finalPath, downloadToken),
      storagePath: finalPath,
      title,
      duration: validation.duration,
      fileSize: buffer.byteLength,
      isStreamUrl: false,
      method: 'browser-ytdlp',
    });
  } catch (error) {
    console.error('Browser extraction finalization failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Audio finalization failed.' },
      { status: 500 }
    );
  }
}
