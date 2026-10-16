import React, { useState } from 'react';
import { Download } from 'lucide-react';
import clsx from 'clsx';
import ExportModal, { ExportFormat, ExportModalProps } from './ExportModal';

export interface ExportButtonProps extends Omit<ExportModalProps, 'isOpen' | 'onClose'> {
  // (all ExportModalProps except isOpen/onClose are forwarded, including defaultPdfOptions)
  /** Extra classes for the trigger button (defaults match the standard secondary button style used across the app). */
  className?: string;
  /** Compact label variant for tight mobile toolbars. */
  compact?: boolean;
  label?: string;
  /** Override the trigger icon (defaults to a download icon). */
  icon?: React.ElementType;
}

/**
 * Standardized "Exportar" trigger button + modal, meant to replace all
 * page-specific PDF export buttons across the platform.
 */
export default function ExportButton({
  className,
  compact = false,
  label = 'EXPORTAR',
  icon: Icon = Download,
  ...modalProps
}: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={clsx(
          'bg-white text-gray-700 border border-gray-300 px-4 py-2 flex items-center gap-2 transition-all font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-gray-50 active:scale-95 disabled:opacity-50',
          className
        )}
        title="Exportar"
      >
        <Icon className="w-4 h-4" />
        {label && (compact ? <span className="hidden sm:inline">{label}</span> : <span>{label}</span>)}
      </button>
      <ExportModal isOpen={isOpen} onClose={() => setIsOpen(false)} {...modalProps} />
    </>
  );
}

export type { ExportFormat };
