import React from 'react';
import { MapPin, Clock, CheckCircle2, Circle, Paperclip, Edit2, Trash2, CalendarClock, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import { StatusReport, UserProfile } from '../../types';
import { IMPACT_STATUS_DOT, SECTOR_TAG_STYLES, formatTime, formatWeekday, formatNextMeetingTag, toJsDate } from './statusReportHelpers';
import StarRating from './StarRating';
import { useI18n } from '../../i18n/LanguageContext';

interface StatusReportCardProps {
  report: StatusReport;
  projectMembers: UserProfile[];
  onEdit: (report: StatusReport) => void;
  onDelete: (report: StatusReport) => void;
  onToggleApproval: (report: StatusReport) => void;
  onToggleActionItem: (report: StatusReport, actionItemId: string) => void;
  onOpenImpactEvaluation: (report: StatusReport) => void;
  canApprove: boolean;
}

export default function StatusReportCard({
  report,
  projectMembers,
  onEdit,
  onDelete,
  onToggleApproval,
  onToggleActionItem,
  onOpenImpactEvaluation,
  canApprove,
}: StatusReportCardProps) {
  const { t } = useI18n();
  const participants = projectMembers.filter((m) => report.participants?.includes(m.uid));
  const actionItems = report.actionItems || [];
  const impactStatus = report.impactStatus || 'Pendente de Avaliação';
  const nextMeetingTag = report.nextMeeting?.scheduled && report.nextMeeting.date
    ? formatNextMeetingTag(report.nextMeeting.date)
    : null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow relative">
      {/* Avaliação de Progresso (topo) */}
      <div className="flex items-center justify-between mb-2.5">
        <button
          onClick={() => onOpenImpactEvaluation(report)}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-gray-200 bg-white text-gray-600 hover:border-[#ff7f00] hover:text-[#ff7f00] transition-colors"
        >
          <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', IMPACT_STATUS_DOT[impactStatus])} />
          <TrendingUp className="w-3 h-3" />
          {t.statusReports.progressEvaluation}
        </button>

        {nextMeetingTag && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-gray-500 bg-gray-50 border border-gray-200 px-2 py-1 rounded-full whitespace-nowrap">
            <CalendarClock className="w-3 h-3" />
            {t.statusReports.nextMeeting(nextMeetingTag)}
          </span>
        )}
      </div>

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex flex-col items-center justify-center w-11 h-11 bg-gray-50 border border-gray-200 rounded-lg shrink-0">
            <span className="text-[9px] font-bold text-gray-400 uppercase leading-none">{formatWeekday(report.date)}</span>
            <span className="text-sm font-bold text-gray-900 leading-none mt-0.5">{toJsDate(report.date) ? String(toJsDate(report.date)!.getDate()).padStart(2, '0') : '-'}</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={clsx('px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap', SECTOR_TAG_STYLES[report.sector])}>
                {t.enums.statusReportSector[report.sector] ?? report.sector}
              </span>
              <span className="flex items-center gap-1 text-[11px] text-gray-500 font-semibold">
                <Clock className="w-3 h-3" />
                {formatTime(report.date)}
              </span>
              <span className="flex items-center gap-1 text-[11px] text-gray-500 font-semibold truncate">
                <MapPin className="w-3 h-3 shrink-0" />
                {report.location}
              </span>
            </div>
            <h3 className="text-sm font-bold text-gray-900 mt-1 line-clamp-1" title={report.agenda}>
              {report.agenda}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onEdit(report)}
            className="p-1 bg-white border border-gray-200 hover:bg-orange-50 text-gray-400 hover:text-[#ff7f00] rounded transition-all shadow-sm"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(report)}
            className="p-1 bg-white border border-gray-200 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded transition-all shadow-sm"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Participantes */}
      {participants.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex -space-x-2">
            {participants.slice(0, 6).map((m) => (
              <div key={m.uid} className="relative inline-block" title={m.name}>
                {m.photoURL ? (
                  <img src={m.photoURL} alt={m.name} className="w-6 h-6 rounded-full border-2 border-white object-cover" />
                ) : (
                  <div className="w-6 h-6 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-[9px] font-bold text-gray-600 uppercase">
                    {m.name.charAt(0)}
                  </div>
                )}
              </div>
            ))}
          </div>
          <span className="text-[11px] text-gray-400 font-medium truncate">
            {participants.map((m) => m.name).join(', ')}
          </span>
        </div>
      )}

      {/* Registros / Ata */}
      {report.minutes && (
        <p className="text-xs text-gray-600 leading-relaxed mb-3 line-clamp-3" title={report.minutes}>
          {report.minutes}
        </p>
      )}

      {(report.outcome || !!report.outcomeRating) && (
        <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 mb-3">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t.statusReports.outcomeReached}</span>
            {!!report.outcomeRating && <StarRating value={report.outcomeRating} readOnly />}
          </div>
          {report.outcome && <p className="text-xs text-gray-700 font-medium line-clamp-2">{report.outcome}</p>}
        </div>
      )}

      {/* Action Items */}
      {actionItems.length > 0 && (
        <div className="mb-3">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">{t.statusReports.actionPlans}</span>
          <div className="space-y-1">
            {actionItems.map((item) => {
              const responsible = projectMembers.find((m) => m.uid === item.responsible);
              return (
                <button
                  key={item.id}
                  onClick={() => onToggleActionItem(report, item.id)}
                  className="w-full flex items-center gap-2 text-left group"
                >
                  {item.done ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-gray-300 shrink-0 group-hover:text-[#ff7f00] transition-colors" />
                  )}
                  <span className={clsx('text-xs font-medium truncate min-w-0', item.done ? 'text-gray-400 line-through' : 'text-gray-700')}>
                    {item.task}
                  </span>
                  {responsible && (
                    <span className="flex items-center gap-1 shrink-0">
                      <span className="w-1 h-1 rounded-full bg-gray-300 shrink-0" />
                      {responsible.photoURL ? (
                        <img src={responsible.photoURL} alt={responsible.name} className="w-4 h-4 rounded-full object-cover shrink-0" />
                      ) : (
                        <span className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[7px] font-bold text-gray-500 uppercase shrink-0">
                          {responsible.name.charAt(0)}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400 font-bold whitespace-nowrap">{responsible.name}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Anexos */}
      {report.attachments && report.attachments.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          {report.attachments.map((att, i) => (
            <a
              key={i}
              href={att.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100 hover:bg-blue-100 transition-colors truncate max-w-[140px]"
              title={att.name}
            >
              <Paperclip className="w-3 h-3 shrink-0" />
              <span className="truncate">{att.name}</span>
            </a>
          ))}
        </div>
      )}

      {/* Status de Conclusão */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <button
          onClick={() => canApprove && onToggleApproval(report)}
          disabled={!canApprove}
          className={clsx(
            'flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border transition-colors',
            report.approved
              ? 'bg-green-50 text-green-600 border-green-200'
              : 'bg-yellow-50 text-yellow-700 border-yellow-200',
            canApprove && 'hover:opacity-80 cursor-pointer'
          )}
        >
          {report.approved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
          {report.approved ? t.statusReports.done : t.statusReports.pending}
        </button>
      </div>
    </div>
  );
}
