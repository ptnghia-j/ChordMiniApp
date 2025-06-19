# ChordMini

**Advanced music analysis platform with AI-powered chord recognition, beat detection, and synchronized lyrics.**

## Features Overview

### 🏠 Homepage Interface
![ChordMini Homepage Light](homepage.png)
![ChordMini Homepage Dark](homepage_dark.png)

Clean, intuitive interface for YouTube search, URL input, and recent video access.

### 🎵 Beat & Chord Analysis
![Beat Chord Grid](beatchord_grid.png)
![Beat Chord Grid with Lyrics](beatchord_grid_withlyrics.png)

Real-time chord progression visualization with synchronized beat detection and grid layout.

### 🎤 Lead Sheet with AI Assistant
![Lead Sheet with AI](leadsheet_with_ai.png)

Synchronized lyrics transcription with AI chatbot for contextual music analysis and translation support.

## 🚀 Local Development Setup

### Prerequisites

Before starting, ensure you have:

- **Node.js 18+** and **npm** installed
- **Git** for version control
- **Firebase account** (free tier sufficient)
- **API keys** (optional but recommended for full functionality):
  - YouTube Data API v3
  - Music.ai API (for lyrics transcription)
  - Google Gemini API (for AI features)

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/ptnghia-j/ChordMiniApp.git
   cd ChordMiniApp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment setup**
   ```bash
   cp .env.example .env.local
   ```

4. **Configure environment variables**

   Edit `.env.local` with your configuration:
   ```bash
   # Backend API (Production service available)
   NEXT_PUBLIC_PYTHON_API_URL=https://chordmini-backend-full-pluj3yargq-uc.a.run.app

   # Firebase Configuration
   NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

   # API Keys (Optional)
   NEXT_PUBLIC_YOUTUBE_API_KEY=your_youtube_api_key
   NEXT_PUBLIC_MUSIC_AI_API_KEY=your_music_ai_key
   NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_key
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

6. **Access the application**

   Open [http://localhost:3000](http://localhost:3000) in your browser

### Firebase Setup (Required)

1. **Create Firebase project**
   - Visit [Firebase Console](https://console.firebase.google.com/)
   - Click "Create a project"
   - Follow the setup wizard

2. **Enable Firestore Database**
   - Go to "Firestore Database" in the sidebar
   - Click "Create database"
   - Choose "Start in test mode" for development

3. **Get Firebase configuration**
   - Go to Project Settings (gear icon)
   - Scroll down to "Your apps"
   - Click "Add app" → Web app
   - Copy the configuration values to your `.env.local`

4. **Create Firestore collections**

   The app will automatically create these collections:
   - `cached-videos` - Processed video data
   - `cached-lyrics` - Transcribed lyrics
   - `cached-translations` - Translated content

### API Keys Setup (Optional)

#### YouTube Data API v3
```bash
# 1. Go to Google Cloud Console
# 2. Create/select project
# 3. Enable YouTube Data API v3
# 4. Create credentials (API key)
# 5. Add to .env.local
NEXT_PUBLIC_YOUTUBE_API_KEY=your_key_here
```

#### Music.ai API
```bash
# 1. Sign up at music.ai
# 2. Get API key from dashboard
# 3. Add to .env.local
NEXT_PUBLIC_MUSIC_AI_API_KEY=your_key_here
```

#### Google Gemini API
```bash
# 1. Visit Google AI Studio
# 2. Generate API key
# 3. Add to .env.local
NEXT_PUBLIC_GEMINI_API_KEY=your_key_here
```

### Production Backend

**✅ No local Python setup required!**

The production backend is already deployed and operational:
- **URL**: `https://chordmini-backend-full-pluj3yargq-uc.a.run.app`
- **Features**: Beat detection, chord recognition, lyrics processing
- **Status**: Healthy and auto-scaling

### Local Backend Setup (Optional)

If you want to run the backend locally for development or customization:

#### Prerequisites

- **Python 3.9+** (Python 3.9-3.11 recommended)
- **Virtual environment** (venv or conda)
- **Git** for cloning dependencies
- **System dependencies** (varies by OS)

#### Quick Setup

1. **Navigate to backend directory**
   ```bash
   cd python_backend
   ```

