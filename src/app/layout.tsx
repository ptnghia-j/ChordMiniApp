import type { Metadata } from 'next';
import { Roboto_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import ClientErrorBoundary from '../components/ClientErrorBoundary';
import FirebaseInitializer from '../components/FirebaseInitializer';
import ServiceWorkerRegistration from '../components/ServiceWorkerRegistration';
import Footer from '../components/Footer';
import PerformanceMonitor from '../components/PerformanceMonitor';
import CriticalPerformanceOptimizer from '../components/CriticalPerformanceOptimizer';
import DesktopPerformanceOptimizer from '../components/DesktopPerformanceOptimizer';
import CriticalCSS from '../components/CriticalCSS';
import CorsErrorSuppression from '../components/CorsErrorSuppression';
import DevIndicatorHider from '../components/DevIndicatorHider';

// Configure Google Fonts
const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  variable: '--font-roboto-mono',
  display: 'swap',
});



// Define metadata for the application
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_PYTHON_API_URL === 'https://chordmini-backend-full-191567167632.us-central1.run.app' ? 'https://chordmini.me' : 'http://localhost:3000'),
  title: {
    default: 'ChordMini - Chord Recognition and Beat Tracking with LLM',
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
  classification: 'Open Source Software',
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
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' },
      { url: '/chordMiniLogo.webp', sizes: '192x192', type: 'image/webp' },
      { url: '/chordMiniLogo.webp', sizes: '512x512', type: 'image/webp' }
    ],
    shortcut: '/favicon.ico',
    apple: [
      { url: '/chordMiniLogo.webp', sizes: '180x180', type: 'image/webp' }
    ],
    other: [
      {
        rel: 'icon',
        type: 'image/webp',
        sizes: '32x32',
        url: '/chordMiniLogo.webp',
      },
      {
        rel: 'icon',
        type: 'image/webp',
        sizes: '16x16',
        url: '/chordMiniLogo.webp',
      }
    ]
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://chordmini.me',
    siteName: 'ChordMini',
    title: 'ChordMini - Chord Recognition and Beat Tracking with LLM',
    description: 'Advanced music analysis platform with AI-powered chord recognition, beat detection, and synchronized lyrics.',
    images: [
      {
        url: '/chordMiniLogo.webp',
        width: 1200,
        height: 630,
        alt: 'ChordMini - Music Analysis Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ChordMini - Chord Recognition and Beat Tracking with LLM',
    description: 'Advanced music analysis platform with AI-powered chord recognition, beat detection, and synchronized lyrics.',
    images: ['/chordMiniLogo.webp'],
  },
  verification: {
    google: 'google-site-verification-code', // To be replaced with actual verification code
  },
  alternates: {
    canonical: 'https://chordmini.me',
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
      <head>
        {/* Critical CSS inlined for performance - eliminates render blocking */}
        <style dangerouslySetInnerHTML={{
          __html: `
            /* Critical above-the-fold styles */
            html { font-family: ui-sans-serif, system-ui, sans-serif; }
            body { margin: 0; padding: 0; background: #f8fafc; }
            .dark body { background: #1e252e; }
            .hero-container { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; }
            .critical-layout { contain: layout style paint; will-change: auto; transform: translateZ(0); }
            /* Prevent layout shifts */
            img[data-lcp-image] { width: 100%; height: auto; object-fit: cover; }
            /* Font display optimization */
            @font-face { font-display: swap; }
            /* Navigation critical styles */
            nav { position: sticky; top: 0; z-index: 50; background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(10px); }
            .dark nav { background: rgba(30, 37, 46, 0.95); }
            /* Hero section optimization */
            .hero-section { min-height: calc(100vh - 80px); display: flex; align-items: start; justify-content: center; }
            /* Button base styles */
            button { cursor: pointer; transition: all 0.2s ease; }
            /* Image optimization */
            img { max-width: 100%; height: auto; }
          `
        }} />

        <meta name="description" content="Recognize chords from audio using AI" />

        {/* Favicon configuration for better browser compatibility */}
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" href="/chordMiniLogo.webp" type="image/webp" sizes="32x32" />
        <link rel="icon" href="/chordMiniLogo.webp" type="image/webp" sizes="16x16" />
        <link rel="apple-touch-icon" href="/chordMiniLogo.webp" sizes="180x180" />
        <link rel="manifest" href="/site.webmanifest" />

        {/* Preload critical resources to reduce request chains */}
        <link rel="preload" href="/demo1.webp" as="image" type="image/webp" />
        <link rel="preload" href="/demo1_dark.webp" as="image" type="image/webp" />
        <link rel="preload" href="/chordMiniLogo.webp" as="image" type="image/webp" />
        <link rel="preload" href="/chordMiniLogo-dark.webp" as="image" type="image/webp" />

        {/* Resource hints for performance */}
        <link rel="preconnect" href="https://i.ytimg.com" />
        <link rel="preconnect" href="https://img.youtube.com" />
        <link rel="preconnect" href="https://firebasestorage.googleapis.com" />

        {/* DNS prefetch for external services */}
        <link rel="dns-prefetch" href="//youtube.com" />
        <link rel="dns-prefetch" href="//googleapis.com" />
        <link rel="dns-prefetch" href="//vercel.app" />

        {/* Critical CSS for above-the-fold content */}
        <CriticalCSS />
      </head>
      <body className="font-sans min-h-screen flex flex-col">
        <Providers>
          <ClientErrorBoundary>
            <CriticalPerformanceOptimizer />
            <DesktopPerformanceOptimizer />
            <ServiceWorkerRegistration />
            <FirebaseInitializer />
            <PerformanceMonitor />
            <CorsErrorSuppression />
            {process.env.NODE_ENV === 'development' ? <DevIndicatorHider /> : null}
            <main className="flex-1">
              {children}
            </main>
            <Footer />
          </ClientErrorBoundary>
        </Providers>
      </body>
    </html>
  );
}
