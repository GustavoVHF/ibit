import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';
import { getLocale, getMessages } from '../../i18n';

/**
 * Shared PDF export engine.
 *
 * Resolution model: the user sets explicit pixel width/height + DPI. Physical
 * page size (pt) is derived directly from those (widthPx/dpi * 72). The
 * captured content image is scaled with its ASPECT RATIO PRESERVED to fit
 * within the declared page (minus margin) and centered — never stretched.
 * Stretching distorts text and columns into illegibility, so it is never
 * used here. Orientation/size changes still take effect: the content is
 * re-scaled to the largest size that fits the new page, it just never gets
 * skewed off its native proportions.
 */

export interface PdfExportOptions {
  widthPx: number;
  heightPx: number;
  dpi: number;
  /**
   * When true: include header (title/subtitle), footer (export date + IBIT
   * logo) and their separator lines, plus a page margin.
   * When false: skip all of that institutional chrome and export the inner
   * content tightly, with no outer margin.
   */
  chrome: boolean;
}

export const DEFAULT_PDF_OPTIONS: PdfExportOptions = {
  widthPx: 1920,
  heightPx: 1080,
  dpi: 150,
  chrome: true,
};

export interface PdfSizeTemplate {
  id: string;
  label: string;
  widthPx: number;
  heightPx: number;
  dpi: number;
}

export const PDF_SIZE_TEMPLATES: PdfSizeTemplate[] = [
  { id: '4k-landscape', label: '4K Paisagem', widthPx: 3840, heightPx: 2160, dpi: 300 },
  { id: '4k-portrait', label: '4K Retrato', widthPx: 2160, heightPx: 3840, dpi: 300 },
  { id: 'a4-portrait', label: 'A4 Retrato', widthPx: 2480, heightPx: 3508, dpi: 300 },
  { id: 'a4-landscape', label: 'A4 Paisagem', widthPx: 3508, heightPx: 2480, dpi: 300 },
];

/** Converts a target DPI into the pixelRatio expected by html-to-image (baseline: 96 CSS px/inch). */
export function pixelRatioFromDpi(dpi: number): number {
  return Math.max(0.5, dpi / 96);
}

/** Builds the standard official header block markup (title + metadata row). Only rendered by callers when `chrome` is enabled. */
export function buildOfficialHeaderHTML(opts: {
  title: string;
  subtitle: string;
  responsibleName?: string;
  accessLevel?: string;
}): string {
  const now = new Date();
  const locale = getLocale();
  const m = getMessages().export;
  const dateStr = now.toLocaleDateString(locale);
  const timeStr = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return `
    <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #ff7f00;">
      <div>
        <div style="font-size: 20px; font-weight: 800; color: #111; text-transform: uppercase; letter-spacing: 0.1em; font-family: 'lufga', 'Inter', sans-serif; line-height: 1;">${opts.title}</div>
        <div style="font-size: 11px; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 0.15em; margin-top: 2px; font-family: 'lufga', 'Inter', sans-serif;">${opts.subtitle}</div>
      </div>
      <div style="text-align: right; font-family: 'lufga', 'Inter', sans-serif;">
        <div style="font-size: 8px; color: #9ca3af; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;">${m.generatedAt(dateStr, timeStr)}</div>
        ${opts.responsibleName ? `<div style="font-size: 8px; color: #9ca3af; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 2px;">${m.responsible(opts.responsibleName)}</div>` : ''}
        <div style="font-size: 8px; color: #9ca3af; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 2px;">${m.accessLevel(opts.accessLevel || m.projectMembers)}</div>
      </div>
    </div>
  `;
}

/** Builds the standard footer markup (export date label + IBIT logo). Only rendered by callers when `chrome` is enabled. */
export function buildOfficialFooterHTML(logoSrc: string, label: string): string {
  return `
    <div data-pdf-footer-inner="true" style="display:flex;justify-content:space-between;align-items:center;width:100%;margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;">
      <span style="font-size:10px;color:#9ca3af;font-weight:500;font-family:'lufga','Inter',sans-serif;">${label}</span>
      <img src="${logoSrc}" style="height:26px;object-fit:contain;" />
    </div>
  `;
}

export interface CapturePdfOptions {
  filename: string;
  widthPx: number;
  heightPx: number;
  dpi: number;
  /** Whether to reserve an outer margin around the content (mirrors options.chrome). */
  chrome: boolean;
  backgroundColor?: string;
}

/**
 * Captures `container` (must already be attached to the DOM, fully laid out)
 * as a PNG and embeds it into a PDF page sized exactly to widthPx x heightPx
 * at the given DPI. The image is scaled to fit inside that page (aspect
 * ratio preserved, never stretched/distorted) and centered.
 */
export async function captureContainerAsPdf(container: HTMLElement, opts: CapturePdfOptions): Promise<void> {
  const pixelRatio = pixelRatioFromDpi(opts.dpi);
  const backgroundColor = opts.backgroundColor ?? '#ffffff';

  const dataUrl = await toPng(container, { cacheBust: true, backgroundColor, pixelRatio });

  const widthIn = opts.widthPx / opts.dpi;
  const heightIn = opts.heightPx / opts.dpi;
  const pdfWidth = widthIn * 72;
  const pdfHeight = heightIn * 72;
  const margin = opts.chrome ? 24 : 0;
  const orientation: 'portrait' | 'landscape' = pdfWidth >= pdfHeight ? 'landscape' : 'portrait';

  const pdf = new jsPDF({ orientation, unit: 'pt', format: [pdfWidth, pdfHeight] });
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, pdfWidth, pdfHeight, 'F');

  const availableWidth = pdfWidth - margin * 2;
  const availableHeight = pdfHeight - margin * 2;

  const imgProps = pdf.getImageProperties(dataUrl);
  const imgRatio = imgProps.height / imgProps.width;

  // Fit inside the available box, preserving aspect ratio — never distort.
  let drawWidth = availableWidth;
  let drawHeight = drawWidth * imgRatio;
  if (drawHeight > availableHeight) {
    drawHeight = availableHeight;
    drawWidth = drawHeight / imgRatio;
  }

  const xOffset = margin + (availableWidth - drawWidth) / 2;
  const yOffset = margin + (availableHeight - drawHeight) / 2;

  pdf.addImage(dataUrl, 'PNG', xOffset, yOffset, drawWidth, drawHeight);
  pdf.save(opts.filename);
}
