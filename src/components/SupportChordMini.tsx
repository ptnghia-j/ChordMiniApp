'use client';

import dynamic from 'next/dynamic';
import React, { useState } from 'react';
import { Card, CardBody, CardHeader, Button, Chip } from '@heroui/react';
import { FaGithub, FaCoffee, FaStar } from 'react-icons/fa';
import { HiSparkles, HiChevronDown, HiChevronUp } from 'react-icons/hi2';
import { HiMail } from 'react-icons/hi';

const AnimatedBorderText = dynamic(() => import('@/components/AnimatedBorderText'), {
  loading: () => <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>,
  ssr: false
});

const SupportChordMini: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(true);
  
  return (
    <Card className="w-full transition-all duration-300 border border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-lg group">
      <CardHeader className="pb-2">
        <h3 className="text-lg font-medium flex items-center gap-2">
          <HiSparkles className="w-5 h-5 text-primary" />
          Support ChordMini
        </h3>
        <Chip size="sm" variant="flat" color="success">
          Open Source
        </Chip>
      </CardHeader>

      <CardBody className="pt-0 space-y-4">
        {/* Description - Always visible */}
        <div className="text-sm text-gray-600 dark:text-gray-300">
          <p className="mb-3">
            ChordMini is a free, open-source project. The backend server is not guaranteed to be maintained and running for extended periods due to budget constraints. We try our best to keep it running and add new features/models. If you&apos;d like to support the project to keep the backend server running, you can use the donation link below. We really appreciate your support!
          </p>
        </div>

        {/* Collapsible Action Buttons Section */}
        <AnimatedBorderText>
          <div
            className="flex justify-between items-center cursor-pointer mb-3 p-2 rounded-lg hover:bg-default-100 dark:hover:bg-default-200/20 transition-colors duration-200"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <h4 className="text-sm font-medium text-foreground">Support Actions</h4>
            {isExpanded ? (
              <HiChevronUp className="w-4 h-4 text-foreground" />
            ) : (
              <HiChevronDown className="w-4 h-4 text-foreground" />
            )}
          </div>


          {isExpanded && (
            <div className="space-y-3">
              {/* GitHub Star */}
              <Button
                as="a"
                href="https://github.com/ptnghia-j/ChordMiniApp"
                target="_blank"
                rel="noopener noreferrer"
                variant="light"
                size="sm"
                startContent={<FaStar className="w-4 h-4 text-yellow-500" />}
                className="w-full justify-start text-sm bg-transparent hover:bg-transparent text-yellow-600 dark:text-yellow-400 hover:text-yellow-700 dark:hover:text-yellow-300"
              >
                Star on GitHub
              </Button>

              {/* Report Issues */}
              <Button
                as="a"
                href="https://github.com/ptnghia-j/ChordMiniApp/issues"
                target="_blank"
                rel="noopener noreferrer"
                variant="light"
                size="sm"
                startContent={<FaGithub className="w-4 h-4" />}
                className="w-full justify-start text-sm bg-transparent hover:bg-transparent text-foreground hover:text-primary"
              >
                Report Issues & Feedback
              </Button>

              {/* Contact Developer */}
              <Button
                as="a"
                href="mailto:phantrongnghia510@gmail.com"
                variant="light"
                size="sm"
                startContent={<HiMail className="w-4 h-4" />}
                className="w-full justify-start text-sm bg-transparent hover:bg-transparent text-foreground hover:text-primary"
              >
                Contact Developer
              </Button>

              {/* Donation */}
              <Button
                as="a"
                href="https://buymeacoffee.com/nghiaphan"
                target="_blank"
                rel="noopener noreferrer"
                variant="light"
                size="sm"
                startContent={<FaCoffee className="w-4 h-4" />}
                className="w-full justify-start text-sm bg-transparent hover:bg-transparent text-foreground hover:text-primary"
              >
                Donation
              </Button>
            </div>
          )}
        </AnimatedBorderText>



        {/* Fun fact */}
        <div className="bg-primary-50 dark:bg-primary-900/20 p-3 rounded-lg">
          <div className="flex items-start gap-2">
            <FaCoffee className="w-4 h-4 text-primary mt-0.5" />
            <div className="text-xs text-primary-700 dark:text-primary-300">
              <p className="font-medium mb-1">Did you know?</p>
              <p>ChordMini processes audio using advanced machine learning models trained on thousands of songs to provide accurate chord recognition!</p>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
};

export default SupportChordMini;
