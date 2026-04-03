import { exportScorePartsToMusicXml, type MusicXmlExportOptions, type ScorePartData } from '@/utils/musicXmlExport';

interface MusicXmlWorkerRequest {
  parts: ScorePartData[];
  options?: MusicXmlExportOptions;
}

self.onmessage = (event: MessageEvent<MusicXmlWorkerRequest>) => {
  const { parts, options } = event.data;
  const xml = exportScorePartsToMusicXml(parts, options);
  self.postMessage({ xml });
};

export {};
