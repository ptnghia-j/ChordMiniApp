/**
 * Firebase Configuration Checker
 * 
 * Utility to check Firebase configuration and provide helpful error messages
 * for debugging authentication issues in different environments.
 */

export interface FirebaseConfigStatus {
  isConfigured: boolean;
  hasServiceAccount: boolean;
  hasApplicationCredentials: boolean;
  environment: 'development' | 'production';
  issues: string[];
  recommendations: string[];
}

/**
 * Check Firebase configuration status
 */
export function checkFirebaseConfig(): FirebaseConfigStatus {
  const status: FirebaseConfigStatus = {
    isConfigured: false,
    hasServiceAccount: false,
    hasApplicationCredentials: false,
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    issues: [],
    recommendations: []
  };

  // Check basic Firebase configuration
  const requiredEnvVars = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length === 0) {
    status.isConfigured = true;
  } else {
    status.issues.push(`Missing required environment variables: ${missingVars.join(', ')}`);
    status.recommendations.push('Set all required Firebase environment variables in your .env.local file');
  }

  // Check service account configuration
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      status.hasServiceAccount = true;
    } catch {
      status.issues.push('FIREBASE_SERVICE_ACCOUNT_KEY is set but contains invalid JSON');
      status.recommendations.push('Verify the service account key is valid JSON format');
    }
  }

  // Check Application Default Credentials
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    status.hasApplicationCredentials = true;
  }

  // Environment-specific checks
  if (status.environment === 'production') {
    if (!status.hasServiceAccount && !status.hasApplicationCredentials) {
      status.issues.push('No Firebase Admin credentials configured for production');
      status.recommendations.push('Set FIREBASE_SERVICE_ACCOUNT_KEY environment variable in Vercel');
      status.recommendations.push('See docs/FIREBASE_SETUP.md for detailed instructions');
    }
  }

  return status;
}

/**
 * Log Firebase configuration status
 */
export function logFirebaseConfigStatus(): void {
  const status = checkFirebaseConfig();
  
  console.log('🔧 Firebase Configuration Status:');
  console.log(`   Environment: ${status.environment}`);
  console.log(`   Basic Config: ${status.isConfigured ? '✅' : '❌'}`);
  console.log(`   Service Account: ${status.hasServiceAccount ? '✅' : '❌'}`);
  console.log(`   App Default Creds: ${status.hasApplicationCredentials ? '✅' : '❌'}`);

  if (status.issues.length > 0) {
    console.warn('⚠️ Configuration Issues:');
    status.issues.forEach(issue => console.warn(`   - ${issue}`));
  }

  if (status.recommendations.length > 0) {
    console.log('💡 Recommendations:');
    status.recommendations.forEach(rec => console.log(`   - ${rec}`));
  }
}

/**
 * Get authentication method priority for current environment
 */
export function getAuthMethodPriority(): string[] {
  const status = checkFirebaseConfig();
  
  if (status.environment === 'production') {
    return [
      'Service Account Key (FIREBASE_SERVICE_ACCOUNT_KEY)',
      'Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS)',
      'Client SDK Fallback'
    ];
  } else {
    return [
      'Client SDK (Development)',
      'Service Account Key (if available)',
      'Application Default Credentials (if available)'
    ];
  }
}
