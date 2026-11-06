import React from 'react';
import { Edit2, Trash2, LineChart } from 'lucide-react';
import { ProjectKPI, UserProfile } from '../../types';
import {
  KPI_STATUS_STYLES,
  KPI_SECTOR_COLORS,
  formatTarget,
  formatCurrent,
  computeProgress,
  formatDate,
} from './kpiHelpers';
import { useI18n } from '../../i18n/LanguageContext';

interface KpiCardsViewProps {
  kpis: ProjectKPI[];
  projectMembers: UserProfile[];
  onEdit: (kpi: ProjectKPI) => void;
  onDelete: (kpi: ProjectKPI) => void;
  onQuickUpdate: (kpi: ProjectKPI) => void;
  onEvolution?: (kpi: ProjectKPI) => void;
}

export default function KpiCardsView({ kpis, projectMembers, onEdit, onDelete, onQuickUpdate, onEvolution }: KpiCardsViewProps) {
  const { t } = useI18n();
  if (kpis.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
        <p className="text-gray-500 text-sm font-medium">{t.kpi.emptyFiltered}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {kpis.map((kpi) => {
        const member = projectMembers.find((m) => m.uid === kpi.responsible);
        const progress = computeProgress(kpi);
        const statusStyle = KPI_STATUS_STYLES[kpi.status];
        const sectorColor = KPI_SECTOR_COLORS[kpi.sector];

        return (
          <div
            key={kpi.id}
            className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-[#ff7f00] transition-all flex flex-col"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: sectorColor }}
                />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">
                  {t.enums.kpiSector[kpi.sector] ?? kpi.sector}
                </span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${statusStyle.badge}`}>
                {t.enums.kpiStatus[kpi.status] ?? kpi.status}
              </span>
            </div>

            <h3 className="text-sm font-bold text-gray-900 mb-0.5 line-clamp-2" title={kpi.name}>
              {kpi.name}
            </h3>
            {kpi.description && (
              <p className="text-xs text-gray-500 line-clamp-2 mb-2" title={kpi.description}>
                {kpi.description}
              </p>
            )}

            <div className="mt-auto space-y-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <button
                    onClick={() => onQuickUpdate(kpi)}
                    className="text-sm font-bold text-gray-900 hover:text-[#ff7f00] transition-colors cursor-pointer"
                    title={t.kpi.quickUpdateTitle}
                  >
                    {formatCurrent(kpi)}
                  </button>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    {t.kpi.targetPrefix} {formatTarget(kpi)}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${statusStyle.bar}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500 font-semibold">
                  {formatDate(kpi.deadline)}
                </span>
                <div className="flex items-center gap-1.5">
                  {member && (
                    <div
                      className="w-6 h-6 rounded-full overflow-hidden border border-gray-200 bg-white shrink-0"
                      title={member.name}
                    >
                      {member.photoURL ? (
                        <img src={member.photoURL} alt={member.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-gray-400 bg-gray-50">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  )}
                  {onEvolution && (
                    <button
                      onClick={() => onEvolution(kpi)}
                      className="p-1 bg-white border border-gray-200 hover:bg-orange-50 text-gray-400 hover:text-[#ff7f00] rounded transition-all shadow-sm"
                      title={t.kpi.viewEvolution}
                    >
                      <LineChart className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => onEdit(kpi)}
                    className="p-1 bg-white border border-gray-200 hover:bg-orange-50 text-gray-400 hover:text-[#ff7f00] rounded transition-all shadow-sm"
                    title={t.kpi.edit}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(kpi)}
                    className="p-1 bg-white border border-gray-200 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded transition-all shadow-sm"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
