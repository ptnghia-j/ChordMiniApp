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

*Coming soon*

## License

*TBD*
