import { NextRequest, NextResponse } from 'next/server';

/**
 * Debug endpoint to test Vercel Blob upload functionality
 * This helps diagnose blob upload issues in production
 */

export const maxDuration = 60; // 1 minute for testing

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Debug: Testing Vercel Blob upload functionality');

    // Get the form data from the request
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided for blob upload test' },
        { status: 400 }
      );
    }

    const fileSizeMB = file.size / 1024 / 1024;
    console.log(`🔍 Debug: Testing blob upload for file: ${file.name} (${fileSizeMB.toFixed(2)}MB)`);

    // Import Vercel Blob service
    const { vercelBlobUploadService } = await import('@/services/vercelBlobUploadService');

    // Check if blob upload should be used
    const shouldUseBlob = vercelBlobUploadService.shouldUseBlobUpload(file.size);
    console.log(`🔍 Debug: Should use blob upload: ${shouldUseBlob}`);

    // Check if blob is configured
    const isBlobAvailable = vercelBlobUploadService.isBlobUploadAvailable();
    console.log(`🔍 Debug: Blob upload available: ${isBlobAvailable}`);

    if (!shouldUseBlob) {
      return NextResponse.json({
        success: true,
        message: 'File is small enough for direct processing',
        fileSize: fileSizeMB,
        shouldUseBlob: false,
        blobAvailable: isBlobAvailable
      });
    }

    if (!isBlobAvailable) {
      return NextResponse.json({
        success: false,
        error: 'Blob upload not available',
        fileSize: fileSizeMB,
        shouldUseBlob: true,
        blobAvailable: false,
        suggestion: 'Check BLOB_READ_WRITE_TOKEN configuration'
      });
    }

    // Test blob upload
    console.log(`🔍 Debug: Attempting blob upload...`);
    const startTime = Date.now();
    const blobUrl = await vercelBlobUploadService.uploadToBlob(file);
    const uploadTime = Date.now() - startTime;
    console.log(`🔍 Debug: Blob upload successful: ${blobUrl} (took ${uploadTime}ms)`);

    // Test blob download
    console.log(`🔍 Debug: Testing blob download...`);
    const downloadResponse = await fetch(blobUrl);
    if (!downloadResponse.ok) {
      throw new Error(`Blob download failed: ${downloadResponse.status} ${downloadResponse.statusText}`);
    }

    const downloadedSize = parseInt(downloadResponse.headers.get('content-length') || '0');
    console.log(`🔍 Debug: Blob download successful, size: ${downloadedSize} bytes`);

    return NextResponse.json({
      success: true,
      message: 'Blob upload and download test successful',
      fileSize: fileSizeMB,
      blobUrl: blobUrl,
      downloadedSize: downloadedSize,
      uploadTime: uploadTime,
      shouldUseBlob: true,
      blobAvailable: true,
      environment: process.env.NODE_ENV,
      hasToken: !!process.env.BLOB_READ_WRITE_TOKEN
    });

  } catch (error) {
    console.error('🔍 Debug: Blob upload test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: 'Blob upload test failed'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Blob upload debug endpoint',
    usage: 'POST a file to test blob upload functionality',
    endpoints: {
      test: 'POST /api/debug/blob-upload with file in form data'
    }
  });
}
