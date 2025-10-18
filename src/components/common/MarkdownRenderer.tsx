'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Markdown renderer component for chatbot messages
 * Provides proper styling for markdown elements in chat messages
 */
const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = ''
}) => {
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        components={{
        // Custom styling for different markdown elements
        h1: ({ children }) => (
          <h1 className="text-lg font-bold mb-2 text-gray-900 dark:text-gray-100">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-bold mb-2 text-gray-900 dark:text-gray-100">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-bold mb-1 text-gray-900 dark:text-gray-100">
            {children}
          </h3>
        ),
        p: ({ children }) => (
          <p className="mb-2 last:mb-0 text-sm leading-relaxed">
            {children}
          </p>
        ),
        strong: ({ children }) => (
          <strong className="font-bold text-gray-900 dark:text-gray-100">
            {children}
          </strong>
        ),
        em: ({ children }) => (
          <em className="italic text-gray-800 dark:text-gray-200">
            {children}
          </em>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-inside mb-2 space-y-1 text-sm">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside mb-2 space-y-1 text-sm">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="text-sm leading-relaxed">
            {children}
          </li>
        ),
        code: ({ children, className }) => {
          // Check if it's inline code or code block
          const isInline = !className;

          if (isInline) {
            return (
              <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-xs font-mono text-gray-800 dark:text-gray-200">
                {children}
              </code>
            );
          }

          // Code block
          return (
            <code className="block bg-gray-100 dark:bg-gray-700 p-2 rounded text-xs font-mono text-gray-800 dark:text-gray-200 overflow-x-auto">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="bg-gray-100 dark:bg-gray-700 p-2 rounded mb-2 overflow-x-auto">
            {children}
          </pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-blue-500 pl-3 mb-2 text-sm italic text-gray-700 dark:text-gray-300">
            {children}
          </blockquote>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline text-sm"
          >
            {children}
          </a>
        ),
        // Handle line breaks properly
        br: () => <br className="mb-1" />,
      }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
