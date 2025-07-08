import type { Metadata } from 'next';

interface VideoInfo {
  title?: string;
  description?: string;
  channelTitle?: string;
  duration?: string;
  thumbnailUrl?: string;
}

interface AnalysisResults {
  chords?: Array<{ chord: string; time: number }>;
  beats?: number[];
  bpm?: number;
  keySignature?: string;
  chordModel?: string;
  beatModel?: string;
}

/**
 * Fetch video information from YouTube API
 */
async function fetchVideoInfo(videoId: string): Promise<VideoInfo | null> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5001'}/api/youtube/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ videoId }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return {
      title: data.title,
      description: data.description,
      channelTitle: data.channelTitle,
      duration: data.duration,
      thumbnailUrl: data.thumbnailUrl,
    };
  } catch (error) {
    console.error('Failed to fetch video info for metadata:', error);
    return null;
  }
}

/**
 * Check if analysis results exist for this video
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function checkAnalysisResults(_videoId: string): Promise<AnalysisResults | null> {
  try {
    // This would typically check your cache/database for existing analysis
    // For now, we'll return null and generate metadata based on video info only
    return null;
  } catch (error) {
    console.error('Failed to check analysis results:', error);
    return null;
  }
}



/**
 * Generate dynamic metadata for analyze pages
 */
export async function generateAnalyzeMetadata(videoId: string): Promise<Metadata> {
  const videoInfo = await fetchVideoInfo(videoId);
  const analysisResults = await checkAnalysisResults(videoId);
  
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://chordmini.com';
  const pageUrl = `${baseUrl}/analyze/${videoId}`;
  
  // Generate title and description
  const title = videoInfo?.title 
    ? `${videoInfo.title} - Chord Analysis | ChordMini`
    : `Music Analysis ${videoId} | ChordMini`;
    
  const description = videoInfo?.title
    ? `AI-powered chord recognition and beat detection analysis of "${videoInfo.title}". Discover chord progressions, beats, and musical structure with ChordMini's advanced music analysis tools.`
    : `AI-powered music analysis for video ${videoId}. Discover chord progressions, beats, and musical structure with ChordMini's advanced analysis tools.`;

  // Generate keywords
  const keywords = [
    'chord analysis',
    'music analysis',
    'beat detection',
    'chord recognition',
    videoInfo?.title && `${videoInfo.title} chords`,
    videoInfo?.channelTitle && `${videoInfo.channelTitle} music analysis`,
    analysisResults?.keySignature && `${analysisResults.keySignature} key`,
    analysisResults?.bpm && `${analysisResults.bpm} BPM`,
  ].filter(Boolean) as string[];

  // Generate Open Graph image URL with dynamic parameters
  const ogImageParams = new URLSearchParams();
  if (videoInfo?.title) ogImageParams.set('title', videoInfo.title);
  if (videoId) ogImageParams.set('videoId', videoId);
  if (videoInfo?.channelTitle) ogImageParams.set('artist', videoInfo.channelTitle);
  if (analysisResults?.keySignature) ogImageParams.set('key', analysisResults.keySignature);
  if (analysisResults?.bpm) ogImageParams.set('bpm', analysisResults.bpm.toString());

  const ogImageUrl = `${baseUrl}/api/og-image?${ogImageParams.toString()}`;

  const metadata: Metadata = {
    title,
    description,
    keywords,
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: 'ChordMini',
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `Chord analysis of ${videoInfo?.title || videoId}`,
        },
      ],
      type: 'article',
      publishedTime: new Date().toISOString(),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
    alternates: {
      canonical: pageUrl,
    },
    other: {
      'music:duration': videoInfo?.duration || '',
      'music:musician': videoInfo?.channelTitle || '',
      'music:song': videoInfo?.title || '',
    },
  };

  return metadata;
}
