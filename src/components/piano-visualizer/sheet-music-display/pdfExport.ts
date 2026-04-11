import { configureOsmdChordSymbolRules } from './chordSymbolLayout';
import { loadOsmdConstructor } from './osmdLoader';
import type { PdfWriter, RasterizedScorePage } from './types';

function collectRenderableScoreCanvases(container: HTMLElement): HTMLCanvasElement[] {
  const MIN_SCORE_WIDTH = 120;
  const MIN_SCORE_HEIGHT = 80;

  return Array.from(container.querySelectorAll('canvas'))
    .filter((element): element is HTMLCanvasElement => element instanceof HTMLCanvasElement)
    .filter((canvas) => canvas.width >= MIN_SCORE_WIDTH && canvas.height >= MIN_SCORE_HEIGHT);
}

function rasterizeScoreCanvasPages(container: HTMLElement): RasterizedScorePage[] {
  const canvases = collectRenderableScoreCanvases(container);
  const pages: RasterizedScorePage[] = [];

  for (const canvas of canvases) {
    try {
      pages.push({
        dataUrl: canvas.toDataURL('image/png'),
        width: Math.max(1, canvas.width),
        height: Math.max(1, canvas.height),
      });
    } catch {
      continue;
    }
  }

  return pages;
}

export async function rasterizeScoreWithDedicatedCanvasBackend(params: {
  musicXml: string;
  targetWidth: number;
}): Promise<RasterizedScorePage[]> {
  if (typeof document === 'undefined') {
    return [];
  }

  const { musicXml, targetWidth } = params;
  const OpenSheetMusicDisplay = await loadOsmdConstructor();
  const host = document.createElement('div');
  const exportContainer = document.createElement('div');

  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = `${Math.max(640, Math.ceil(targetWidth))}px`;
  host.style.background = '#ffffff';
  host.style.opacity = '0';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '-1';
  host.setAttribute('aria-hidden', 'true');

  exportContainer.style.width = '100%';
  exportContainer.style.background = '#ffffff';
  host.appendChild(exportContainer);
  document.body.appendChild(host);

  try {
    const exportOsmd = new OpenSheetMusicDisplay(exportContainer, {
      autoResize: false,
      backend: 'canvas',
      drawTitle: false,
      drawComposer: false,
      drawPartNames: true,
      drawingParameters: 'default',
      renderSingleHorizontalStaffline: false,
      followCursor: false,
      cursorsOptions: [],
    });

    configureOsmdChordSymbolRules(exportOsmd);
    await exportOsmd.load(musicXml);
    exportOsmd.Zoom = 0.82;
    exportOsmd.render();

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

    return rasterizeScoreCanvasPages(exportContainer);
  } catch {
    return [];
  } finally {
    host.remove();
  }
}

export function appendImageToPdfPages(params: {
  pdf: PdfWriter;
  imageData: string;
  sourceWidth: number;
  sourceHeight: number;
  addPageBefore: boolean;
}): void {
  const {
    pdf,
    imageData,
    sourceWidth,
    sourceHeight,
    addPageBefore,
  } = params;

  if (addPageBefore) {
    pdf.addPage();
  }

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const renderedWidth = pageWidth;
  const renderedHeight = (sourceHeight * renderedWidth) / Math.max(sourceWidth, 1);
  let heightLeft = renderedHeight;
  let positionY = 0;

  pdf.addImage(imageData, 'PNG', 0, positionY, renderedWidth, renderedHeight, undefined, 'FAST');
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    positionY = heightLeft - renderedHeight;
    pdf.addPage();
    pdf.addImage(imageData, 'PNG', 0, positionY, renderedWidth, renderedHeight, undefined, 'FAST');
    heightLeft -= pageHeight;
  }
}
