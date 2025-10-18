/**
 * TabbedInterface Component
 * 
 * This component provides a tabbed interface for the analyze page,
 * allowing users to switch between "Beat & Chord Map" and "Lyrics & Chords" views.
 */

import React, { useState, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface TabbedInterfaceProps {
  tabs: Tab[];
  defaultTabId?: string;
  children: ReactNode[];
  className?: string;
}

const TabbedInterface: React.FC<TabbedInterfaceProps> = ({
  tabs,
  defaultTabId,
  children,
  className = '',
}) => {
  const [activeTabId, setActiveTabId] = useState<string>(defaultTabId || tabs[0].id);

  // Find the index of the active tab
  const activeTabIndex = tabs.findIndex(tab => tab.id === activeTabId);

  // Animation variants for tab content
  const contentVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 }
  };

  return (
    <div className={`tabbed-interface ${className}`}>
      {/* Tab navigation */}
      <div className="tab-navigation flex border-b border-gray-200 mb-4">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={`
              px-4 py-2 text-sm font-medium rounded-t-lg transition-colors
              ${activeTabId === tab.id
                ? 'bg-blue-600 text-white border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
              }
              ${index === 0 ? 'ml-0' : 'ml-1'}
            `}
            aria-selected={activeTabId === tab.id}
            role="tab"
          >
            <div className="flex items-center space-x-1">
              {tab.icon && <span>{tab.icon}</span>}
              <span>{tab.label}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTabId}
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={contentVariants}
          transition={{ duration: 0.2 }}
          className="tab-content"
        >
          {children[activeTabIndex]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default TabbedInterface;
