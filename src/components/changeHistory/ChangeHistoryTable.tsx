import React from 'react';
import clsx from 'clsx';
import { History, Trash2 } from 'lucide-react';
import { ChangeHistoryEntry, UserProfile } from '../../types';
import {
  SECTOR_TAG_STYLES,
  SOURCE_STYLES,
  STATUS_DOT,
  STATUS_STYLES,
  formatDate,
  formatDateTime,
  formatSignedCurrency,
  formatSignedDays,
  impactTone,
  isReviewable,
  sourceLabel,
  statusLabel,
} from './changeHistoryHelpers';

interface ChangeHistoryTableProps {
  entries: ChangeHistoryEntry[];
  projectMembers: UserProfile[];
  onOpen: (entry: ChangeHistoryEntry) => void;
  onDelete: (entry: ChangeHistoryEntry) => void;
  canDelete: boolean;
}

const badgeBase = 'text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border whitespace-nowrap inline-flex items-center gap-1';

export default function ChangeHistoryTable({ entries, projectMembers, onOpen, onDelete, canDelete }: ChangeHistoryTableProps) {
  const memberName = (entry: ChangeHistoryEntry) => entry.requestedByName || projectMembers.find((m) => m.uid === entry.requestedBy)?.name || 'Não informado';

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[360px] opacity-50">
        <History className="w-16 h-16 text-[#ff7f00] mb-4 stroke-1" />
        <h3 className="text-lg font-bold text-gray-900 uppercase tracking-widest mb-2">Nenhuma mudança registrada</h3>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center px-6">As alterações relevantes do projeto aparecerão aqui</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
      <table className="w-full min-w-[1040px] text-left border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200 text-gray-400 font-bold text-[10px] uppercase tracking-wider">
            <th className="p-4 w-32">ID / Contexto</th>
            <th className="p-4 w-28">Data</th>
            <th className="p-4">Título / Setor</th>
            <th className="p-4 w-40">Solicitante</th>
            <th className="p-4 w-36">Impactos</th>
            <th className="p-4 w-32">Status</th>
            <th className="p-4 w-40">Decisão</th>
            <th className="p-4 w-28" />
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const isManual = entry.origin === 'manual';
            const reviewable = isReviewable(entry);
            const context = sourceLabel(entry);
            const contextStyle = isManual ? 'bg-orange-50 text-[#ff7f00] border-orange-200' : SOURCE_STYLES[entry.source || 'Plataforma'];

            return (
              <tr key={entry.id} onClick={() => onOpen(entry)} className="border-b border-gray-100 hover:bg-gray-50 transition-colors group align-top cursor-pointer">
                <td className="p-4">
                  <div className="flex flex-col gap-1 items-start">
                    {isManual && <span className="font-bold text-gray-900 text-xs font-mono">CR-{entry.id.slice(0, 5).toUpperCase()}</span>}
                    <span className={clsx(badgeBase, contextStyle)}>{context}</span>
                  </div>
                </td>
                <td className="p-4"><span className="text-gray-500 text-xs font-bold font-mono whitespace-nowrap">{formatDate(entry.createdAt)}</span></td>
                <td className="p-4">
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-gray-900 text-sm leading-snug">{entry.title}</span>
                    {entry.sector && <span className={clsx(badgeBase, SECTOR_TAG_STYLES[entry.sector], 'w-fit')}>{entry.sector}</span>}
                  </div>
                </td>
                <td className="p-4"><span className="font-bold text-gray-900 text-sm">{memberName(entry)}</span></td>
                <td className="p-4">
                  <div className="flex flex-col gap-1">
                    <span className={clsx('text-xs font-bold tabular-nums', impactTone(entry.impactDays || 0))}>{formatSignedDays(entry.impactDays || 0)}</span>
                    <span className={clsx('text-xs font-bold tabular-nums', impactTone(entry.impactAmount || 0))}>{entry.impactAmount ? formatSignedCurrency(entry.impactAmount) : '—'}</span>
                  </div>
                </td>
                <td className="p-4"><span className={clsx(badgeBase, STATUS_STYLES[entry.status])}><span className={clsx('w-1.5 h-1.5 rounded-full', STATUS_DOT[entry.status])} />{statusLabel(entry.status)}</span></td>
                <td className="p-4">
                  {entry.decidedAt ? <div className="flex flex-col gap-0.5"><span className="text-[11px] font-bold text-gray-700 whitespace-nowrap">{formatDate(entry.decidedAt)}</span><span className="text-[10px] text-gray-400">{entry.decidedByName || 'Decidido'}</span></div> : <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">—</span>}
                </td>
                <td className="p-4">
                  <div className="flex justify-end gap-2">
                    <button onClick={(e) => { e.stopPropagation(); onOpen(entry); }} className={clsx('px-3 py-2 border font-bold uppercase tracking-widest text-[10px] rounded-lg transition-colors', reviewable ? 'bg-[#ff7f00] border-[#ff7f00] text-white hover:bg-orange-600' : 'bg-white border-gray-300 text-gray-700 hover:border-[#ff7f00] hover:text-[#ff7f00]')}>
                      {reviewable ? 'Avaliar' : 'Abrir'}
                    </button>
                    {canDelete && <button onClick={(e) => { e.stopPropagation(); onDelete(entry); }} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-colors" title="Excluir registro"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
