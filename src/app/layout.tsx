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
      <body className="font-sans min-h-screen flex flex-col">
        <ProcessingProvider>
          <ThemeProvider>
            <FirebaseInitializer />
            <main className="flex-1">
              {children}
            </main>
            <Footer />
          </ThemeProvider>
        </ProcessingProvider>
      </body>
    </html>
  );
}
