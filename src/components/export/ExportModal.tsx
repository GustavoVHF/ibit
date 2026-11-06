import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/LanguageContext';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  FileText,
  FileSpreadsheet,
  FileType,
  Loader2,
  Download,
  Image as ImageIcon,
  RectangleHorizontal,
  RectangleVertical,
} from 'lucide-react';
import clsx from 'clsx';
import {
  DEFAULT_PDF_OPTIONS,
  PDF_SIZE_TEMPLATES,
  PdfExportOptions,
} from '../../utils/export/pdfEngine';

export type ExportFormat = 'pdf' | 'excel' | 'word';

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Which formats are available in this context. PDF is always allowed if present. */
  formats: ExportFormat[];
  title?: string;
  /** Called with the chosen PDF options when the user confirms a PDF export. */
  onExportPdf?: (options: PdfExportOptions) => Promise<void> | void;
  onExportExcel?: () => Promise<void> | void;
  onExportWord?: () => Promise<void> | void;
  /** Disable a given format's confirm action (e.g. no rows to export). */
  disabledFormats?: Partial<Record<ExportFormat, boolean>>;
  /** Override the initial PDF size/DPI/chrome (e.g. A4 portrait for text documents vs. wide landscape for charts). Defaults to DEFAULT_PDF_OPTIONS. */
  defaultPdfOptions?: Partial<PdfExportOptions>;
}

const FORMAT_META: Record<ExportFormat, { label: string; icon: React.ElementType }> = {
  pdf: { label: 'PDF', icon: FileText },
  excel: { label: 'Excel', icon: FileSpreadsheet },
  word: { label: 'Word', icon: FileType },
};

