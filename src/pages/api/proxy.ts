import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { path } = req.query;
  
  // Get backend URL from environment variable
  const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'https://chordmini-backend-full-12071603127.us-central1.run.app';
  
  // Construct the full URL
  const targetUrl = `${backendUrl}/api/v1/${Array.isArray(path) ? path.join('/') : path}`;
  
  try {
    // Forward the request to the backend
    const headers: Record<string, string> = {
      'Content-Type': req.headers['content-type'] || 'application/json',
    };

    // Add other headers, converting to string
    Object.entries(req.headers).forEach(([key, value]) => {
      if (value && typeof value === 'string') {
        headers[key] = value;
      } else if (value && Array.isArray(value)) {
        headers[key] = value[0];
      }
    });

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });
    
    const data = await response.json();
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Return the response
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};
