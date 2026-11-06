import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileHeader from './MobileHeader';
import MobileToolsDrawer from './MobileToolsDrawer';
import { db } from '../firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  documentId,
  arrayUnion,
} from 'firebase/firestore';
import { Project, ProjectKPI, UserProfile, KpiSector, KpiStatus } from '../types';
import {
  Plus,
  Search,
  X,
  AlertTriangle,
  Loader2,
  LayoutGrid,
  Table as TableIcon,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import { logFirestoreError, OperationType } from '../utils/errorHandlers';
import { commitWrite, friendlyWriteError } from '../utils/firestoreWrite';
import { logAutomaticChange } from '../utils/changeHistory';
import { motion, AnimatePresence } from 'motion/react';
import ExportButton from './export/ExportButton';
import { exportToExcel } from '../utils/export/excelEngine';
import {
  buildOfficialHeaderHTML,
  buildOfficialFooterHTML,
  captureContainerAsPdf,
  PdfExportOptions,
} from '../utils/export/pdfEngine';
// @ts-ignore
import logoIbit from '../media/ibitlogo.svg';

import KpiSummaryCards from './kpi/KpiSummaryCards';
import KpiStatsPanel from './kpi/KpiStatsPanel';
import KpiCharts from './kpi/KpiCharts';
import KpiCardsView from './kpi/KpiCardsView';
import KpiTableView from './kpi/KpiTableView';
import KpiFormModal from './kpi/KpiFormModal';
import KpiQuickUpdate from './kpi/KpiQuickUpdate';
import KpiHistoryModal from './kpi/KpiHistoryModal';
import {
  KPI_SECTORS,
  KPI_STATUSES,
  KPI_STATUS_STYLES,
  formatTarget,
  formatCurrent,
  formatDate,
} from './kpi/kpiHelpers';
import { useI18n } from '../i18n/LanguageContext';

type ViewMode = 'visual' | 'table';

export default function KpiManagement() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, locale } = useI18n();

  const [project, setProject] = useState<Project | null>(null);
  const [kpis, setKpis] = useState<ProjectKPI[]>([]);
  const [projectMembers, setProjectMembers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [sectorFilter, setSectorFilter] = useState<KpiSector | 'Todos'>('Todos');
  const [statusFilter, setStatusFilter] = useState<KpiStatus | 'Todos'>('Todos');
  const [viewMode, setViewMode] = useState<ViewMode>('visual');

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProjectKPI | null>(null);
  const [itemToDelete, setItemToDelete] = useState<ProjectKPI | null>(null);
  const [quickUpdateItem, setQuickUpdateItem] = useState<ProjectKPI | null>(null);
  const [historyItem, setHistoryItem] = useState<ProjectKPI | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Fetch Project
  useEffect(() => {
    if (!projectId || !user) return;
    const projectRef = doc(db, 'projects', projectId);
    return onSnapshot(projectRef, (docSnap) => {
      if (docSnap.exists()) {
        setProject({ id: docSnap.id, ...docSnap.data() } as Project);
      } else {
        navigate('/dashboard');
      }
    });
  }, [projectId, user, navigate]);

  // Fetch KPIs
  useEffect(() => {
    if (!projectId) return;
    const qKpis = query(collection(db, 'projectKPIs'), where('projectId', '==', projectId));
    const unsub = onSnapshot(qKpis, (snapshot) => {
      const data: ProjectKPI[] = [];
      snapshot.forEach((d) => data.push({ id: d.id, ...d.data() } as ProjectKPI));
      data.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });
      setKpis(data);
      setLoading(false);
    });
    return () => unsub();
  }, [projectId]);

  // Fetch Project Members
  useEffect(() => {
    if (!project?.members || project.members.length === 0) return;
    const qMembers = query(
      collection(db, 'users'),
      where(documentId(), 'in', project.members.slice(0, 30))
    );
    return onSnapshot(qMembers, (snapshot) => {
      const membersData: UserProfile[] = [];
      snapshot.forEach((d) => membersData.push({ uid: d.id, ...d.data() } as UserProfile));
      setProjectMembers(membersData);
    });
  }, [project?.members?.join(',')]);

  const filteredKpis = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();
    return kpis.filter((kpi) => {
      if (sectorFilter !== 'Todos' && kpi.sector !== sectorFilter) return false;
      if (statusFilter !== 'Todos' && kpi.status !== statusFilter) return false;
      if (searchLower) {
        const member = projectMembers.find((m) => m.uid === kpi.responsible);
        const respName = member ? member.name.toLowerCase() : '';
        const matches =
          kpi.name.toLowerCase().includes(searchLower) ||
          (kpi.description && kpi.description.toLowerCase().includes(searchLower)) ||
          respName.includes(searchLower);
        if (!matches) return false;
      }
      return true;
    });
  }, [kpis, sectorFilter, statusFilter, searchQuery, projectMembers]);

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;
    try {
      await commitWrite(deleteDoc(doc(db, 'projectKPIs', itemToDelete.id)), { label: 'a exclusão do KPI' });
      setItemToDelete(null);
    } catch (error) {
      logFirestoreError(error, OperationType.DELETE, 'projectKPIs');
      alert(friendlyWriteError(error));
    }
  };

  const handleQuickUpdateSave = async (kpiId: string, newValue: number, note?: string) => {
    try {
      const historyEntry = { date: new Date(), value: newValue, note: note || null };
      await commitWrite(updateDoc(doc(db, 'projectKPIs', kpiId), {
        currentValue: newValue,
        history: arrayUnion(historyEntry),
        updatedAt: serverTimestamp(),
      }), { label: 'o KPI' });
      const kpi = kpis.find((item) => item.id === kpiId);
      if (kpi) {
        await logAutomaticChange({
          projectId,
          source: 'KPIs',
          title: `KPI "${kpi.name}" atualizado`,
          description: `Valor alterado de ${kpi.currentValue}${kpi.targetUnit ? ` ${kpi.targetUnit}` : ''} para ${newValue}${kpi.targetUnit ? ` ${kpi.targetUnit}` : ''}${note ? ` · ${note}` : ''}`,
          actorUid: user?.uid,
          actorName: user?.displayName || user?.email || undefined,
        });
      }
    } catch (error) {
      logFirestoreError(error, OperationType.UPDATE, 'projectKPIs');
      alert(friendlyWriteError(error));
      // KpiQuickUpdate aguarda esta função: relança para o modal continuar aberto.
      throw error;
    }
  };

  const handleExportExcel = async () => {
    await exportToExcel({
      filename: `kpis-${(project?.name || t.kpi.fileProject).replace(/\s+/g, '-')}-${new Date().toISOString().substring(0, 10)}.xlsx`,
      sheetName: 'KPIs',
      title: t.kpi.excelTitle(project?.name || t.common.project),
      columns: [
        { header: t.kpi.xlsSector, key: 'sector', type: 'string', width: 20, value: (row) => t.enums.kpiSector[row.sector] ?? row.sector },
        { header: t.kpi.xlsName, key: 'name', type: 'string', width: 34 },
        { header: t.kpi.xlsTarget, key: 'target', type: 'string', width: 16, value: (row) => formatTarget(row) },
        { header: t.kpi.xlsCurrent, key: 'current', type: 'string', width: 16, value: (row) => formatCurrent(row) },
        { header: t.kpi.xlsDeadline, key: 'deadline', type: 'date', width: 14, value: (row) => (row.deadline?.toDate ? row.deadline.toDate() : new Date(row.deadline)) },
        {
          header: t.kpi.xlsResponsible, key: 'responsible', type: 'string', width: 22,
          value: (row) => projectMembers.find((m) => m.uid === row.responsible)?.name || '-',
        },
        { header: t.kpi.xlsStatus, key: 'status', type: 'string', width: 16, value: (row) => t.enums.kpiStatus[row.status] ?? row.status },
      ],
      rows: filteredKpis,
    });
  };

  const handleExportPDF = async (options: PdfExportOptions) => {
    if (isExporting || filteredKpis.length === 0) return;
    setIsExporting(true);
    await new Promise((r) => setTimeout(r, 100));

    try {
      const TOTAL_W = 1900;
      const container = document.createElement('div');
      container.style.cssText = `position:fixed;left:0;top:0;background:#fff;padding:40px;font-family:'lufga','Inter',system-ui,-apple-system,sans-serif;width:${TOTAL_W}px;box-sizing:border-box;z-index:50;overflow:visible;`;
      document.body.appendChild(container);

      container.innerHTML = options.chrome
        ? buildOfficialHeaderHTML({
            title: project?.name || t.common.project,
            subtitle: t.kpi.pdfSubtitle,
            responsibleName: user?.displayName || undefined,
          })
        : '';

      const tableWrapper = document.createElement('div');
      tableWrapper.style.cssText = 'border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#fff;';

      const tableEl = document.createElement('table');
      tableEl.style.cssText = 'width:100%;border-collapse:collapse;font-size:10px;';

      const thStyle = 'padding:10px 8px;text-align:left;font-size:9px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid #e5e7eb;background:#f9fafb;';
      const tdStyle = 'padding:8px;vertical-align:top;font-size:10px;font-weight:600;color:#374151;border-bottom:1px solid #f3f4f6;';

      const headerHTML = `<thead><tr>
        <th style="${thStyle}width:14%;">${t.kpi.colSector}</th>
        <th style="${thStyle}width:22%;">KPI</th>
        <th style="${thStyle}width:12%;">${t.kpi.colTarget}</th>
        <th style="${thStyle}width:14%;">${t.kpi.colCurrent}</th>
        <th style="${thStyle}width:10%;">${t.kpi.colDeadline}</th>
        <th style="${thStyle}width:16%;">${t.kpi.colResponsible}</th>
        <th style="${thStyle}width:12%;">${t.kpi.colStatus}</th>
      </tr></thead>`;

      let bodyHTML = '<tbody>';
      filteredKpis.forEach((kpi, idx) => {
        const rowBg = idx % 2 === 0 ? '#ffffff' : '#fafafa';
        const member = projectMembers.find((m) => m.uid === kpi.responsible);
        bodyHTML += `<tr style="background:${rowBg};">
          <td style="${tdStyle}">${t.enums.kpiSector[kpi.sector] ?? kpi.sector}</td>
          <td style="${tdStyle}font-weight:800;color:#111827;">${kpi.name}</td>
          <td style="${tdStyle}">${formatTarget(kpi)}</td>
          <td style="${tdStyle}">${formatCurrent(kpi)}</td>
          <td style="${tdStyle}">${formatDate(kpi.deadline)}</td>
          <td style="${tdStyle}">${member?.name || '-'}</td>
          <td style="${tdStyle}">${t.enums.kpiStatus[kpi.status] ?? kpi.status}</td>
        </tr>`;
      });
      bodyHTML += '</tbody>';

      tableEl.innerHTML = headerHTML + bodyHTML;
      tableWrapper.appendChild(tableEl);
      container.appendChild(tableWrapper);

      if (options.chrome) {
        const footer = document.createElement('div');
        footer.innerHTML = buildOfficialFooterHTML(logoIbit, t.kpi.pdfFooter(new Date().toLocaleDateString(locale)));
        container.appendChild(footer);
      }

      await new Promise((r) => setTimeout(r, 400));

      await captureContainerAsPdf(container, {
        filename: `kpis-${(project?.name || t.kpi.fileProject).replace(/\s+/g, '-')}-${new Date().toISOString().substring(0, 10)}.pdf`,
        widthPx: options.widthPx,
        heightPx: options.heightPx,
        dpi: options.dpi,
        chrome: options.chrome,
      });

      document.body.removeChild(container);
    } catch (err) {
      console.error('[KPI Management PDF Export] Error:', err);
      alert(t.kpi.pdfError);
    } finally {
      setIsExporting(false);
    }
  };

  if (loading || !project) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#ff7f00] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#f8f9fa] overflow-hidden">
      <Sidebar projectId={projectId} projectName={project?.name} />

      <MobileToolsDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        projectId={projectId!}
        projectName={project?.name}
      />

      <main className="flex-1 flex flex-col min-w-0">
        <MobileHeader
          projectName={project?.name}
          projectPhotoURL={project?.photoURL || undefined}
          onOpenDrawer={() => setIsDrawerOpen(true)}
        />

        <header className="hidden lg:flex border-b border-gray-200 bg-white p-4 items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden border border-gray-100 shrink-0">
              {project?.photoURL ? (
                <img src={project.photoURL} alt={project.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl">🏎️</span>
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-wider uppercase leading-tight text-gray-900">
                {project?.name || t.common.loading} {project?.shortId && `- #${project.shortId}`}
              </h2>
            </div>

            <div className="flex items-center ml-4">
              <div className="flex -space-x-2 mr-3">
                {projectMembers.map((member) => (
                  <div key={member.uid} className="relative inline-block" title={member?.name}>
                    {member?.photoURL ? (
                      <img src={member.photoURL} alt={member.name} className="w-8 h-8 rounded-full border-2 border-white object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 uppercase">
                        {member?.name?.charAt(0) || '?'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-1 border border-gray-200 rounded-md">
                {project?.members.length || 0} {t.common.membersCount(project?.members.length || 0)}
              </span>
            </div>
          </div>
        </header>

        {/* Subheader / Filtros e Ações */}
        <div className="bg-white border-b border-gray-100 px-3 sm:px-6 py-2.5 flex flex-col gap-2.5 shrink-0 shadow-sm z-10">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 min-w-0">
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={t.kpi.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 focus:outline-none focus:border-[#ff7f00] text-sm font-medium rounded-lg transition-all"
                />
              </div>

              <select
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value as KpiSector | 'Todos')}
                className="bg-gray-50 border border-gray-200 focus:outline-none focus:border-[#ff7f00] text-xs font-bold uppercase tracking-wider rounded-lg px-3 py-2 text-gray-700"
              >
                <option value="Todos">{t.kpi.allSectors}</option>
                {KPI_SECTORS.map((s) => (
                  <option key={s} value={s}>{t.enums.kpiSector[s]}</option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as KpiStatus | 'Todos')}
                className="bg-gray-50 border border-gray-200 focus:outline-none focus:border-[#ff7f00] text-xs font-bold uppercase tracking-wider rounded-lg px-3 py-2 text-gray-700"
              >
                <option value="Todos">{t.kpi.allStatuses}</option>
                {KPI_STATUSES.map((s) => (
                  <option key={s} value={s}>{t.enums.kpiStatus[s]}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 shrink-0">
              {/* Alternador de Exibição */}
              <div className="flex bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setViewMode('visual')}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold text-xs uppercase tracking-widest transition-all',
                    viewMode === 'visual' ? 'bg-white text-[#ff7f00] shadow-sm' : 'text-gray-500 hover:text-gray-900'
                  )}
                  title={t.kpi.viewCards}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold text-xs uppercase tracking-widest transition-all',
                    viewMode === 'table' ? 'bg-white text-[#ff7f00] shadow-sm' : 'text-gray-500 hover:text-gray-900'
                  )}
                  title={t.kpi.viewTable}
                >
                  <TableIcon className="w-4 h-4" />
                </button>
              </div>

              <ExportButton
                formats={['pdf', 'excel']}
                title={t.kpi.exportTitle}
                onExportPdf={handleExportPDF}
                onExportExcel={handleExportExcel}
                disabledFormats={{ pdf: filteredKpis.length === 0, excel: filteredKpis.length === 0 }}
                compact
              />

              <button
                onClick={() => { setEditingItem(null); setIsFormOpen(true); }}
                className="bg-[#ff7f00] hover:bg-orange-600 text-white px-4 sm:px-5 py-2 flex items-center justify-center gap-2 transition-all font-bold uppercase tracking-widest text-xs rounded-lg active:scale-95 shadow-md shadow-orange-100"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">{t.kpi.newKpi}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 sm:p-5 scrollbar-hide mobile-pb-nav space-y-4">
          {/* Cards de Métricas Resumidas */}
          <KpiSummaryCards kpis={filteredKpis} />

          {viewMode === 'visual' ? (
            <>
              <KpiStatsPanel kpis={filteredKpis} />
              <KpiCharts kpis={filteredKpis} />
              <KpiCardsView
                kpis={filteredKpis}
                projectMembers={projectMembers}
                onEdit={(kpi) => { setEditingItem(kpi); setIsFormOpen(true); }}
                onDelete={(kpi) => setItemToDelete(kpi)}
                onQuickUpdate={(kpi) => setQuickUpdateItem(kpi)}
                onEvolution={(kpi) => setHistoryItem(kpi)}
              />
            </>
          ) : (
            <KpiTableView
              kpis={filteredKpis}
              projectMembers={projectMembers}
              onEdit={(kpi) => { setEditingItem(kpi); setIsFormOpen(true); }}
              onDelete={(kpi) => setItemToDelete(kpi)}
              onQuickUpdate={(kpi) => setQuickUpdateItem(kpi)}
              onEvolution={(kpi) => setHistoryItem(kpi)}
            />
          )}
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {itemToDelete && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
            >
              <div className="p-6">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 mx-auto">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-center text-gray-900 mb-2">{t.kpi.deleteTitle}</h3>
                <p className="text-gray-500 text-center text-sm mb-6">
                  {t.kpi.deleteBefore}<strong>{itemToDelete.name}</strong>{t.kpi.deleteAfter}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setItemToDelete(null)}
                    className="flex-1 py-2.5 bg-gray-50 text-gray-700 font-bold text-sm uppercase tracking-wider rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    onClick={handleDeleteItem}
                    className="flex-1 py-2.5 bg-red-600 text-white font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-red-700 transition-colors"
                  >
                    {t.common.delete}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isFormOpen && (
          <KpiFormModal
            isOpen={isFormOpen}
            onClose={() => setIsFormOpen(false)}
            projectId={projectId!}
            ownerId={user!.uid}
            item={editingItem}
            projectMembers={projectMembers}
            defaultSector={sectorFilter !== 'Todos' ? sectorFilter : undefined}
          />
        )}
      </AnimatePresence>

      {/* Quick Update Popover */}
      <AnimatePresence>
        {quickUpdateItem && (
          <KpiQuickUpdate
            kpi={quickUpdateItem}
            onClose={() => setQuickUpdateItem(null)}
            onSave={handleQuickUpdateSave}
          />
        )}
      </AnimatePresence>

      {/* Per-KPI Evolution Modal */}
      <AnimatePresence>
        {historyItem && (
          <KpiHistoryModal
            kpi={kpis.find((k) => k.id === historyItem.id) ?? historyItem}
            onClose={() => setHistoryItem(null)}
          />
        )}
      </AnimatePresence>

      {/* Exporting Overlay */}
      <AnimatePresence>
        {isExporting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center gap-6"
          >
            <Loader2 className="w-12 h-12 text-[#ff7f00] animate-spin" />
            <div className="text-center">
              <h2 className="text-xl font-bold text-gray-900 tracking-widest uppercase mb-2">{t.kpi.exporting}</h2>
              <p className="text-sm text-gray-500 font-medium">{t.kpi.exportingText}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
