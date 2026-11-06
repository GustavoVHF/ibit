import React, { useState, useRef, useEffect } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { CalendarDays, Check } from 'lucide-react';
import clsx from 'clsx';
import { getLocale, getMessages } from '../../i18n';

interface CalendarEventComponentProps {
  node: {
    attrs: {
      date: string;
      sync: boolean;
    };
  };
  updateAttributes: (attrs: Record<string, any>) => void;
  selected: boolean;
}

export default function CalendarEventComponent({
  node,
  updateAttributes,
  selected,
}: CalendarEventComponentProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);
  const { date, sync } = node.attrs;

  // Handle outside click and scroll to close popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleScroll = () => {
      if (isOpen) setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside, true);
      // Listen to scroll on window and specifically the editor container to close popover
      window.addEventListener('scroll', handleScroll, true); 
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  const handleOpen = (e: React.MouseEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOpen) {
      const rect = e.currentTarget.getBoundingClientRect();
      // Calculate fixed position below the chip
      setCoords({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
    setIsOpen(!isOpen);
  };

  // Format date for the chip display
  const formattedDate = date
    ? new Date(date + 'T12:00:00').toLocaleDateString(getLocale(), {
        day: '2-digit',
        month: 'short',
      }).replace(' de ', ' ')
    : getMessages().editor.eventDatePlaceholder;

  return (
    <NodeViewWrapper
      as="span"
      className="inline-block align-middle mx-1"
      contentEditable={false}
    >
      {/* 1. COMPACT NEUTRAL CHIP */}
      <span
        onClick={handleOpen}
        onMouseDown={(e) => e.stopPropagation()}
        className={clsx(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors border shadow-sm select-none whitespace-nowrap overflow-visible",
          "bg-white border-gray-200 text-gray-600 hover:bg-gray-50",
          selected && "ring-2 ring-[#ff7f00] ring-offset-1"
        )}
        style={{ whiteSpace: 'nowrap' }}
      >
        <CalendarDays className="w-3.5 h-3.5 opacity-70" />
        <span className="uppercase tracking-wider">{formattedDate}</span>
      </span>

      {/* 2. FIXED POPOVER MENU (Avoids clipping) */}
      {isOpen && (
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
          }}
          className="z-[9999] bg-white border border-gray-100 shadow-xl rounded-xl p-3 w-56 flex flex-col gap-3"
          onKeyDown={(e) => e.stopPropagation()}
          onKeyUp={(e) => e.stopPropagation()}
          onKeyPress={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()} 
          onClick={(e) => e.stopPropagation()}
        >
          {/* Date Picker Section */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
              <CalendarDays className="w-3 h-3" /> {getMessages().editor.chooseDate}
            </label>
            <input
              type="date"
              value={date || ''}
              onChange={(e) => updateAttributes({ date: e.target.value })}
              className="w-full text-sm font-semibold border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-[#ff7f00] focus:border-transparent text-gray-700 bg-gray-50/50 cursor-pointer"
              style={{ colorScheme: 'light' }}
            />
          </div>

          {/* Divider */}
          <div className="h-px w-full bg-gray-100" />

          {/* Sync Checkbox Section */}
          <label className="flex items-start gap-2.5 cursor-pointer group p-1 -m-1 rounded-lg hover:bg-gray-50 transition-colors">
            <div
              className={clsx(
                "w-4 h-4 rounded-md border flex items-center justify-center mt-0.5 transition-all shrink-0",
                sync
                  ? "bg-[#ff7f00] border-[#ff7f00] text-white shadow-sm shadow-orange-200"
                  : "border-gray-300 bg-white group-hover:border-[#ff7f00]"
              )}
            >
              {sync && <Check className="w-3 h-3" strokeWidth={3} />}
            </div>
            <input
              type="checkbox"
              className="hidden"
              checked={sync}
              onChange={(e) => updateAttributes({ sync: e.target.checked })}
            />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-gray-700">{getMessages().editor.syncCalendar}</span>
              <span className="text-[9px] text-gray-400 leading-tight mt-0.5 font-medium">
                {getMessages().editor.syncCalendarHint}
              </span>
            </div>
          </label>
        </div>
      )}
    </NodeViewWrapper>
  );
}
