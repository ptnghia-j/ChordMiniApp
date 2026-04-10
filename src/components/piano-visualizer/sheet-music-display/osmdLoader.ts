import type { OpenSheetMusicDisplayCtor } from './types';

declare global {
  interface Window {
    opensheetmusicdisplay?: {
      OpenSheetMusicDisplay?: OpenSheetMusicDisplayCtor;
    } | OpenSheetMusicDisplayCtor;
    __chordMiniOsmdLoader__?: Promise<OpenSheetMusicDisplayCtor>;
  }
}

export function resolveOsmdConstructor(): OpenSheetMusicDisplayCtor | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const maybeNamespace = window.opensheetmusicdisplay;
  if (!maybeNamespace) {
    return null;
  }

  if (typeof maybeNamespace === 'function') {
    return maybeNamespace as OpenSheetMusicDisplayCtor;
  }

  if (typeof maybeNamespace.OpenSheetMusicDisplay === 'function') {
    return maybeNamespace.OpenSheetMusicDisplay;
  }

  return null;
}

export function loadOsmdConstructor(): Promise<OpenSheetMusicDisplayCtor> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('OSMD can only load in the browser.'));
  }

  const existing = resolveOsmdConstructor();
  if (existing) {
    return Promise.resolve(existing);
  }

  if (window.__chordMiniOsmdLoader__) {
    return window.__chordMiniOsmdLoader__;
  }

  window.__chordMiniOsmdLoader__ = new Promise<OpenSheetMusicDisplayCtor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/opensheetmusicdisplay/opensheetmusicdisplay.min.js';
    script.async = true;
    script.onload = () => {
      const ctor = resolveOsmdConstructor();
      if (ctor) {
        resolve(ctor);
      } else {
        reject(new Error('OSMD loaded but OpenSheetMusicDisplay was not found on window.'));
      }
    };
    script.onerror = () => reject(new Error('Unable to load local OpenSheetMusicDisplay bundle.'));
    document.head.appendChild(script);
  });

  return window.__chordMiniOsmdLoader__;
}
