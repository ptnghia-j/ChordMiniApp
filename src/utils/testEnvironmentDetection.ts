/**
 * Test utility for environment detection
 * This file can be used to verify that localhost detection is working correctly
 */

import { isLocalBackend, getBackendUrl } from '@/utils/backendConfig';
import { vercelBlobUploadService } from '@/services/storage/vercelBlobUploadService';

/**
 * Test environment detection and blob upload logic
 */
export function testEnvironmentDetection(): void {
  console.log('🧪 Testing Environment Detection');
  console.log('================================');
  
  // Test backend URL detection
  const backendUrl = getBackendUrl();
  const isLocalhost = isLocalBackend();
  
  console.log(`Backend URL: ${backendUrl}`);
  console.log(`Is Localhost: ${isLocalhost}`);
  console.log(`Environment: ${isLocalhost ? 'Development (localhost)' : 'Production'}`);
  
  // Test blob upload decision for different file sizes
  const testFileSizes = [
    1 * 1024 * 1024,    // 1MB
    3 * 1024 * 1024,    // 3MB
    5 * 1024 * 1024,    // 5MB
    10 * 1024 * 1024,   // 10MB
  ];
  
  console.log('\n📊 Blob Upload Decision Tests:');
  console.log('==============================');
  
  testFileSizes.forEach(size => {
    const shouldUseBlob = vercelBlobUploadService.shouldUseBlobUpload(size);
    const sizeStr = vercelBlobUploadService.getFileSizeString(size);
    console.log(`${sizeStr}: ${shouldUseBlob ? 'Use Blob Upload' : 'Direct Processing'}`);
  });
  
  console.log('\n✅ Environment detection test completed');
}

/**
 * Log current environment configuration
 */
export function logEnvironmentConfig(): void {
  const backendUrl = getBackendUrl();
  const isLocalhost = isLocalBackend();
  
  console.log('🔧 Current Environment Configuration:');
  console.log({
    backendUrl,
    isLocalhost,
    environment: isLocalhost ? 'localhost development' : 'production',
    blobUploadEnabled: !isLocalhost,
    pythonApiUrl: process.env.NEXT_PUBLIC_PYTHON_API_URL || 'not set (using fallback)',
  });
}
