'use client';

import React, { useState } from 'react';
import Navigation from '@/components/common/Navigation';

const HelpPage: React.FC = () => {
  // const { theme } = useTheme();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const faqs = [
    {
      question: "How do I analyze a song?",
      answer: "Simply paste a YouTube URL into the search box on the home page, or use the 'Analyze Audio' page to upload an audio file directly. ChordMini will automatically detect beats, chords, and synchronize lyrics."
    },
    {
      question: "What audio formats are supported?",
      answer: "ChordMini supports common audio formats including MP3, WAV, M4A, and FLAC. For YouTube videos, audio is automatically extracted from the video."
    },
    {
      question: "How accurate is the chord recognition?",
      answer: "ChordMini uses state-of-the-art machine learning models including Chord-CNN-LSTM and BTC models, achieving high accuracy on most popular music genres. Accuracy may vary depending on audio quality and musical complexity."
    },
    {
      question: "Can I export the results?",
      answer: "Currently, you can view and interact with the chord progressions and lyrics in real-time. Export functionality for lead sheets and chord charts is planned for future releases."
    },
    {
      question: "Is my data stored or shared?",
      answer: "ChordMini processes audio locally and uses Firebase for caching analysis results to improve performance. No personal data is shared with third parties. See our Privacy Policy for details."
    },
    {
      question: "Why is processing taking a long time?",
      answer: "Complex audio analysis requires significant computational resources. Processing time depends on song length, audio quality, and current server load. Typical processing takes 1-3 minutes."
    }
  ];

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg transition-colors duration-300">
      <Navigation />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Help & Support
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Get help using ChordMini and find answers to common questions.
          </p>
        </div>

        {/* Quick Start Guide */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            Quick Start Guide
          </h2>
          <div className="space-y-6">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                1
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Enter a YouTube URL
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Paste any YouTube music video URL into the search box on the home page.
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                2
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Wait for Analysis
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  ChordMini will extract audio, detect beats and chords, and fetch synchronized lyrics.
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                3
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Explore Results
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  View chord progressions, synchronized lyrics, and interact with the beat timeline.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div key={index} className="border border-gray-200 dark:border-gray-600 rounded-lg">
                <button
                  onClick={() => toggleFaq(index)}
                  className="w-full px-6 py-4 text-left flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-200"
                >
                  <span className="font-medium text-gray-900 dark:text-white">
                    {faq.question}
                  </span>
                  <svg
                    className={`w-5 h-5 text-gray-500 transform transition-transform duration-200 ${
                      openFaq === index ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openFaq === index && (
                  <div className="px-6 pb-4">
                    <p className="text-gray-600 dark:text-gray-300">
                      {faq.answer}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Contact Support */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            Need More Help?
          </h2>
          <div className="space-y-4 text-gray-700 dark:text-gray-300">
            <p>
              If you can&apos;t find the answer to your question, please reach out to our support team:
            </p>
            <div className="space-y-2">
              <p><strong>Email Support:</strong> <a href="mailto:phantrongnghia510@gmail.com" className="text-blue-600 dark:text-blue-400 hover:underline">phantrongnghia510@gmail.com</a></p>
              <p><strong>GitHub Issues:</strong> <a href="https://github.com/ptnghia-j/ChordMiniApp/issues" className="text-blue-600 dark:text-blue-400 hover:underline">Report bugs or request features</a></p>
              <p><strong>Response Time:</strong> We typically respond within 24-48 hours</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default HelpPage;
