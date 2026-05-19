import type { App } from 'firebase-admin/app';

let adminAppPromise: Promise<App> | null = null;

function getStorageBucketName(): string | undefined {
  return process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
}

export async function getFirebaseAdminApp(): Promise<App> {
  if (adminAppPromise) {
    return adminAppPromise;
  }

  adminAppPromise = (async () => {
    const { initializeApp, getApps, cert } = await import('firebase-admin/app');
    const existingApp = getApps()[0];
    if (existingApp) {
      return existingApp;
    }

    const rawCredentials = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
    const storageBucket = getStorageBucketName();

    if (rawCredentials) {
      try {
        const serviceAccount = JSON.parse(rawCredentials);
        return initializeApp({
          credential: cert(serviceAccount),
          ...(storageBucket ? { storageBucket } : {}),
        });
      } catch (error) {
        console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY, falling back to ADC:', error);
      }
    }

    return initializeApp({
      ...(storageBucket ? { storageBucket } : {}),
    });
  })();

  return adminAppPromise;
}

export async function getFirebaseAdminAuth() {
  const [{ getAuth }, app] = await Promise.all([
    import('firebase-admin/auth'),
    getFirebaseAdminApp(),
  ]);
  return getAuth(app);
}

export async function getFirebaseAdminStorageBucket() {
  const [{ getStorage }, app] = await Promise.all([
    import('firebase-admin/storage'),
    getFirebaseAdminApp(),
  ]);
  return getStorage(app).bucket(getStorageBucketName());
}
