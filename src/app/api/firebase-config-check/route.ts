import { NextResponse } from 'next/server';
import { checkFirebaseConfig, getAuthMethodPriority } from '@/utils/firebaseConfigCheck';

/**
 * API endpoint to check Firebase configuration status
 * Useful for debugging authentication issues in production
 */
export async function GET() {
  try {
    const configStatus = checkFirebaseConfig();
    const authMethods = getAuthMethodPriority();

    // Test Firebase Admin SDK availability
    let adminSdkStatus = 'not_tested';
    let adminSdkError = null;

    try {
      const admin = await import('firebase-admin');
      
      if (admin.apps.length === 0) {
        // Try to initialize without actually doing it
        if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
          adminSdkStatus = 'service_account_available';
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
          adminSdkStatus = 'app_default_creds_available';
        } else {
          adminSdkStatus = 'no_credentials';
        }
      } else {
        adminSdkStatus = 'already_initialized';
      }
    } catch (error) {
      adminSdkStatus = 'import_failed';
      adminSdkError = error instanceof Error ? error.message : 'Unknown error';
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      isVercel: !!process.env.VERCEL,
      configStatus,
      authMethods,
      adminSdk: {
        status: adminSdkStatus,
        error: adminSdkError
      },
      environmentVariables: {
        hasFirebaseApiKey: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        hasFirebaseProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        hasFirebaseStorageBucket: !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        hasServiceAccountKey: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
        hasGoogleAppCreds: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
        serviceAccountKeyLength: process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.length || 0
      }
    });

  } catch (error) {
    console.error('Firebase config check failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
