import type { Metadata } from 'next';
import { generateAnalyzeMetadata } from './metadata';

interface Props {
  params: Promise<{ videoId: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({ params }: { params: Promise<{ videoId: string }> }): Promise<Metadata> {
  const { videoId } = await params;

  // Validate videoId format (YouTube video IDs are 11 characters)
  if (!videoId || typeof videoId !== 'string' || videoId.length !== 11) {
    return {
      title: 'Invalid Video | ChordMini',
      description: 'The requested video ID is invalid. Please check the URL and try again.',
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  try {
    return await generateAnalyzeMetadata(videoId);
  } catch (error) {
    console.error('Failed to generate metadata for video:', videoId, error);

    // Fallback metadata
    return {
      title: `Music Analysis ${videoId} | ChordMini`,
      description: `AI-powered chord recognition and beat detection analysis. Discover chord progressions, beats, and musical structure with ChordMini's advanced music analysis tools.`,
      openGraph: {
        title: `Music Analysis ${videoId} | ChordMini`,
        description: `AI-powered chord recognition and beat detection analysis. Discover chord progressions, beats, and musical structure with ChordMini's advanced music analysis tools.`,
        url: `https://chordmini.com/analyze/${videoId}`,
        siteName: 'ChordMini',
        images: [
          {
            url: '/chordMiniLogo.png',
            width: 1200,
            height: 630,
            alt: `Music analysis for ${videoId}`,
          },
        ],
        type: 'article',
      },
      twitter: {
        card: 'summary_large_image',
        title: `Music Analysis ${videoId} | ChordMini`,
        description: `AI-powered chord recognition and beat detection analysis. Discover chord progressions, beats, and musical structure.`,
        images: ['/chordMiniLogo.png'],
      },
    };
  }
}

export default function VideoAnalysisLayout({ children }: Props) {
  return (
    <div className="video-analysis-layout">
      {children}
    </div>
  );
}
