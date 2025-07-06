// Environment configuration

export const config = {
  // Python backend API URL - Uses environment variable with localhost fallback for development
  pythonApiUrl: process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5000',

  // Local development URL (for reference)
  localApiUrl: 'http://localhost:5000',

  // Other environment variables
  apiTimeout: 120000, // 2 minutes for production ML models
  maxAudioSize: 50 * 1024 * 1024, // 50MB
};

export default config; 