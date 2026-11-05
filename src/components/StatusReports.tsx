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
} from 'firebase/firestore';
import { Project, StatusReport, UserProfile, StatusReportSector } from '../types';
import { Plus, Search, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { logFirestoreError, OperationType } from '../utils/errorHandlers';
import { commitWrite, friendlyWriteError } from '../utils/firestoreWrite';
import { logAutomaticChange } from '../utils/changeHistory';
import { motion, AnimatePresence } from 'motion/react';
import ExportButton from './export/ExportButton';
import {
  buildOfficialHeaderHTML,
  buildOfficialFooterHTML,
  captureContainerAsPdf,
  PdfExportOptions,
} from '../utils/export/pdfEngine';
import { canManageMembers } from '../utils/roleHelpers';
// @ts-ignore
import logoIbit from '../media/ibitlogo.svg';

import StatusReportTimeline from './statusReports/StatusReportTimeline';
import NewStatusReportModal from './statusReports/NewStatusReportModal';
import ImpactEvaluationModal from './statusReports/ImpactEvaluationModal';
import { STATUS_REPORT_SECTORS, formatDate, formatTime } from './statusReports/statusReportHelpers';

export default function StatusReports() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [reports, setReports] = useState<StatusReport[]>([]);
  const [projectMembers, setProjectMembers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [sectorFilter, setSectorFilter] = useState<StatusReportSector | 'Todos'>('Todos');

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StatusReport | null>(null);
  const [itemToDelete, setItemToDelete] = useState<StatusReport | null>(null);
  const [impactEvaluationItem, setImpactEvaluationItem] = useState<StatusReport | null>(null);
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

  // Fetch Reports
  useEffect(() => {
    if (!projectId) return;
    const qReports = query(collection(db, 'statusReports'), where('projectId', '==', projectId));
    const unsub = onSnapshot(qReports, (snapshot) => {
      const data: StatusReport[] = [];
      snapshot.forEach((d) => data.push({ id: d.id, ...d.data() } as StatusReport));
      data.sort((a, b) => {
        const timeA = a.date?.toMillis?.() || 0;
        const timeB = b.date?.toMillis?.() || 0;
        return timeB - timeA;
      });
      setReports(data);
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

  const canApprove = !!(project && user && canManageMembers(project, user.uid));

  const filteredReports = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();
    return reports.filter((report) => {
      if (sectorFilter !== 'Todos' && report.sector !== sectorFilter) return false;
      if (searchLower) {
        const matches =
          report.agenda.toLowerCase().includes(searchLower) ||
          (report.minutes && report.minutes.toLowerCase().includes(searchLower)) ||
          (report.outcome && report.outcome.toLowerCase().includes(searchLower)) ||
          report.location.toLowerCase().includes(searchLower);
        if (!matches) return false;
      }
      return true;
    });
  }, [reports, sectorFilter, searchQuery]);

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;
    try {
      await commitWrite(deleteDoc(doc(db, 'statusReports', itemToDelete.id)), { label: 'a exclusão do status report' });
      setItemToDelete(null);
    } catch (error) {
      logFirestoreError(error, OperationType.DELETE, 'statusReports');
      alert(friendlyWriteError(error));
    }
  };

  const handleToggleApproval = async (report: StatusReport) => {
    if (!canApprove || !user) return;
    try {
      await commitWrite(updateDoc(doc(db, 'statusReports', report.id), {
        approved: !report.approved,
        approvedBy: !report.approved ? user.uid : null,
        approvedAt: !report.approved ? serverTimestamp() : null,
        updatedAt: serverTimestamp(),
      }), { label: 'a aprovação' });
    } catch (error) {
      logFirestoreError(error, OperationType.UPDATE, 'statusReports');
      alert(friendlyWriteError(error));
    }
  };

  const handleToggleActionItem = async (report: StatusReport, actionItemId: string) => {
    try {
      const updatedItems = (report.actionItems || []).map((ai) =>
        ai.id === actionItemId ? { ...ai, done: !ai.done } : ai
      );
      await commitWrite(updateDoc(doc(db, 'statusReports', report.id), {
        actionItems: updatedItems,
        updatedAt: serverTimestamp(),
      }), { label: 'a ação da reunião' });
      const actionItem = (report.actionItems || []).find((item) => item.id === actionItemId);
      if (actionItem) {
        await logAutomaticChange({
          projectId,
          source: 'Status Reports',
          title: `Ação de reunião ${actionItem.done ? 'reaberta' : 'concluída'}`,
          description: `${actionItem.task}${report.agenda ? ` · ${report.agenda}` : ''}`,
          actorUid: user?.uid,
          actorName: user?.displayName || user?.email || undefined,
        });
      }
    } catch (error) {
      logFirestoreError(error, OperationType.UPDATE, 'statusReports');
      alert(friendlyWriteError(error));
    }
  };

  const handleExportPDF = async (options: PdfExportOptions) => {
    if (isExporting || filteredReports.length === 0) return;
    setIsExporting(true);
    await new Promise((r) => setTimeout(r, 100));

    try {
      const TOTAL_W = 1600;
      const container = document.createElement('div');
      container.style.cssText = `position:fixed;left:0;top:0;background:#fff;padding:40px;font-family:'lufga','Inter',system-ui,-apple-system,sans-serif;width:${TOTAL_W}px;box-sizing:border-box;z-index:50;overflow:visible;`;
      document.body.appendChild(container);

      container.innerHTML = options.chrome
        ? buildOfficialHeaderHTML({
            title: project?.name || 'Projeto',
            subtitle: 'Portfólio de Status Reports / Relatórios de Reunião',
            responsibleName: user?.displayName || undefined,
          })
        : '';

      const listWrapper = document.createElement('div');
      listWrapper.style.cssText = 'display:flex;flex-direction:column;gap:16px;';

      filteredReports.forEach((report) => {
        const member = (uid?: string) => projectMembers.find((m) => m.uid === uid)?.name || '-';
        const participantNames = (report.participants || []).map((p) => member(p)).join(', ') || '-';
        const actionItemsHTML = (report.actionItems || [])
          .map((ai) => `<li style="margin-bottom:2px;">${ai.done ? '✅' : '⬜'} ${ai.task} ${ai.responsible ? `<span style="color:#9ca3af;">(${member(ai.responsible)})</span>` : ''}</li>`)
          .join('');

        const card = document.createElement('div');
        card.style.cssText = 'border:1px solid #e5e7eb;border-radius:10px;padding:18px;background:#fff;';
        card.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
            <div>
              <div style="font-size:13px;font-weight:800;color:#111827;">${report.agenda}</div>
              <div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-top:2px;">
                ${formatDate(report.date)} · ${formatTime(report.date)} · ${report.location} · ${report.sector}
              </div>
            </div>
            <span style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;padding:3px 8px;border-radius:999px;background:${report.approved ? '#dcfce7' : '#fef9c3'};color:${report.approved ? '#16a34a' : '#a16207'};white-space:nowrap;">
              ${report.approved ? 'Concluída' : 'Pendente'}
            </span>
          </div>
          <div style="font-size:10px;color:#6b7280;font-weight:700;margin-bottom:6px;">Participantes: ${participantNames}</div>
          ${report.minutes ? `<div style="font-size:11px;color:#374151;margin-bottom:6px;">${report.minutes}</div>` : ''}
          ${report.outcome ? `<div style="font-size:11px;color:#374151;font-weight:700;margin-bottom:6px;">Resultado: ${report.outcome}</div>` : ''}
          ${actionItemsHTML ? `<ul style="font-size:10px;color:#374151;margin:0;padding-left:16px;">${actionItemsHTML}</ul>` : ''}
        `;
        listWrapper.appendChild(card);
      });

      container.appendChild(listWrapper);

      if (options.chrome) {
        const footer = document.createElement('div');
        footer.innerHTML = buildOfficialFooterHTML(logoIbit, `Portfólio de reports exportado da plataforma IBIT em ${new Date().toLocaleDateString('pt-BR')}`);
        container.appendChild(footer);
      }

      await new Promise((r) => setTimeout(r, 400));

      await captureContainerAsPdf(container, {
        filename: `status-reports-${(project?.name || 'projeto').replace(/\s+/g, '-')}-${new Date().toISOString().substring(0, 10)}.pdf`,
        widthPx: options.widthPx,
        heightPx: options.heightPx,
        dpi: options.dpi,
        chrome: options.chrome,
      });

      document.body.removeChild(container);
    } catch (err) {
      console.error('[Status Reports PDF Export] Error:', err);
      alert('Erro ao exportar PDF. Tente novamente.');
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
                {project?.name || 'Carregando...'} {project?.shortId && `- #${project.shortId}`}
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
                {project?.members.length || 0} {project?.members.length === 1 ? 'MEMBRO' : 'MEMBROS'}
              </span>
            </div>
          </div>
        </header>

        {/* Subheader / Filtros e Ações */}
        <div className="bg-white border-b border-gray-100 px-3 sm:px-6 py-2.5 flex flex-col gap-2.5 shrink-0 shadow-sm z-10">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 min-w-0">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Procurar por pauta ou registros..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 focus:outline-none focus:border-[#ff7f00] text-sm font-medium rounded-lg transition-all"
                />
              </div>

              <select
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value as StatusReportSector | 'Todos')}
                className="bg-gray-50 border border-gray-200 focus:outline-none focus:border-[#ff7f00] text-xs font-bold uppercase tracking-wider rounded-lg px-3 py-2 text-gray-700"
              >
                <option value="Todos">Todos os Setores</option>
                {STATUS_REPORT_SECTORS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 shrink-0">
              <ExportButton
                formats={['pdf']}
                title="Exportar Status Reports"
                label="EXPORTAR"
                onExportPdf={handleExportPDF}
                disabledFormats={{ pdf: filteredReports.length === 0 }}
                compact
              />

              <button
                onClick={() => { setEditingItem(null); setIsFormOpen(true); }}
                className="bg-[#ff7f00] hover:bg-orange-600 text-white px-4 sm:px-5 py-2 flex items-center justify-center gap-2 transition-all font-bold uppercase tracking-widest text-xs rounded-lg active:scale-95 shadow-md shadow-orange-100"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Novo Report</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 sm:p-5 scrollbar-hide mobile-pb-nav">
          <StatusReportTimeline
            reports={filteredReports}
            projectMembers={projectMembers}
            onEdit={(report) => { setEditingItem(report); setIsFormOpen(true); }}
            onDelete={(report) => setItemToDelete(report)}
            onToggleApproval={handleToggleApproval}
            onToggleActionItem={handleToggleActionItem}
            onOpenImpactEvaluation={(report) => setImpactEvaluationItem(report)}
            canApprove={canApprove}
          />
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
                <h3 className="text-lg font-bold text-center text-gray-900 mb-2">Excluir Report</h3>
                <p className="text-gray-500 text-center text-sm mb-6">
                  Tem certeza que deseja excluir o report <strong>{itemToDelete.agenda}</strong>? Esta ação não pode ser desfeita.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setItemToDelete(null)}
                    className="flex-1 py-2.5 bg-gray-50 text-gray-700 font-bold text-sm uppercase tracking-wider rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDeleteItem}
                    className="flex-1 py-2.5 bg-red-600 text-white font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Excluir
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
          <NewStatusReportModal
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

      {/* Impact Evaluation Modal */}
      <AnimatePresence>
        {impactEvaluationItem && user && (
          <ImpactEvaluationModal
            report={impactEvaluationItem}
            currentUserUid={user.uid}
            currentUserName={user.displayName || 'Usuário'}
            onClose={() => setImpactEvaluationItem(null)}
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
              <h2 className="text-xl font-bold text-gray-900 tracking-widest uppercase mb-2">Exportando</h2>
              <p className="text-sm text-gray-500 font-medium">Gerando portfólio de reports...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
