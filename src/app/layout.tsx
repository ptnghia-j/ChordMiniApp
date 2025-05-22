import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ProcessingProvider } from '../contexts/ProcessingContext';
import ClientErrorBoundary from '../components/ClientErrorBoundary';

// Initialize the Inter font
const inter = Inter({ subsets: ['latin'] });

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
    <html lang="en">
      <body className={inter.className}>
        <ProcessingProvider>
          {children}
        </ProcessingProvider>
      </body>
    </html>
  );
}
