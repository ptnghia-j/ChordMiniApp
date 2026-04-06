// src/components/CodeBlock.tsx
'use client';

import { useState } from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import { useTheme } from '@/contexts/ThemeContext';
import AppTooltip from '@/components/common/AppTooltip';

interface CodeBlockProps {
  code: string;
  language: string;
  title?: string;
}

export const CodeBlock = ({ code, language }: CodeBlockProps) => {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 font-mono text-sm relative">
      <AppTooltip content="Copy code">
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors z-10"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </AppTooltip>

      <Highlight
        theme={theme === 'dark' ? themes.vsDark : themes.github}
        code={code}
        language={language}
      >
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre className={className} style={style}>
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                <span className="inline-block w-8 text-right pr-4 text-gray-500 select-none">
                  {i + 1}
                </span>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
};