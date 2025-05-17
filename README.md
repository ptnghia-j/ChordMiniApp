# Chord Recognition System

A web application for recognizing and displaying chord progressions from YouTube videos, similar to Chordify.

## Project Overview

This application allows users to:
- Search for songs via YouTube integration
- Extract audio from YouTube videos
- Process the audio to identify chords and beats
- Display chord progressions synchronized with audio playback

## Tech Stack

### Frontend
- **Next.js** with TypeScript - React framework with SSR capabilities
- **Tailwind CSS** - Utility-first CSS framework
- **React Query** - Data fetching, caching, and state management
- **Zustand** - Lightweight state management
- **React Player** - YouTube video integration
- **Framer Motion** - Animation library
- **Chart.js** - Visualization for chord progressions and beats

### Backend
- **Next.js API Routes** - API gateway and basic functionality
- **Python with Flask** - Audio processing and ML model inference
  - **Librosa** - Audio feature extraction
  - **PyTorch/TensorFlow** - ML model inference
  - **FFmpeg** - Audio extraction and processing

### Database & Authentication
- **Firebase**
  - Firestore - NoSQL database
  - Firebase Authentication - User management
  - Firebase Storage - Audio file storage

### Deployment
- **Vercel** - Frontend and Next.js API routes
- **Railway/Heroku** - Python backend
- **Firebase** - Database, authentication, and storage (managed by Google)

## Key Features

- YouTube search and video playback
- Audio extraction and processing
- Chord recognition using machine learning
- Beat detection using machine learning
- Synchronized chord and beat display
- Playback controls (play, pause, seek, speed adjustment)
- Chord transposition
- Downloadable chord sheets

## Development Status

This project is currently in the planning and initial development phase. See the [tasks.md](./tasks.md) file for the current implementation status and [chord-recognition-prd.md](./chord-recognition-prd.md) for detailed requirements.

## Getting Started

### Prerequisites

- Node.js 16+ and npm
- Python 3.8+ with pip
- FFmpeg installed on your system

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ptnghia-j/ChordMiniApp.git
   cd ChordMiniApp
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   ```

4. Edit `.env.local` and add your API keys:
   - Get a Firebase project configuration from the [Firebase Console](https://console.firebase.google.com/)
   - Get a YouTube API key from the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)

5. Set up the Python backend:
   ```bash
   cd python_backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

6. Start the development servers:
   ```bash
   # In one terminal (frontend)
   npm run dev

   # In another terminal (backend)
   cd python_backend
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   python app.py
   ```

7. Open [http://localhost:3000](http://localhost:3000) in your browser

### Firebase Setup

1. Create a Firebase project at [firebase.google.com](https://firebase.google.com/)
2. Enable Firestore Database
3. Set up security rules for Firestore
4. Add a web app to your Firebase project
5. Copy the configuration to your `.env.local` file

### Security Notes

- **NEVER commit your `.env.local` file to version control**
- **NEVER hardcode API keys in your source code**
- The project includes a pre-commit hook to help prevent accidental commits of sensitive information
- If you accidentally expose API keys, immediately rotate them in the respective service dashboards
- For production, consider using more restrictive Firebase security rules

## License

*TBD*
