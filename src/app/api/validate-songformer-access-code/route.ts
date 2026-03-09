import { NextRequest, NextResponse } from 'next/server';

import {
  getSegmentationAccessMissingConfigurationMessage,
  isSegmentationAccessRequired,
  validateSegmentationAccessCode,
} from '@/services/api/segmentationAccessService';

interface ValidationRequest {
  apiKey?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ValidationRequest;
    const accessCode = typeof body.apiKey === 'string' ? body.apiKey : '';

    if (!isSegmentationAccessRequired()) {
      return NextResponse.json({
        valid: true,
        message: 'Song segmentation access code is not required in this environment.',
      });
    }

    const validation = validateSegmentationAccessCode(accessCode);
    if (validation.isValid) {
      return NextResponse.json({ valid: true, message: 'Access code is valid' });
    }

    const status = validation.error === getSegmentationAccessMissingConfigurationMessage() ? 503 : 400;
    return NextResponse.json({ valid: false, error: validation.error }, { status });
  } catch (error) {
    console.error('Error validating SongFormer access code:', error);
    return NextResponse.json(
      { valid: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}