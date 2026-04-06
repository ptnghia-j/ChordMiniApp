'use client';

import React from 'react';
import Navigation from '@/components/common/Navigation';

const AboutPage: React.FC = () => {
  // Original author names are intentionally commented out for anonymous review.
  // Original preprint link is intentionally commented out for anonymous review.
  // const originalBibtexAuthorLine = '      author={Nghia Phan and Rong Jin and Gang Liu and Xiao Dong},';
  // const originalBibtexUrlLine = '      url={https://arxiv.org/abs/2602.19778},';

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
        <div className="mb-10">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            Research Project
          </h2>
          <div className="space-y-4 text-gray-700 dark:text-white">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              Enhancing Automatic Chord Recognition via Pseudo-Labeling and Knowledge Distillation
            </h3>
            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              Automatic Chord Recognition (ACR) is constrained by the scarcity of aligned chord labels, as well-aligned annotations are costly to acquire. At the same time, open-weight pre-trained models are currently more accessible than their proprietary training data. In this work, we present a two-stage training pipeline that leverages pre-trained models together with unlabeled audio. The proposed method decouples training into two stages. In the first stage, we use a pre-trained BTC model as a teacher to generate pseudo-labels for over 1,000 hours of diverse unlabeled audio and train a student model solely on these pseudo-labels. In the second stage, the student is continually trained on ground-truth labels as they become available, with selective knowledge distillation (KD) from the teacher applied as a regularizer to prevent catastrophic forgetting of the representations learned in the first stage. In our experiments, two models (BTC, 2E1D) were used as students. In stage 1, using only pseudo-labels, the BTC student achieves over 98% of the teacher&apos;s performance, while the 2E1D model achieves about 96% across seven standard mir_eval metrics. After a single training run for both students in stage 2, the resulting BTC student model surpasses the traditional supervised learning baseline by 2.5% and the original pre-trained teacher model by 1.55% on average across all metrics. The resulting 2E1D student model improves from the traditional supervised learning baseline by 3.79% on average and achieves almost the same performance as the teacher. Both cases show large gains on rare chord qualities.
            </p>
            {/* <p className="text-sm">
              <a href="https://arxiv.org/abs/2602.19778" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                arXiv:2602.19778 [cs.SD]
              </a>
            </p> */}
            {/* <p className="text-gray-500 dark:text-gray-400 italic text-sm">
              Nghia Phan, Rong Jin, Gang Liu, Xiao Dong
            </p> */}

            {/* Academic Citation hidden for anonymous review. */}
          </div>
        </div>

        {/* Application Project Section */}
        <div className="mb-10">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            Application Project
          </h2>

          {/* Tech Stack */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Tech Stack</h3>
            <div className="bg-white dark:bg-[#1E252E] border border-gray-200 dark:border-gray-700/60 rounded-lg p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Frontend</h4>
                  <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                    <li>• Next.js 15 (React Framework)</li>
                    <li>• TypeScript</li>
                    <li>• Tailwind CSS</li>
                    <li>• Framer Motion</li>
                    <li>• Chart.js & D3.js</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Backend & ML</h4>
                  <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                    <li>• Python Flask (Google Cloud Run)</li>
                    <li>• Firebase Firestore</li>
                    <li>• Firebase Cloud Storage</li>
                    <li>• Custom ML Models</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="mb-2">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Features</h3>
            <div className="bg-white dark:bg-[#1E252E] border border-gray-200 dark:border-gray-700/60 rounded-lg p-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Machine Learning Models</h4>
                  <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                    <li>• Beat-Transformer for beat detection</li>
                    <li>• Chord-CNN-LSTM for chord recognition</li>
                    <li>• BTC models for enhanced accuracy</li>
                    <li>• Real-time audio processing</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Platform</h4>
                  <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                    <li>• YouTube integration</li>
                    <li>• Synchronized lyrics display</li>
                    <li>• Lead sheet generation</li>
                    <li>• Multi-language support</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Credits & Acknowledgments Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            Credits & Acknowledgments
          </h2>
          <div className="space-y-6 text-gray-700 dark:text-white">
            <p>
              ChordMini is built upon the excellent work of many open-source projects and services.
              We gratefully acknowledge the following third-party libraries and services:
            </p>

            {/* Third-party Libraries */}
            <div className="bg-white dark:bg-[#1E252E] border border-gray-200 dark:border-gray-700/60 rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Third-Party Libraries & Services
              </h3>
              <div className="space-y-4">

                {/* Guitar Chord Diagrams */}
                <div className="border-l-4 border-blue-500 pl-4">
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    <a href="https://github.com/tombatossals/react-chords"
                       className="text-blue-600 dark:text-blue-400 hover:underline"
                       target="_blank" rel="noopener noreferrer">
                      @tombatossals/react-chords
                    </a>
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Guitar chord diagram visualization component used in the Guitar Chords tab for displaying interactive chord fingering patterns.
                  </p>
                </div>

                {/* LRClib */}
                <div className="border-l-4 border-green-500 pl-4">
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    <a href="https://lrclib.net/"
                       className="text-blue-600 dark:text-blue-400 hover:underline"
                       target="_blank" rel="noopener noreferrer">
                      LRClib
                    </a>
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Lyrics synchronization service providing time-synced lyrics data for the Lyrics & Chords feature.
                  </p>
                </div>

                {/* YouTube Search API */}
                <div className="border-l-4 border-red-500 pl-4">
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    <a href="https://github.com/h4r5h1t/youtube-search-api"
                       className="text-blue-600 dark:text-blue-400 hover:underline"
                       target="_blank" rel="noopener noreferrer">
                      youtube-search-api
                    </a>
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    YouTube search functionality for finding and analyzing music videos directly from the platform.
                  </p>
                </div>

                {/* yt-dlp */}
                <div className="border-l-4 border-purple-500 pl-4">
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    <a href="https://github.com/yt-dlp/yt-dlp"
                       className="text-blue-600 dark:text-blue-400 hover:underline"
                       target="_blank" rel="noopener noreferrer">
                      yt-dlp
                    </a>
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    YouTube audio extraction tool used for downloading and processing audio content for chord analysis.
                  </p>
                </div>

                {/* Genius API */}
                <div className="border-l-4 border-yellow-500 pl-4">
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    <a href="https://docs.genius.com/"
                       className="text-blue-600 dark:text-blue-400 hover:underline"
                       target="_blank" rel="noopener noreferrer">
                      Genius API
                    </a>
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Lyrics and song metadata service providing comprehensive song information and lyrics data.
                  </p>
                </div>

                {/* Music.AI */}
                <div className="border-l-4 border-indigo-500 pl-4">
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    <a href="https://music.ai/"
                       className="text-blue-600 dark:text-blue-400 hover:underline"
                       target="_blank" rel="noopener noreferrer">
                      Music.AI
                    </a>
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    AI-powered music transcription service for word-level lyrics synchronization and audio analysis.
                  </p>
                </div>

                {/* Google Gemini API */}
                <div className="border-l-4 border-orange-500 pl-4">
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    <a href="https://ai.google.dev/"
                       className="text-blue-600 dark:text-blue-400 hover:underline"
                       target="_blank" rel="noopener noreferrer">
                      Google Gemini API
                    </a>
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    AI language model used for lyrics translation, enharmonic chord corrections, and intelligent music analysis.
                  </p>
                </div>

              </div>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 italic">
              We extend our sincere gratitude to all the developers and maintainers of these projects
              for making their work available to the open-source community.
            </p>
          </div>
        </div>

        {/* Contact Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
            Contact & Collaboration
          </h2>
          <div className="space-y-4 text-gray-700 dark:text-white">
            <p>
              For research inquiries, collaboration opportunities, or technical questions, please contact:
            </p>
            <div className="space-y-2">
              <p><strong>Email:</strong> <a href="mailto:phantrongnghia510@gmail.com" className="text-blue-600 dark:text-blue-400 hover:underline">phantrongnghia510@gmail.com</a></p>
              <p><strong>GitHub:</strong> <a href="https://github.com/ptnghia-j/ChordMiniApp" className="text-blue-600 dark:text-blue-400 hover:underline">ChordMiniApp Repository</a></p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AboutPage;
