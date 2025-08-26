// src/components/CodeBlock.tsx
'use client';

import { CopyBlock, dracula, github } from 'react-code-blocks';
import { useTheme } from '@/contexts/ThemeContext';

interface CodeBlockProps {
  code: string;
  language: string;
  title?: string;
}

export const CodeBlock = ({ code, language }: CodeBlockProps) => {
  const { theme } = useTheme();

  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 font-mono text-sm">
      <CopyBlock
        text={code}
        language={language}
        showLineNumbers={true}
        theme={theme === 'dark' ? dracula : github}
        wrapLongLines
      />
    </div>
  );
};