2. **Create virtual environment**
   ```bash
   python -m venv myenv

   # Activate virtual environment
   # On macOS/Linux:
   source myenv/bin/activate

   # On Windows:
   myenv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Start local backend**
   ```bash
   python app.py
   ```

5. **Update frontend configuration**

   Edit your `.env.local` to use local backend:
   ```bash
   # Change from production URL to local
   NEXT_PUBLIC_PYTHON_API_URL=http://localhost:5000
   ```

6. **Restart frontend development server**
   ```bash
   # In the main project directory
   npm run dev
   ```

#### Backend Features Available Locally

- **Beat Detection**: Beat-Transformer and madmom models
- **Chord Recognition**: Chord-CNN-LSTM, BTC-SL, BTC-PL models
- **Lyrics Processing**: Genius.com integration
- **Rate Limiting**: IP-based rate limiting with Flask-Limiter
- **Audio Processing**: Support for MP3, WAV, FLAC formats

#### Environment Variables for Local Backend

Create a `.env` file in the `python_backend` directory:

```bash
# Optional: Redis URL for distributed rate limiting
REDIS_URL=redis://localhost:6379

# Optional: Genius API for lyrics
GENIUS_ACCESS_TOKEN=your_genius_token

# Flask configuration
FLASK_MAX_CONTENT_LENGTH_MB=150
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

#### Troubleshooting Local Backend

**Import errors:**
```bash
# Ensure virtual environment is activated
source myenv/bin/activate  # macOS/Linux
myenv\Scripts\activate     # Windows

# Reinstall dependencies
pip install -r requirements.txt
```

**Model loading issues:**
```bash
# Check if model files exist
ls python_backend/models/

# Download missing models (if needed)
# Models are included in the repository
```

**Port conflicts:**
```bash
# Backend runs on port 5000 by default
# Kill existing processes
lsof -ti:5000 | xargs kill -9  # macOS/Linux
netstat -ano | findstr :5000   # Windows

# Or change port in app.py
app.run(host='0.0.0.0', port=5001)
```

**Memory issues:**
```bash
# Large audio files may require more memory
# Use smaller files for testing
# Or increase system memory allocation
```

#### Switching Between Local and Production

**Use Production Backend:**
```bash
# In .env.local
NEXT_PUBLIC_PYTHON_API_URL=https://chordmini-backend-full-pluj3yargq-uc.a.run.app
```

**Use Local Backend:**
```bash
# In .env.local
NEXT_PUBLIC_PYTHON_API_URL=http://localhost:5000
```

**Note**: Restart the frontend development server after changing the backend URL.

### Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint

# Type checking
npm run type-check
```

### Troubleshooting

**Port already in use:**
```bash
# Kill process on port 3000
npx kill-port 3000
# Or use different port
npm run dev -- -p 3001
```

**Firebase connection issues:**
- Verify all Firebase config values in `.env.local`
- Check Firebase project permissions
- Ensure Firestore is enabled

**API key errors:**
- Verify API keys are correctly set in `.env.local`
- Check API quotas and billing in respective consoles
- Restart development server after changing environment variables

## 🚀 Production Deployment

### Vercel Deployment (Recommended)

ChordMini is optimized for deployment on Vercel with automated scripts for a seamless deployment process.

#### Quick Deployment

1. **Run pre-deployment checklist**
   ```bash
   ./scripts/pre-deployment-checklist.sh
   ```

2. **Deploy to Vercel**
   ```bash
   ./scripts/deploy-to-vercel.sh
   ```

3. **Verify deployment**
   ```bash
   ./scripts/post-deployment-verification.sh https://your-app.vercel.app
   ```

#### Manual Deployment

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Login and deploy**
   ```bash
   vercel login
   vercel --prod
   ```

3. **Configure environment variables**
   - Go to Vercel Dashboard → Project Settings → Environment Variables
   - Add all variables from your `.env.local` file
   - See `VERCEL_DEPLOYMENT_GUIDE.md` for complete list

#### Environment Variables for Production

**Required for Vercel deployment:**
```bash
# Firebase (Client-side)
NEXT_PUBLIC_FIREBASE_API_KEY=your_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# API Keys (Server-side)
GEMINI_API_KEY=your_gemini_key
GENIUS_API_KEY=your_genius_key
MUSIC_AI_API_KEY=your_music_ai_key

# Service URLs
NEXT_PUBLIC_PYTHON_API_URL=https://chordmini-backend-full-pluj3yargq-uc.a.run.app
NEXT_PUBLIC_YOUTUBE_API_KEY=your_youtube_key
NEXT_PUBLIC_BASE_URL=https://your-vercel-domain.vercel.app
```

#### Deployment Documentation

For detailed deployment instructions, see:
- `VERCEL_DEPLOYMENT_GUIDE.md` - Complete deployment strategy
- `FIREBASE_ADMIN_ACCESS_GUIDE.md` - Firebase configuration and admin access
- `scripts/` directory - Automated deployment scripts

### Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **State Management**: React Query, Zustand
- **Database**: Firebase Firestore
- **APIs**: YouTube Data API, Music.ai, Google Gemini
- **Backend**: Python (Google Cloud Run)
- **Deployment**: Vercel (frontend), Google Cloud Run (backend)

## License

MIT License
