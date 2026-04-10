export type OpenSheetMusicDisplayCtor = new (
  container: HTMLElement,
  options?: Record<string, unknown>,
) => {
  load: (source: string) => Promise<void>;
  render: () => void;
  clear: () => void;
  enableOrDisableCursors?: (enabled: boolean) => void;
  cursor?: {
    reset: () => void;
    show: () => void;
    hide?: () => void;
    next: () => void;
    cursorElement?: HTMLElement;
    Iterator?: {
      EndReached?: boolean;
      currentTimeStamp?: { RealValue?: number };
      CurrentSourceTimestamp?: { RealValue?: number };
      clone?: () => {
        EndReached?: boolean;
        currentTimeStamp?: { RealValue?: number };
        CurrentSourceTimestamp?: { RealValue?: number };
        moveToNextVisibleVoiceEntry?: (notesOnly: boolean) => void;
      };
    };
  };
  Zoom: number;
};

export interface MeasureHighlightBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface ScoreSyncData {
  measureStartScoreTimes: number[];
  measureStartAudioTimes: number[];
}

export interface RasterizedScorePage {
  dataUrl: string;
  width: number;
  height: number;
}

export interface PdfWriter {
  addPage: () => void;
  addImage: (...args: unknown[]) => void;
  internal: {
    pageSize: {
      getWidth: () => number;
      getHeight: () => number;
    };
  };
  save: (filename: string) => void;
}
