const DEFAULT_PYTHON_API_URL = 'http://localhost:5001';
const DEFAULT_FRONTEND_URL = 'http://localhost:3000';
const DEFAULT_LOCAL_SONGFORMER_API_URL = 'http://localhost:8080';
const DEFAULT_LOCAL_SHEETSAGE_API_URL = 'http://localhost:8082';

function isProductionLikeEnvironment(): boolean {
  return process.env.NODE_ENV === 'production';
}

function isLocalUrl(candidateUrl: string | undefined): boolean {
  if (!candidateUrl) {
    return false;
  }

  try {
    const { hostname } = new URL(candidateUrl);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return candidateUrl.includes('localhost') || candidateUrl.includes('127.0.0.1');
  }
}

export function getPythonApiUrl(): string {
  return process.env.PYTHON_API_URL || DEFAULT_PYTHON_API_URL;
}

export function getSongformerApiUrl(): string {
  if (isProductionLikeEnvironment()) {
    return process.env.SONGFORMER_API_URL || getPythonApiUrl();
  }

  const localSongformerUrl = process.env.LOCAL_SONGFORMER_API_URL || process.env.SONGFORMER_API_URL;
  return localSongformerUrl && isLocalUrl(localSongformerUrl)
    ? localSongformerUrl
    : DEFAULT_LOCAL_SONGFORMER_API_URL;
}

export function getSheetSageApiUrl(): string {
  if (isProductionLikeEnvironment()) {
    return process.env.SHEETSAGE_API_URL || getPythonApiUrl();
  }

  const localSheetSageUrl = process.env.LOCAL_SHEETSAGE_API_URL || process.env.SHEETSAGE_API_URL;
  return localSheetSageUrl && isLocalUrl(localSheetSageUrl)
    ? localSheetSageUrl
    : DEFAULT_LOCAL_SHEETSAGE_API_URL;
}

export function getFrontendBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || DEFAULT_FRONTEND_URL;
}

export function isLocalPythonApi(): boolean {
  const backendUrl = getPythonApiUrl();
  return backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1');
}