export default function ExportModal({
  isOpen,
  onClose,
  formats,
  title,
  onExportPdf,
  onExportExcel,
  onExportWord,
  disabledFormats,
  defaultPdfOptions,
}: ExportModalProps) {
  const { t } = useI18n();
  const [activeFormat, setActiveFormat] = useState<ExportFormat>(formats[0] ?? 'pdf');
  const [pdfOptions, setPdfOptions] = useState<PdfExportOptions>({ ...DEFAULT_PDF_OPTIONS, ...defaultPdfOptions });
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isDisabled = !!disabledFormats?.[activeFormat];
  const isLandscape = pdfOptions.widthPx >= pdfOptions.heightPx;

  const handleConfirm = async () => {
    if (isExporting || isDisabled) return;
    setError(null);
    setIsExporting(true);
    try {
      if (activeFormat === 'pdf' && onExportPdf) {
        await onExportPdf(pdfOptions);
      } else if (activeFormat === 'excel' && onExportExcel) {
        await onExportExcel();
      } else if (activeFormat === 'word' && onExportWord) {
        await onExportWord();
      }
      onClose();
    } catch (err) {
      console.error('[ExportModal] Export failed:', err);
      setError(t.export.exportError);
    } finally {
      setIsExporting(false);
    }
  };

  const applyTemplate = (widthPx: number, heightPx: number, dpi: number) => {
    setPdfOptions((o) => ({ ...o, widthPx, heightPx, dpi }));
  };

  const toggleOrientation = (nextLandscape: boolean) => {
    setPdfOptions((o) => {
      if (nextLandscape === (o.widthPx >= o.heightPx)) return o;
      return { ...o, widthPx: o.heightPx, heightPx: o.widthPx };
    });
  };

  const modal = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-[1000] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto relative"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
            <h3 className="text-xl font-bold uppercase tracking-wider text-gray-900 flex items-center gap-2">
              <Download className="w-5 h-5 text-[#ff7f00]" />
              {title ?? t.export.exportTitle}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-900 transition-colors"
              aria-label={t.common.close}
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* Format tabs */}
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">{t.export.format}</label>
              <div className={clsx('grid gap-2 mt-2', formats.length === 1 ? 'grid-cols-1' : formats.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
                {formats.map((fmt) => {
                  const meta = FORMAT_META[fmt];
                  const Icon = meta.icon;
                  const active = activeFormat === fmt;
                  return (
                    <button
                      key={fmt}
                      onClick={() => setActiveFormat(fmt)}
                      className={clsx(
                        'flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border transition-all text-center',
                        active
                          ? 'border-[#ff7f00] bg-orange-50 text-[#ff7f00]'
                          : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* PDF customization panel */}
            {activeFormat === 'pdf' && (
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">{t.export.resolution}</label>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <div>
                      <span className="text-[9px] font-bold text-gray-400 uppercase">{t.export.width}</span>
                      <input
                        type="number"
                        min={100}
                        value={pdfOptions.widthPx}
                        onChange={(e) => setPdfOptions((o) => ({ ...o, widthPx: Math.max(100, parseInt(e.target.value) || 0) }))}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 focus:outline-none focus:border-[#ff7f00]"
                      />
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-gray-400 uppercase">{t.export.height}</span>
                      <input
                        type="number"
                        min={100}
                        value={pdfOptions.heightPx}
                        onChange={(e) => setPdfOptions((o) => ({ ...o, heightPx: Math.max(100, parseInt(e.target.value) || 0) }))}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 focus:outline-none focus:border-[#ff7f00]"
                      />
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-gray-400 uppercase">DPI</span>
                      <input
                        type="number"
                        min={36}
                        max={600}
                        value={pdfOptions.dpi}
                        onChange={(e) => setPdfOptions((o) => ({ ...o, dpi: Math.max(36, parseInt(e.target.value) || 0) }))}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 focus:outline-none focus:border-[#ff7f00]"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">{t.export.orientation}</label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <button
                      onClick={() => toggleOrientation(false)}
                      className={clsx(
                        'flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border transition-all',
                        !isLandscape ? 'border-[#ff7f00] bg-orange-50 text-[#ff7f00]' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                      )}
                    >
                      <RectangleVertical className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">{t.export.portrait}</span>
                    </button>
                    <button
                      onClick={() => toggleOrientation(true)}
                      className={clsx(
                        'flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border transition-all',
                        isLandscape ? 'border-[#ff7f00] bg-orange-50 text-[#ff7f00]' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                      )}
                    >
                      <RectangleHorizontal className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">{t.export.landscape}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">{t.export.templates}</label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {PDF_SIZE_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        onClick={() => applyTemplate(tpl.widthPx, tpl.heightPx, tpl.dpi)}
                        className="px-2 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-[#ff7f00] hover:text-[#ff7f00] hover:bg-orange-50 transition-all text-left"
                      >
                        <div className="text-[10px] font-bold uppercase tracking-widest">{t.export.templateLabels[tpl.id] ?? tpl.label}</div>
                        <div className="text-[9px] text-gray-400 font-semibold mt-0.5">{tpl.widthPx}×{tpl.heightPx} · {tpl.dpi} DPI</div>
                      </button>
                    ))}
                  </div>
                </div>

                <ToggleRow
                  icon={ImageIcon}
                  label={t.export.chrome}
                  checked={pdfOptions.chrome}
                  onChange={(v) => setPdfOptions((o) => ({ ...o, chrome: v }))}
                />
              </div>
            )}

            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2.5 font-semibold">{error}</div>
            )}
          </div>

          {/* Footer actions */}
          <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex items-center justify-end gap-3 sticky bottom-0 rounded-b-2xl">
            <button
              onClick={onClose}
              disabled={isExporting}
              type="button"
              className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {t.common.cancel}
            </button>
            <button
              onClick={handleConfirm}
              disabled={isExporting || isDisabled}
              type="button"
              className="px-8 py-2.5 bg-[#ff7f00] hover:bg-orange-600 text-white flex items-center gap-2 font-bold uppercase tracking-widest text-xs rounded-lg active:scale-95 transition-all disabled:opacity-50 shadow-md shadow-orange-100"
            >
              {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {isExporting ? t.export.exporting : t.export.exportTitle}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  // Portal to document.body: fixed-position overlays break (blur/backdrop
  // disappears, stray borders, unrelated elements bleed through) when any
  // ancestor has a CSS transform — which motion.div wrappers apply during
  // animations. Rendering at the body root guarantees `fixed` is always
  // relative to the viewport.
  return createPortal(modal, document.body);
}

function ToggleRow({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ElementType;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
    >
      <span className="flex items-center gap-2 text-xs font-semibold text-gray-700">
        <Icon className="w-3.5 h-3.5 text-gray-400" />
        {label}
      </span>
      <span
        className={clsx(
          'w-9 h-5 rounded-full transition-colors relative shrink-0',
          checked ? 'bg-[#ff7f00]' : 'bg-gray-200'
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
            checked && 'translate-x-4'
          )}
        />
      </span>
    </button>
  );
}
