// Source-agnostic analysis source discriminated union
// This file defines the origin of an analysis session so both YouTube and
// direct upload flows can share downstream functionality.

export type AnalysisSource =
  | {
      type: 'youtube';
      videoId: string;
      videoMetadata?: {
        title?: string;
        duration?: number;
        channelTitle?: string;
        thumbnail?: string;
      };
    }
  | {
      type: 'upload';
      sessionId: string;
      fileName?: string;
      fileSize?: number;
      blobUrl?: string;
    };

