'use client';

import React from 'react';
import Navigation from '@/components/Navigation';

const TermsPage: React.FC = () => {
  // const { theme } = useTheme();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg transition-colors duration-300">
      <Navigation />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Terms of Service
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Last updated: June 2025
          </p>
        </div>

        {/* Introduction */}
        <div className="bg-white dark:bg-content-bg rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            Introduction
          </h2>
          <div className="space-y-4 text-gray-700 dark:text-gray-300">
            <p>
              Welcome to ChordMini, a research project developed at California State University, Fullerton. 
              These Terms of Service govern your use of our AI-powered chord recognition platform.
            </p>
            <p>
              By using ChordMini, you agree to these terms. Please read them carefully.
            </p>
          </div>
        </div>

        {/* Research Purpose */}
        <div className="bg-white dark:bg-content-bg rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            Research and Academic Use
          </h2>
          <div className="space-y-4 text-gray-700 dark:text-gray-300">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="text-lg font-medium text-blue-900 dark:text-blue-100 mb-2">
                Important Notice
              </h3>
              <p>
                ChordMini is provided as a research tool for educational and academic purposes. 
                It is not intended for commercial use or production environments.
              </p>
            </div>
            <ul className="space-y-2">
              <li>• This platform is part of ongoing research at CSU Fullerton</li>
              <li>• Usage data may be collected for research purposes</li>
              <li>• Features and availability may change as research progresses</li>
              <li>• No warranty or guarantee of service availability</li>
            </ul>
          </div>
        </div>

        {/* Acceptable Use */}
        <div className="bg-white dark:bg-content-bg rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            Acceptable Use
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                You May:
              </h3>
              <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                <li>• Use ChordMini for personal music analysis and learning</li>
                <li>• Analyze publicly available YouTube videos</li>
                <li>• Upload your own audio files for analysis</li>
                <li>• Share results for educational or research purposes</li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                You May Not:
              </h3>
              <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                <li>• Use the service for commercial purposes without permission</li>
                <li>• Attempt to reverse engineer or copy our machine learning models</li>
                <li>• Upload copyrighted content without proper authorization</li>
                <li>• Overload the system with excessive requests</li>
                <li>• Use the service for any illegal or harmful activities</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Intellectual Property */}
        <div className="bg-white dark:bg-content-bg rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 p-8 mb-8">
          <h2 className="text-2xl font-semibent text-gray-900 dark:text-white mb-6">
            Intellectual Property
          </h2>
          <div className="space-y-4 text-gray-700 dark:text-gray-300">
            <ul className="space-y-3">
              <li>• ChordMini&apos;s source code and algorithms are owned by the research team</li>
              <li>• You retain ownership of any audio content you upload</li>
              <li>• Analysis results (chord progressions, beat data) are provided for your use</li>
              <li>• Third-party content (YouTube videos, lyrics) remains owned by original creators</li>
              <li>• Machine learning models are proprietary research assets</li>
            </ul>
          </div>
        </div>

        {/* Disclaimers */}
        <div className="bg-white dark:bg-content-bg rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            Disclaimers and Limitations
          </h2>
          <div className="space-y-4 text-gray-700 dark:text-gray-300">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <h3 className="text-lg font-medium text-yellow-900 dark:text-yellow-100 mb-2">
                Service Availability
              </h3>
              <p>
                ChordMini is provided &quot;as is&quot; without warranties. As a research project,
                service availability and accuracy are not guaranteed.
              </p>
            </div>
            <ul className="space-y-2">
              <li>• Analysis accuracy may vary depending on audio quality and musical complexity</li>
              <li>• Service may be temporarily unavailable for maintenance or updates</li>
              <li>• We are not liable for any damages resulting from service use</li>
              <li>• Results should be verified for critical applications</li>
            </ul>
          </div>
        </div>

        {/* Privacy and Data */}
        <div className="bg-white dark:bg-content-bg rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            Privacy and Data Use
          </h2>
          <div className="space-y-4 text-gray-700 dark:text-gray-300">
            <p>
              By using ChordMini, you acknowledge that:
            </p>
            <ul className="space-y-2">
              <li>• Your usage data may be collected for research purposes</li>
              <li>• Analysis results may be cached to improve performance</li>
              <li>• Aggregate data may be used in academic publications</li>
              <li>• Personal information is handled according to our Privacy Policy</li>
            </ul>
          </div>
        </div>

        {/* Changes to Terms */}
        <div className="bg-white dark:bg-content-bg rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            Changes to These Terms
          </h2>
          <div className="space-y-4 text-gray-700 dark:text-gray-300">
            <p>
              We may update these Terms of Service as our research progresses. 
              Significant changes will be communicated through the platform.
            </p>
            <p>
              Continued use of ChordMini after changes constitutes acceptance of the updated terms.
            </p>
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-white dark:bg-content-bg rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 p-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            Contact Information
          </h2>
          <div className="space-y-4 text-gray-700 dark:text-gray-300">
            <p>
              For questions about these Terms of Service, please contact:
            </p>
            <div className="space-y-2">
              <p><strong>Research Team:</strong> Nghia Phan, Dr. Rong Jin</p>
              <p><strong>Institution:</strong> California State University, Fullerton</p>
              <p><strong>Department:</strong> Computer Science</p>
              <p><strong>Email:</strong> [Contact information will be added]</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default TermsPage;
