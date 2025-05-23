import type { Metadata } from 'next';
import { Roboto_Mono } from 'next/font/google';
import './globals.css';
import { ProcessingProvider } from '../contexts/ProcessingContext';
import ClientErrorBoundary from '../components/ClientErrorBoundary';
import FirebaseInitializer from '../components/FirebaseInitializer';

// Initialize only the monospace font for chord labels
const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-roboto-mono'
});

// Define metadata for the application
export const metadata: Metadata = {
  title: 'Chord Recognition App',
  description: 'Analyze music to detect chords and beats in audio files or YouTube videos',
};

// Root layout component that wraps all pages
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={robotoMono.variable}>
      <body className="font-sans">
        <ProcessingProvider>
          <FirebaseInitializer />
          {children}
        </ProcessingProvider>
      </body>
    </html>
  );
}
