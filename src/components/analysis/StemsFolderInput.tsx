'use client';

import { useState } from 'react';
import { Button, Input, Tooltip } from '@heroui/react';

interface StemsFolderInputProps {
  onChange: (path: string | null) => void;
  disabled?: boolean;
  className?: string;
}

export default function StemsFolderInput({ onChange, disabled = false, className = '' }: StemsFolderInputProps) {
  const [stemsPath, setStemsPath] = useState<string>('');
  const [isEnabled, setIsEnabled] = useState(false);

  const handleToggle = () => {
    const newEnabled = !isEnabled;
    setIsEnabled(newEnabled);

    if (!newEnabled) {
      onChange(null);
      setStemsPath('');
    } else if (stemsPath) {
      onChange(stemsPath);
    }
  };

  const handlePathChange = (value: string) => {
    setStemsPath(value);
    if (isEnabled && value) {
      onChange(value);
    } else if (isEnabled && !value) {
      onChange(null);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <Tooltip
          content="Use pre-rendered stems from a folder to skip Spleeter separation (faster processing)"
          placement="top"
          delay={0}
          closeDelay={0}
        >
          <Button
            size="sm"
            variant={isEnabled ? "solid" : "bordered"}
            color={isEnabled ? "success" : "default"}
            onPress={handleToggle}
            disabled={disabled}
            className="min-w-[140px]"
          >
            {isEnabled ? '✓ Using Stems' : 'Use Pre-rendered Stems'}
          </Button>
        </Tooltip>

        {isEnabled && (
          <span className="text-sm text-gray-600 dark:text-gray-400">
            (Skips Spleeter separation)
          </span>
        )}
      </div>

      {isEnabled && (
        <div className="pl-2">
          <Input
            type="text"
            placeholder="/path/to/stems/folder (with vocals.mp3, drums.mp3, bass.mp3, other.mp3)"
            value={stemsPath}
            onValueChange={handlePathChange}
            disabled={disabled}
            size="sm"
            className="max-w-lg"
            classNames={{
              input: "text-sm",
              inputWrapper: "h-9"
            }}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 pl-2">
            Expected files: vocals.mp3, drums.mp3, bass.mp3, other.mp3
          </p>
        </div>
      )}
    </div>
  );
}