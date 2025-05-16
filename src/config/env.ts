// Environment configuration

export const config = {
  // Python backend API URL
  pythonApiUrl: process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5000',
  
  // Other environment variables
  apiTimeout: 30000, // 30 seconds
  maxAudioSize: 50 * 1024 * 1024, // 50MB
};

export default config; 