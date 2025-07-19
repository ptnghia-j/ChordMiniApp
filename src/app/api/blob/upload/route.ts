import {handleUpload, type HandleUploadBody} from '@vercel/blob/client';
import { NextResponse } from 'next/server';

/**
 * API route for Vercel Blob client uploads
 * This handles the token exchange for secure client-side uploads to Vercel Blob
 *
 * Store: store_TRGSq1xmFVErVvno
 * Store URL: https://vercel.com/nghias-projects/chord-mini-app/stores/blob/store_TRGSq1xmFVErVvno/browser
 * Reference: https://vercel.com/docs/vercel-blob/client-upload
 * SDK Docs: https://vercel.com/docs/vercel-blob/using-blob-sdk
 */

// Configure Vercel function timeout
export const maxDuration = 60; // 1 minute for blob upload coordination

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as HandleUploadBody;

    console.log('📤 Vercel Blob upload request received for store_TRGSq1xmFVErVvno');

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Generate a client token for the browser to upload the file
        // ⚠️ Authenticate and authorize users before generating the token.
        // For now, we'll allow all audio file uploads but with restrictions

        console.log(`🔐 Generating upload token for: ${pathname}`);

        return {
          allowedContentTypes: [
            'audio/mpeg',
            'audio/mp3', 
            'audio/wav',
            'audio/flac',
            'audio/ogg',
            'audio/m4a',
            'audio/aac',
            'audio/webm',
            'audio/x-wav',
            'audio/x-flac'
          ],
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            // Optional payload sent to server on upload completion
            uploadedAt: new Date().toISOString(),
            clientPayload
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Get notified of client upload completion
        console.log('✅ Blob upload completed:', {
          url: blob.url,
          pathname: blob.pathname
        });

        try {
          // Parse token payload
          const payload = tokenPayload ? JSON.parse(tokenPayload) : {};
          console.log('📋 Upload payload:', payload);

          // Here you could run any logic after the file upload completed
          // For example: update database, send notifications, etc.
          // await db.update({ audioUrl: blob.url, uploadedAt: payload.uploadedAt });

        } catch (error) {
          console.error('❌ Error processing upload completion:', error);
          // Don't throw here as the upload itself was successful
        }
      },
    });

    return NextResponse.json(jsonResponse);

  } catch (error) {
    console.error('❌ Blob upload handler error:', error);
    
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 } // The webhook will retry 5 times waiting for a 200
    );
  }
}
