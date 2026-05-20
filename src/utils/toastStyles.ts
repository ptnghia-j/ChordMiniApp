import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const defaultToastClassNames = {
  title: 'text-foreground dark:text-white font-semibold text-sm sm:text-base',
  description: 'text-default-600 dark:text-gray-300 text-xs sm:text-sm mt-1.5 leading-relaxed',
  closeButton: 'text-default-500 hover:text-foreground bg-transparent hover:bg-default-100/50 dark:text-default-500 dark:hover:text-white dark:bg-transparent dark:hover:bg-default-200/50',
  progressTrack: 'bg-default-200/70 dark:bg-white/10',
};

export interface ToastClassNames {
  base?: string;
  title?: string;
  description?: string;
  closeButton?: string;
  progressTrack?: string;
  icon?: string;
  content?: string;
}

/**
 * Merges instance-specific classNames with the application's default premium toast styles.
 * Ensures that dark-mode background, border, and shadows are consistently applied.
 */
export function mergeToastClassNames(customClassNames?: ToastClassNames): ToastClassNames {
  if (!customClassNames) return defaultToastClassNames;

  const keys = ['title', 'description', 'closeButton', 'progressTrack'] as const;
  const merged: ToastClassNames = {};

  for (const key of keys) {
    merged[key] = cn(defaultToastClassNames[key], customClassNames[key]);
  }

  // Preserve other specific properties
  if (customClassNames.icon) merged.icon = customClassNames.icon;
  if (customClassNames.content) merged.content = customClassNames.content;

  return merged;
}
