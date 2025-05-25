# Chord Recognition System - Project Roadmap

## Project Overview

This document outlines the development roadmap for the Chord Recognition System, a NextJS application that integrates with YouTube API, extracts audio, processes it through chord and beat models, and displays results to users with advanced features including AI-powered assistance.

## Technology Stack

### Frontend
- **Next.js** with TypeScript - React framework with SSR capabilities
- **Tailwind CSS** - Utility-first CSS framework
- **React Query** - Data fetching and state management
- **React Player** - YouTube video integration
- **Framer Motion** - Animation for lyrics, chord transitions, and UI components

### Backend & APIs
- **Next.js API Routes** - API gateway and server-side functionality
- **YouTube Data API** - Video search and metadata
- **Music.ai API** - Lyrics transcription service
- **Gemini API** - AI-powered lyrics translation and chatbot assistance

### Database & Caching
- **Firebase Firestore** - Remote caching for beat/chord transcriptions, audio files, and lyrics translations
- **In-memory state management** - For real-time features like chatbot conversations

### Machine Learning Models
- **Chord-CNN-LSTM** - Advanced chord recognition (301 chord labels)
- **Beat-transformer** - Beat detection with time signature recognition
- **Madmom** - Alternative beat detection library

## Core Features

### 1. YouTube Integration
- Video search and metadata retrieval
- Audio extraction from YouTube videos
- Privacy-enhanced video embedding
- Responsive video player with playback controls

### 2. Music Analysis Engine
- **Beat Detection**: Multiple models (Beat-transformer, Madmom) with time signature detection
- **Chord Recognition**: CNN-LSTM model with 301 chord labels and simplified notation
- **Synchronization**: Precise alignment of chords with beats and timing
- **Caching**: Firebase-based caching for processed analysis results

### 3. Lyrics Processing
- **Transcription**: Music.ai API integration for lyrics extraction
- **Translation**: Gemini API-powered multi-language translation with caching
- **Synchronization**: Time-aligned lyrics display with chord positioning
- **Karaoke Mode**: Letter-by-letter color transitions during playback

### 4. AI Chatbot Assistant ⭐ **NEW FEATURE**
- **Contextual Understanding**: AI assistant with complete access to song analysis data
- **Conversation Memory**: Maintains context across multiple user queries
- **Music Expertise**: Specialized in chord progressions, beat patterns, and music theory
- **Restricted Access**: Available only on "Beat & Chord Map" and "Lyrics & Chords" pages
- **Real-time Integration**: Seamless integration with existing analysis workflow

### 5. Metronome Feature ⭐ **NEW FEATURE**
- **Synchronized Clicks**: Audible click sounds precisely aligned with detected beats
- **Distinct Sounds**: Higher pitch for downbeats, lower pitch for regular beats
- **Web Audio API**: Low-latency audio generation for precise timing
- **User Controls**: Toggle on/off, volume adjustment, and test buttons
- **Beat Shift Integration**: Accounts for chord-beat alignment optimization
- **Visual Feedback**: Clear status indicators and expandable settings panel

