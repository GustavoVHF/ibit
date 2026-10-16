import { ImpactStatus, StatusReport, StatusReportSector } from '../../types';

export const STATUS_REPORT_SECTORS: StatusReportSector[] = [
  'Geral',
  'Marketing',
  'Engenharia',
  'Financeiro',
  'Design',
  'Projeto Social',
];

export const SECTOR_TAG_STYLES: Record<StatusReportSector, string> = {
  'Geral': 'bg-gray-100 text-gray-600 border-gray-200',
  'Marketing': 'bg-blue-50 text-blue-600 border-blue-200',
  'Engenharia': 'bg-orange-50 text-[#ff7f00] border-orange-200',
  'Financeiro': 'bg-green-50 text-green-600 border-green-200',
  'Design': 'bg-pink-50 text-pink-600 border-pink-200',
  'Projeto Social': 'bg-teal-50 text-teal-600 border-teal-200',
};

export const IMPACT_STATUSES: ImpactStatus[] = [
  'Pendente de Avaliação',
  'Alto Impacto',
  'Impacto Moderado',
  'Sem Impacto',
];

export const IMPACT_STATUS_STYLES: Record<ImpactStatus, string> = {
  'Alto Impacto': 'bg-green-50 text-green-600 border-green-200',
  'Impacto Moderado': 'bg-yellow-50 text-yellow-700 border-yellow-200',
  'Sem Impacto': 'bg-red-50 text-red-600 border-red-200',
  'Pendente de Avaliação': 'bg-gray-100 text-gray-500 border-gray-200',
};

export const IMPACT_STATUS_DOT: Record<ImpactStatus, string> = {
  'Alto Impacto': 'bg-green-500',
  'Impacto Moderado': 'bg-yellow-500',
  'Sem Impacto': 'bg-red-500',
  'Pendente de Avaliação': 'bg-gray-400',
};

export function toJsDate(timestamp: any): Date | null {
  if (!timestamp) return null;
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return isNaN(date.getTime()) ? null : date;
}

export function formatDate(timestamp: any): string {
  const date = toJsDate(timestamp);
  return date ? date.toLocaleDateString('pt-BR') : '-';
}

export function formatTime(timestamp: any): string {
  const date = toJsDate(timestamp);
  return date ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-';
}

export function formatWeekday(timestamp: any): string {
  const date = toJsDate(timestamp);
  if (!date) return '';
  return date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase();
}

/** Groups reports (already sorted desc by date) into month buckets for the timeline view. */
export function groupReportsByMonth(reports: StatusReport[]): { key: string; label: string; reports: StatusReport[] }[] {
  const groups: Record<string, { label: string; reports: StatusReport[] }> = {};

  reports.forEach((report) => {
    const date = toJsDate(report.date);
    const key = date ? `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}` : 'sem-data';
    const label = date
      ? date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()
      : 'SEM DATA';

    if (!groups[key]) groups[key] = { label, reports: [] };
    groups[key].reports.push(report);
  });

  return Object.entries(groups)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, value]) => ({ key, ...value }));
}

export function generateActionItemId(): string {
  return `ai-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export function generateEvaluationId(): string {
  return `ev-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

/** Days remaining until a date (negative if in the past). */
export function daysUntil(timestamp: any): number | null {
  const date = toJsDate(timestamp);
  if (!date) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/** Builds the discreet "Próx. Reunião" tag text, e.g. "25/11 - Em 15 dias" or "25/11 - Hoje". */
export function formatNextMeetingTag(timestamp: any): string {
  const date = toJsDate(timestamp);
  if (!date) return '';
  const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const days = daysUntil(timestamp);
  if (days === null) return dateStr;
  if (days === 0) return `${dateStr} - Hoje`;
  if (days < 0) return `${dateStr} - Atrasada`;
  return `${dateStr} - Em ${days} ${days === 1 ? 'dia' : 'dias'}`;
}
