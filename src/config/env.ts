// Environment configuration

export const config = {
  // Python backend API URL - Production Google Cloud Run endpoint
  pythonApiUrl: process.env.NEXT_PUBLIC_PYTHON_API_URL || 'https://chordmini-backend-full-1207160312.us-central1.run.app',

  // Local development fallback
  localApiUrl: 'http://localhost:5000',

  // Other environment variables
  apiTimeout: 120000, // 2 minutes for production ML models
  maxAudioSize: 50 * 1024 * 1024, // 50MB
};

export default config; 