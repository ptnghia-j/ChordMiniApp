'use client';

import React from 'react';
import Navigation from '@/components/Navigation';

const AboutPage: React.FC = () => {
  // const { theme } = useTheme();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg transition-colors duration-300">
      <Navigation />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            About ChordMini
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            AI-powered chord recognition and music analysis platform for musicians, researchers, and music enthusiasts.
          </p>
        </div>

        {/* Research Project Section */}
        <div className="bg-white dark:bg-content-bg rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            Research Project
          </h2>
          <div className="space-y-4 text-gray-700 dark:text-gray-300">
            <p>
              ChordMini is developed as part of a master&apos;s research project at <strong>California State University, Fullerton</strong>,
              focusing on advanced machine learning techniques for automatic chord recognition and music analysis.
            </p>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
              <h3 className="text-lg font-medium text-blue-900 dark:text-blue-100 mb-3">
                Research Team
              </h3>
              <div className="space-y-2">
                <p><strong>Student Researcher:</strong> Nghia Phan</p>
                <p><strong>Faculty Advisor:</strong> Dr. Rong Jin</p>
                <p><strong>Institution:</strong> California State University, Fullerton</p>
                <p><strong>Department:</strong> Computer Science</p>
              </div>
            </div>
          </div>
        </div>

        {/* Technology Section */}
        <div className="bg-white dark:bg-content-bg rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            Technology & Features
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                Machine Learning Models
              </h3>
              <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                <li>• Beat-Transformer for beat detection</li>
                <li>• Chord-CNN-LSTM for chord recognition</li>
                <li>• BTC models for enhanced accuracy</li>
                <li>• Real-time audio processing</li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                Platform Features
              </h3>
              <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                <li>• YouTube integration</li>
                <li>• Synchronized lyrics display</li>
                <li>• Lead sheet generation</li>
                <li>• Multi-language support</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Citation Section */}
        <div className="bg-white dark:bg-content-bg rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            Academic Citation
          </h2>
          <div className="space-y-4">
            <p className="text-gray-700 dark:text-gray-300">
              If you use ChordMini in your research or academic work, please cite our publication:
            </p>
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <p className="text-sm font-mono text-gray-800 dark:text-gray-200">
                [Citation will be added upon publication]
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Research paper currently in preparation
              </p>
            </div>
          </div>
        </div>

        {/* Contact Section */}
        <div className="bg-white dark:bg-content-bg rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 p-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            Contact & Collaboration
          </h2>
          <div className="space-y-4 text-gray-700 dark:text-gray-300">
            <p>
              For research inquiries, collaboration opportunities, or technical questions, please contact:
            </p>
            <div className="space-y-2">
              <p><strong>Email:</strong> [Contact information will be added]</p>
              <p><strong>GitHub:</strong> <a href="https://github.com/ptnghia-j/ChordMiniApp" className="text-blue-600 dark:text-blue-400 hover:underline">ChordMiniApp Repository</a></p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AboutPage;
