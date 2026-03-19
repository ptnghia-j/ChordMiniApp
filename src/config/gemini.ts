import { GoogleGenAI } from '@google/genai';

export const GEMINI_MODEL_NAME = 'gemini-3.1-flash-lite-preview';
export const GEMINI_DEFAULT_TIMEOUT_MS = 120000;

const serverClients = new Map<number, GoogleGenAI>();

interface GeminiClientOptions {
  apiKey?: string;
  timeoutMs?: number;
}

export function createGeminiClient({
  apiKey,
  timeoutMs = GEMINI_DEFAULT_TIMEOUT_MS
}: GeminiClientOptions = {}): GoogleGenAI | null {
  const resolvedApiKey = apiKey ?? process.env.GEMINI_API_KEY;

  if (!resolvedApiKey) {
    return null;
  }

  if (!apiKey) {
    const cachedClient = serverClients.get(timeoutMs);
    if (cachedClient) {
      return cachedClient;
    }
  }

  const client = new GoogleGenAI({
    apiKey: resolvedApiKey,
    httpOptions: {
      timeout: timeoutMs
    }
  });

  if (!apiKey) {
    serverClients.set(timeoutMs, client);
  }

  return client;
}