### 6. User Interface
- **Clean Design**: 2/3-1/3 layout with blue accent colors (#1e40af)
- **Tabbed Interface**: "Beat & Chord Map" and "Lyrics & Chords" views
- **Dark Mode**: Complete theme support with appropriate asset switching
- **Responsive Design**: Mobile-friendly with adaptive layouts
- **Accessibility**: Keyboard navigation and screen reader support

## Development Phases

### Phase 1: Infrastructure & Core Analysis ✅ **COMPLETED**
- [x] Next.js project setup with TypeScript
- [x] Firebase integration for caching
- [x] YouTube API integration
- [x] Audio extraction pipeline
- [x] Beat detection implementation
- [x] Chord recognition implementation

### Phase 2: User Interface & Experience ✅ **COMPLETED**
- [x] Responsive layout design
- [x] Tabbed interface implementation
- [x] Dark mode support
- [x] Animation and transitions
- [x] Playback controls and synchronization

### Phase 3: Lyrics & Translation ✅ **COMPLETED**
- [x] Music.ai API integration for lyrics transcription
- [x] Gemini API integration for translation
- [x] Multi-language support with caching
- [x] Synchronized lyrics display
- [x] Karaoke-style playback

### Phase 4: AI Chatbot Integration ✅ **COMPLETED**
- [x] Gemini API chatbot endpoint
- [x] Song context data compilation
- [x] Conversation memory management
- [x] UI components (ChatbotButton, ChatbotInterface)
- [x] Integration with analyze pages
- [x] Error handling and loading states

### Phase 5: Metronome Feature ✅ **COMPLETED**
- [x] Web Audio API metronome service implementation
- [x] Synchronized click generation with beat detection
- [x] Distinct sounds for downbeats vs regular beats
- [x] MetronomeControls component with toggle and volume
- [x] useMetronomeSync hook for precise timing
- [x] Integration with beat shift compensation
- [x] Visual feedback and expandable settings

### Phase 6: Performance & Optimization 🔄 **IN PROGRESS**
- [ ] Caching optimization
- [ ] Performance monitoring
- [ ] Bundle size optimization
- [ ] SEO improvements
- [ ] Error tracking and analytics

### Phase 6: Advanced Features 📋 **PLANNED**
- [ ] User accounts and preferences
- [ ] Song favorites and history
- [ ] Export functionality (PDF chord sheets)
- [ ] Advanced chord analysis tools
- [ ] Collaborative features

## AI Chatbot Feature Details

### Technical Implementation
- **API Endpoint**: `/api/chatbot` using Gemini 2.5 Flash model
- **Context Management**: Comprehensive song data compilation including:
  - Beat detection results (BPM, time signatures, beat positions)
  - Chord progression data (labels, timing, confidence scores)
  - Lyrics transcription with timing information
  - Translation data (if available)
  - Song metadata (title, duration, etc.)

### User Experience
- **Floating Action Button**: Fixed position with smooth animations
- **Chat Interface**: Modal-style overlay with conversation history
- **Contextual Responses**: AI understands complete song analysis context
- **Error Handling**: Graceful degradation with user-friendly messages

### Capabilities
- Explain chord progressions and harmonic relationships
- Analyze beat patterns and time signatures
- Discuss lyrics meaning and structure
- Provide music theory education
- Suggest practice techniques and playing tips
- Compare with similar songs and styles

## Performance Requirements

### Response Times
- YouTube search: < 2 seconds
- Audio extraction: < 10 seconds
- Beat/chord analysis: < 15 seconds
- Lyrics transcription: < 20 seconds
- AI chatbot responses: < 5 seconds

### Accuracy Targets
- Chord recognition: > 85%
- Beat detection: > 90%
- Lyrics transcription: > 80%
- Translation quality: High (Gemini API)

### Scalability
- Firebase caching for reduced processing
- Efficient API usage with rate limiting
- Optimized bundle sizes and lazy loading
- CDN integration for static assets

## Security & Privacy

### API Security
- Environment variable protection for all API keys
- Rate limiting on all endpoints
- Input validation and sanitization
- HTTPS enforcement

### User Privacy
- No personal data collection without consent
- Privacy-enhanced YouTube embedding
- Secure conversation handling (in-memory only)
- GDPR compliance considerations

## Future Enhancements

### Short-term (Next 3 months)
- Performance optimizations
- Additional language support
- Enhanced error handling
- Mobile app considerations

### Medium-term (3-6 months)
- User account system
- Advanced analysis features
- Collaborative tools
- API rate optimization

### Long-term (6+ months)
- Machine learning model improvements
- Real-time collaboration
- Advanced export features
- Integration with music platforms

## Contributing

### Development Setup
1. Clone repository
2. Install dependencies: `npm install`
3. Configure environment variables (see `.env.example`)
4. Start development server: `npm run dev`

### Code Standards
- TypeScript for type safety
- ESLint and Prettier for code formatting
- Component-based architecture
- Comprehensive error handling
- Performance-first development

### Testing Strategy
- Unit tests for core functions
- Integration tests for API endpoints
- E2E tests for critical user flows
- Performance testing for analysis pipeline

---

**Last Updated**: December 2024
**Version**: 2.0.0 (AI Chatbot Release)
**Status**: Active Development
