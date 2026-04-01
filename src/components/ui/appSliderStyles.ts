'use client';

type AppSliderTone = 'success' | 'primary' | 'danger' | 'foreground';

export function getAppSliderClassNames(_tone: AppSliderTone = 'success') {
  return {
    track: 'rounded-full bg-gray-200',
    thumb: 'after:bg-white',
  };
}
