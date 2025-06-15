import type { Metadata } from 'next';
import { Roboto_Mono } from 'next/font/google';
import './globals.css';
import { ProcessingProvider } from '../contexts/ProcessingContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import ClientErrorBoundary from '../components/ClientErrorBoundary';
import FirebaseInitializer from '../components/FirebaseInitializer';
import Footer from '../components/Footer';

// Initialize only the monospace font for chord labels
const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-roboto-mono'
});

// Define metadata for the application
export const metadata: Metadata = {
  title: {
    default: 'ChordMini - AI-Powered Music Analysis & Chord Recognition',
    template: '%s | ChordMini'
  },
  description: 'Advanced music analysis platform with AI-powered chord recognition, beat detection, and synchronized lyrics. Analyze YouTube videos and audio files to discover chord progressions, beats, and musical structure.',
  keywords: [
    'chord recognition',
    'music analysis',
    'beat detection',
    'chord progression',
    'music theory',
    'audio analysis',
    'YouTube music',
    'chord charts',
    'music AI',
    'song analysis',
    'chord detection',
    'music transcription'
  ],
  authors: [
    {
      name: 'Nghia Phan',
      url: 'https://github.com/ptnghia-j'
    }
  ],
  creator: 'Nghia Phan',
  publisher: 'California State University, Fullerton',
  category: 'Music Technology',
  classification: 'Music Analysis Software',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://chordmini.com',
    siteName: 'ChordMini',
    title: 'ChordMini - AI-Powered Music Analysis & Chord Recognition',
    description: 'Advanced music analysis platform with AI-powered chord recognition, beat detection, and synchronized lyrics.',
    images: [
      {
        url: '/chordMiniLogo.png',
        width: 1200,
        height: 630,
        alt: 'ChordMini - Music Analysis Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ChordMini - AI-Powered Music Analysis & Chord Recognition',
    description: 'Advanced music analysis platform with AI-powered chord recognition, beat detection, and synchronized lyrics.',
    images: ['/chordMiniLogo.png'],
  },
  verification: {
    google: 'google-site-verification-code', // To be replaced with actual verification code
  },
  alternates: {
    canonical: 'https://chordmini.com',
  },
};

// Root layout component that wraps all pages
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={robotoMono.variable}>
      <body className="font-sans min-h-screen flex flex-col">
        <ProcessingProvider>
          <ThemeProvider>
            <ClientErrorBoundary>
              <FirebaseInitializer />
              <main className="flex-1">
                {children}
              </main>
              <Footer />
            </ClientErrorBoundary>
          </ThemeProvider>
        </ProcessingProvider>
      </body>
    </html>
  );
}
