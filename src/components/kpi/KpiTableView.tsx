import React from 'react';
import { Edit2, Trash2, LineChart } from 'lucide-react';
import { ProjectKPI, UserProfile, KpiSector } from '../../types';
import {
  KPI_SECTORS,
  KPI_STATUS_STYLES,
  formatTarget,
  formatCurrent,
  computeProgress,
  formatDate,
} from './kpiHelpers';

interface KpiTableViewProps {
  kpis: ProjectKPI[];
  projectMembers: UserProfile[];
  onEdit: (kpi: ProjectKPI) => void;
  onDelete: (kpi: ProjectKPI) => void;
  onQuickUpdate: (kpi: ProjectKPI) => void;
  onEvolution?: (kpi: ProjectKPI) => void;
}

export default function KpiTableView({ kpis, projectMembers, onEdit, onDelete, onQuickUpdate, onEvolution }: KpiTableViewProps) {
  const grouped: Record<string, ProjectKPI[]> = {};
  KPI_SECTORS.forEach((sector) => {
    const items = kpis.filter((k) => k.sector === sector);
    if (items.length > 0) grouped[sector] = items;
  });

  const sectors = Object.keys(grouped) as KpiSector[];

  if (sectors.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
        <p className="text-gray-500 text-sm font-medium">Nenhum KPI encontrado para os filtros selecionados.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sectors.map((sector) => (
        <div key={sector} className="bg-white rounded-xl border border-gray-200 overflow-x-auto shadow-sm">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-widest">{sector}</h3>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              {grouped[sector].length} KPI(s)
            </span>
          </div>
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest min-w-[200px]">Nome do KPI</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-32 text-center">Meta</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-56">Valor Atual</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-32 text-center">Prazo</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-24 text-center">Responsável</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-32 text-center">Status</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-24 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {grouped[sector].map((kpi) => {
                const member = projectMembers.find((m) => m.uid === kpi.responsible);
                const progress = computeProgress(kpi);
                const statusStyle = KPI_STATUS_STYLES[kpi.status];

                return (
                  <tr key={kpi.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-2.5">
                      <span className="font-bold text-sm text-gray-900 line-clamp-1" title={kpi.name}>{kpi.name}</span>
                      {kpi.description && (
                        <p className="text-xs text-gray-500 line-clamp-1" title={kpi.description}>{kpi.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2.5 py-0.5 rounded whitespace-nowrap">
                        {formatTarget(kpi)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onQuickUpdate(kpi)}
                          className="text-xs font-bold text-gray-900 hover:text-[#ff7f00] transition-colors whitespace-nowrap"
                          title="Atualizar valor rapidamente"
                        >
                          {formatCurrent(kpi)}
                        </button>
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[60px]">
                          <div className={`h-full rounded-full ${statusStyle.bar}`} style={{ width: `${progress}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-gray-400 shrink-0">{progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center text-xs text-gray-600 font-semibold whitespace-nowrap">
                      {formatDate(kpi.deadline)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {member ? (
                        <div className="flex justify-center items-center" title={member.name}>
                          <div className="w-6 h-6 rounded-full overflow-hidden border border-gray-200 bg-white shrink-0">
                            {member.photoURL ? (
                              <img src={member.photoURL} alt={member.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-gray-400 bg-gray-50">
                                {member.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`px-2.5 py-0.5 rounded text-xs font-bold border whitespace-nowrap ${statusStyle.badge}`}>
                        {kpi.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-2">
                        {onEvolution && (
                          <button
                            onClick={() => onEvolution(kpi)}
                            className="p-1 bg-white border border-gray-200 hover:bg-orange-50 text-gray-400 hover:text-[#ff7f00] rounded transition-all shadow-sm"
                            title="Ver evolução"
                          >
                            <LineChart className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => onEdit(kpi)}
                          className="p-1 bg-white border border-gray-200 hover:bg-orange-50 text-gray-400 hover:text-[#ff7f00] rounded transition-all shadow-sm"
                          title="Editar"
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
