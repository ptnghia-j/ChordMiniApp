'use client';

import { isDevelopmentEnvironment } from '@/utils/modelFiltering';

export default function AnalyzeEmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-default-300/70 dark:border-gray-800 bg-default-50/60 dark:bg-gray-900/20 p-6 text-center">
      <p className="text-sm font-medium text-foreground">No analysis loaded yet</p>
      <p className="mt-1 text-sm text-default-500 dark:text-gray-400">
        Choose your models above, then open cached results or run a fresh analysis.
      </p>
      {!isDevelopmentEnvironment() && (
        <p className="mt-1 text-xs text-white/95 dark:text-white/95">
          For other experimental models, clone the repository and build the app from source.
        </p>
      )}
    </div>
  );
}
