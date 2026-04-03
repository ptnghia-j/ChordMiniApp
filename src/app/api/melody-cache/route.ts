import { NextRequest, NextResponse } from 'next/server';
import type { SheetSageResult } from '@/types/sheetSage';
import { getDocumentWithAdminAccess } from '@/services/firebase/firestoreAdminService';

interface MelodyCacheDocument extends SheetSageResult {
  videoId: string;
  model: string;
  createdAt: string;
}

function isValidVideoId(videoId: string): boolean {
  return /^[a-zA-Z0-9_-]{11}$/.test(videoId);
}

function normalizeMelodyDocument(data: MelodyCacheDocument): MelodyCacheDocument {
  const noteEvents = Array.isArray(data.noteEvents)
    ? [...data.noteEvents]
      .filter((note) => (
        typeof note?.onset === 'number'
        && Number.isFinite(note.onset)
        && typeof note?.offset === 'number'
        && Number.isFinite(note.offset)
        && typeof note?.pitch === 'number'
        && Number.isFinite(note.pitch)
        && typeof note?.velocity === 'number'
        && Number.isFinite(note.velocity)
      ))
      .sort((left, right) => (
        left.onset - right.onset
        || left.pitch - right.pitch
        || left.offset - right.offset
      ))
      .map((note) => ({
        onset: note.onset,
        offset: Math.max(note.offset, note.onset),
        pitch: Math.max(0, Math.min(127, Math.round(note.pitch))),
        velocity: Math.max(0, Math.min(127, Math.round(note.velocity))),
      }))
    : [];

  const beatTimes = Array.isArray(data.beatTimes)
    ? data.beatTimes.filter((beatTime) => typeof beatTime === 'number' && Number.isFinite(beatTime))
    : [];

  return {
    ...data,
    source: 'sheetsage',
    noteEvents,
    noteEventCount: noteEvents.length,
    beatTimes,
    beatsPerMeasure:
      typeof data.beatsPerMeasure === 'number' && Number.isFinite(data.beatsPerMeasure) && data.beatsPerMeasure > 0
        ? data.beatsPerMeasure
        : 4,
    tempoBpm:
      typeof data.tempoBpm === 'number' && Number.isFinite(data.tempoBpm) && data.tempoBpm > 0
        ? data.tempoBpm
        : 120,
    model: typeof data.model === 'string' && data.model.length > 0
      ? data.model
      : 'sheetsage-v0.2-handcrafted-melody-transformer',
  };
}

export async function GET(request: NextRequest) {
  try {
    const videoId = request.nextUrl.searchParams.get('videoId');
    if (!videoId || !isValidVideoId(videoId)) {
      return NextResponse.json(
        { success: false, cached: false, error: 'Valid videoId is required.' },
        { status: 400 },
      );
    }

    const melodyDoc = await getDocumentWithAdminAccess<MelodyCacheDocument>('melody', videoId);
    if (!melodyDoc) {
      console.log(`🎻 [API] No cached melody found for ${videoId}`);
      return NextResponse.json({ success: true, cached: false, data: null });
    }

    const data = normalizeMelodyDocument(melodyDoc);
    console.log(`🎻 [API] Loaded cached melody for ${videoId} (${data.noteEventCount} notes)`);
    return NextResponse.json({ success: true, cached: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown melody cache error';
    console.error('❌ [API] Failed to read melody cache:', message);
    return NextResponse.json(
      { success: false, cached: false, error: message },
      { status: 500 },
    );
  }
}
