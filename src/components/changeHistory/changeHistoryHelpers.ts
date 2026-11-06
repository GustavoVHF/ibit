import { ChangeHistoryEntry, ChangeSector, ChangeSource, ChangeStatus } from '../../types';
import { getLocale, getMessages, STORED_DATA_LOCALE } from '../../i18n';

export const CHANGE_SECTORS: ChangeSector[] = ['Engenharia', 'Marketing', 'Financeiro', 'Design', 'Gestão'];
export const CHANGE_STATUSES: ChangeStatus[] = ['Pendente', 'Aprovado', 'Recusado', 'Postergado'];

// label is resolved on read so it follows the current language.
export const DECISION_OPTIONS: { status: ChangeStatus; readonly label: string }[] = [
  { status: 'Aprovado', get label() { return getMessages().changes.decisionApprove; } },
  { status: 'Recusado', get label() { return getMessages().changes.decisionReject; } },
  { status: 'Postergado', get label() { return getMessages().changes.decisionPostpone; } },
];

export const SECTOR_TAG_STYLES: Record<ChangeSector, string> = {
  Engenharia: 'bg-orange-50 text-[#ff7f00] border-orange-200',
  Marketing: 'bg-blue-50 text-blue-600 border-blue-200',
  Financeiro: 'bg-green-50 text-green-600 border-green-200',
  Design: 'bg-pink-50 text-pink-600 border-pink-200',
  Gestão: 'bg-gray-100 text-gray-600 border-gray-200',
};

export const STATUS_STYLES: Record<ChangeStatus, string> = {
  Registrado: 'bg-gray-100 text-gray-500 border-gray-200',
  Pendente: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  Aprovado: 'bg-green-50 text-green-600 border-green-200',
  Recusado: 'bg-red-50 text-red-600 border-red-200',
  Postergado: 'bg-indigo-50 text-indigo-600 border-indigo-200',
  // Mantido somente para renderizar registros legados.
  Prolongado: 'bg-indigo-50 text-indigo-600 border-indigo-200',
};

export const STATUS_DOT: Record<ChangeStatus, string> = {
  Registrado: 'bg-gray-400',
  Pendente: 'bg-yellow-500',
  Aprovado: 'bg-green-500',
  Recusado: 'bg-red-500',
  Postergado: 'bg-indigo-500',
  Prolongado: 'bg-indigo-500',
};

export const SOURCE_STYLES: Record<ChangeSource, string> = {
  Gantt: 'bg-indigo-50 text-indigo-600 border-indigo-200',
  Kanban: 'bg-blue-50 text-blue-600 border-blue-200',
  'Status Reports': 'bg-teal-50 text-teal-600 border-teal-200',
  Orçamento: 'bg-green-50 text-green-600 border-green-200',
  KPIs: 'bg-violet-50 text-violet-600 border-violet-200',
  RACI: 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200',
  Riscos: 'bg-red-50 text-red-600 border-red-200',
  Inventário: 'bg-cyan-50 text-cyan-600 border-cyan-200',
  Plataforma: 'bg-gray-100 text-gray-500 border-gray-200',
};

export function statusLabel(status: ChangeStatus): string {
  return getMessages().enums.changeStatus[status === 'Prolongado' ? 'Postergado' : status];
}

export function sourceLabel(entry: ChangeHistoryEntry): string {
  return entry.source ? getMessages().enums.changeSource[entry.source] ?? entry.source : getMessages().changes.directRequest;
}

export function toJsDate(timestamp: any): Date | null {
  if (!timestamp) return null;
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return isNaN(date.getTime()) ? null : date;
}

export function formatDate(timestamp: any): string {
  const date = toJsDate(timestamp);
  return date ? date.toLocaleDateString(getLocale()) : '-';
}

export function formatDateTime(timestamp: any): string {
  const date = toJsDate(timestamp);
  if (!date) return '-';
  const locale = getLocale();
  return getMessages().changes.dateTime(date.toLocaleDateString(locale), date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }));
}

/** Same as formatDateTime, but always in Portuguese: used for text written to Firestore. */
export function formatDateTimeStored(timestamp: any): string {
  const date = toJsDate(timestamp);
  if (!date) return '-';
  return `${date.toLocaleDateString(STORED_DATA_LOCALE)} às ${date.toLocaleTimeString(STORED_DATA_LOCALE, { hour: '2-digit', minute: '2-digit' })}`;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat(getLocale(), { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatSignedCurrency(value: number): string {
  if (!value) return formatCurrency(0);
  return `${value > 0 ? '+' : '-'}${formatCurrency(Math.abs(value))}`;
}

export function formatSignedDays(days: number): string {
  if (!days) return '—';
  return `${days > 0 ? '+' : '-'}${Math.abs(days)}d`;
}

export function impactTone(value: number): string {
  if (value > 0) return 'text-red-600';
  if (value < 0) return 'text-green-600';
  return 'text-gray-400';
}

export interface ChangeHistoryTotals {
  total: number;
  pending: number;
  approved: number;
  approvedDays: number;
  approvedAmount: number;
}

export function computeTotals(entries: ChangeHistoryEntry[]): ChangeHistoryTotals {
  return entries.reduce<ChangeHistoryTotals>(
    (acc, entry) => {
      acc.total += 1;
      if (entry.status === 'Pendente') acc.pending += 1;
      if (entry.status === 'Aprovado') acc.approved += 1;
      if (entry.origin === 'auto' || entry.status === 'Aprovado') {
        acc.approvedDays += entry.impactDays || 0;
        acc.approvedAmount += entry.impactAmount || 0;
      }
      return acc;
    },
    { total: 0, pending: 0, approved: 0, approvedDays: 0, approvedAmount: 0 }
  );
}

export function isReviewable(entry: ChangeHistoryEntry): boolean {
  return entry.origin === 'manual' && entry.status === 'Pendente';
}
