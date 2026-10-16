import React from 'react';
import { StatusReport, UserProfile } from '../../types';
import { groupReportsByMonth } from './statusReportHelpers';
import StatusReportCard from './StatusReportCard';

interface StatusReportTimelineProps {
  reports: StatusReport[];
  projectMembers: UserProfile[];
  onEdit: (report: StatusReport) => void;
  onDelete: (report: StatusReport) => void;
  onToggleApproval: (report: StatusReport) => void;
  onToggleActionItem: (report: StatusReport, actionItemId: string) => void;
  onOpenImpactEvaluation: (report: StatusReport) => void;
  canApprove: boolean;
}

export default function StatusReportTimeline({
  reports,
  projectMembers,
  onEdit,
  onDelete,
  onToggleApproval,
  onToggleActionItem,
  onOpenImpactEvaluation,
  canApprove,
}: StatusReportTimelineProps) {
  if (reports.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center shadow-sm">
        <p className="text-gray-500 text-sm font-medium">Nenhum report encontrado para os filtros selecionados.</p>
      </div>
    );
  }

  const groups = groupReportsByMonth(reports);

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.key} className="relative">
          <div className="flex items-center gap-3 mb-3 sticky top-0 bg-[#f8f9fa] py-1 z-[1]">
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-widest whitespace-nowrap">
              {group.label}
            </h3>
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
              {group.reports.length} {group.reports.length === 1 ? 'REPORT' : 'REPORTS'}
            </span>
          </div>

          <div className="relative pl-4 border-l-2 border-gray-100 space-y-3">
            {group.reports.map((report) => (
              <div key={report.id} className="relative">
                <span className="absolute -left-[21px] top-4 w-2.5 h-2.5 rounded-full bg-[#ff7f00] border-2 border-white shadow" />
                <StatusReportCard
                  report={report}
                  projectMembers={projectMembers}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onToggleApproval={onToggleApproval}
                  onToggleActionItem={onToggleActionItem}
                  onOpenImpactEvaluation={onOpenImpactEvaluation}
                  canApprove={canApprove}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
