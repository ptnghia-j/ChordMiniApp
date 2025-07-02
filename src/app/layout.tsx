import type { Metadata } from 'next';
import './globals.css';
import { ProcessingProvider } from '../contexts/ProcessingContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import ClientErrorBoundary from '../components/ClientErrorBoundary';
import FirebaseInitializer from '../components/FirebaseInitializer';
import ServiceWorkerRegistration from '../components/ServiceWorkerRegistration';
import Footer from '../components/Footer';
import PerformanceMonitor from '../components/PerformanceMonitor';
import CriticalPerformanceOptimizer from '../components/CriticalPerformanceOptimizer';
import DesktopPerformanceOptimizer from '../components/DesktopPerformanceOptimizer';



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
    <html lang="en">
      <head>
        {/* Critical CSS inlined for performance - eliminates render blocking */}
        <style dangerouslySetInnerHTML={{
          __html: `
            /* Critical above-the-fold styles */
            html { font-family: ui-sans-serif, system-ui, sans-serif; }
            body { margin: 0; padding: 0; background: #f8fafc; }
            .dark body { background: #111720; }
            .hero-container { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; }
            .critical-layout { contain: layout style paint; will-change: auto; transform: translateZ(0); }
            /* Prevent layout shifts */
            img[data-lcp-image] { width: 100%; height: auto; object-fit: cover; }
            /* Font display optimization */
            @font-face { font-display: swap; }
          `
        }} />

        {/* LCP Image preloading for faster discovery */}
        <link rel="preload" href="/hero-image-placeholder.svg" as="image" fetchPriority="high" />
        <link rel="preload" href="/hero-image-placeholder-dark.svg" as="image" fetchPriority="high" />

        {/* Critical CSS preloading for performance */}
        <link rel="preload" href="/_next/static/css/app/layout.css" as="style" />
        <link rel="preload" href="/_next/static/css/app/globals.css" as="style" />

        {/* Resource hints for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://i.ytimg.com" />
        <link rel="preconnect" href="https://img.youtube.com" />
        <link rel="preconnect" href="https://firebasestorage.googleapis.com" />

        {/* DNS prefetch for external services */}
        <link rel="dns-prefetch" href="//youtube.com" />
        <link rel="dns-prefetch" href="//googleapis.com" />
        <link rel="dns-prefetch" href="//vercel.app" />

        {/* Optimize font loading */}
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preload" href="https://fonts.gstatic.com/s/robotomono/v23/L0xuDF4xlVMF-BfR8bXMIhJHg45mwgGEFl0_3vq_ROW4AJi8SJQt.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="font-sans min-h-screen flex flex-col">
        <ProcessingProvider>
          <ThemeProvider>
            <ClientErrorBoundary>
              <CriticalPerformanceOptimizer />
              <DesktopPerformanceOptimizer />
              <ServiceWorkerRegistration />
              <FirebaseInitializer />
              <PerformanceMonitor />
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
