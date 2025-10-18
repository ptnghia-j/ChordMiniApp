'use client';

import dynamic from 'next/dynamic';
import React, { useState } from 'react';
import { Card, CardBody, CardHeader, Button, Chip } from '@heroui/react';
import { FaGithub, FaCoffee, FaStar } from 'react-icons/fa';
import { HiSparkles, HiChevronDown, HiChevronUp } from 'react-icons/hi2';
import { HiMail } from 'react-icons/hi';
import { motion } from 'framer-motion';

const AnimatedBorderText = dynamic(() => import('@/components/homepage/AnimatedBorderText'), {
  loading: () => <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>,
  ssr: false
});

/**
 * Enhanced Support Section that maintains all existing styling
 * while adapting to the new animated layout structure
 */
const AnimatedSupportSection: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(true);
  
  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0.25, 0.46, 0.45, 0.94]
      }
    }
  };

  const buttonVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.4,
        delay: 0.2
      }
    }
  };
  
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
    >
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
          </AnimatedBorderText>

          {/* Action Buttons - Collapsible */}
          <motion.div
            initial={false}
            animate={{
              height: isExpanded ? "auto" : 0,
              opacity: isExpanded ? 1 : 0
            }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <motion.div 
              variants={buttonVariants}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              {/* Donation Button */}
              <Button
                as="a"
                href="https://buymeacoffee.com/nghiaphan"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-medium hover:from-yellow-500 hover:to-orange-600 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
                startContent={<FaCoffee className="w-4 h-4" />}
                size="sm"
              >
                Buy me a coffee
              </Button>

              {/* GitHub Star Button */}
              <Button
                as="a"
                href="https://github.com/ptnghia-j/ChordMiniApp"
                target="_blank"
                rel="noopener noreferrer"
                variant="bordered"
                className="border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 transition-all duration-300 transform hover:scale-105"
                startContent={<FaGithub className="w-4 h-4" />}
                size="sm"
              >
                <FaStar className="w-3 h-3 mr-1" />
                Star on GitHub
              </Button>

              {/* Contact Button */}
              <Button
                as="a"
                href="mailto:phantrongnghia510@gmail.com"
                variant="flat"
                color="primary"
                className="transition-all duration-300 transform hover:scale-105"
                startContent={<HiMail className="w-4 h-4" />}
                size="sm"
              >
                Contact Developer
              </Button>

              {/* Contribute Button */}
              <Button
                as="a"
                href="https://github.com/ptnghia-j/ChordMiniApp/blob/main/CONTRIBUTING.md"
                target="_blank"
                rel="noopener noreferrer"
                variant="flat"
                color="secondary"
                className="transition-all duration-300 transform hover:scale-105"
                startContent={<HiSparkles className="w-4 h-4" />}
                size="sm"
              >
                Contribute
              </Button>
            </motion.div>
          </motion.div>

          {/* Additional Information */}
          <motion.div 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
          >
            <div className="flex items-start gap-2">
              <HiSparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-blue-700 dark:text-blue-300">
                <p className="font-medium mb-1">Research Project</p>
                <p>
                  ChordMini is part of research at California State University, Fullerton by master student Nghia Phan under advisor Dr. Rong Jin. Your support helps advance music technology research.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Technical Stack Info */}
          <motion.div 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="mt-3 text-xs text-gray-500 dark:text-gray-400"
          >
            <p>
              <span className="font-medium">Tech Stack:</span> Next.js, TypeScript, Python, PyTorch, Google Cloud Run
            </p>
          </motion.div>
        </CardBody>
      </Card>
    </motion.div>
  );
};

export default AnimatedSupportSection;
