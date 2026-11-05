import React, { useState, useEffect } from 'react';
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
  addDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp,
  documentId
} from 'firebase/firestore';
import { Project, ProjectRisk, UserProfile } from '../types';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  X,
  AlertTriangle,
  Loader2,
  ShieldAlert,
  Check
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, logFirestoreError, OperationType } from '../utils/errorHandlers';
import { commitWrite, friendlyWriteError } from '../utils/firestoreWrite';
import { motion, AnimatePresence } from 'motion/react';
// @ts-ignore
import logoIbit from '../media/ibitlogo.svg';
import ExportButton from './export/ExportButton';
import { buildOfficialHeaderHTML, buildOfficialFooterHTML, captureContainerAsPdf, PdfExportOptions } from '../utils/export/pdfEngine';
import { exportRiskMatrixFromTemplate } from '../utils/export/riskTemplateEngine';

type TabType = 'Interno' | 'Externo';

export default function RiskManagement() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [project, setProject] = useState<Project | null>(null);
  const [risks, setRisks] = useState<ProjectRisk[]>([]);
  const [projectMembers, setProjectMembers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('Interno');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProjectRisk | null>(null);
  const [itemToDelete, setItemToDelete] = useState<ProjectRisk | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Fetch Project Data
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

  // Fetch Risks
  useEffect(() => {
    if (!projectId) return;

    const qRisks = query(collection(db, 'projectRisks'), where('projectId', '==', projectId));
    const unsubRisks = onSnapshot(qRisks, (snapshot) => {
      const data: ProjectRisk[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as ProjectRisk);
      });
      data.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });
      setRisks(data);
      setLoading(false);
    });

    return () => unsubRisks();
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
      snapshot.forEach((doc) => {
        membersData.push({ uid: doc.id, ...doc.data() } as UserProfile);
      });
      setProjectMembers(membersData);
    });
  }, [project?.members?.join(',')]);

  const filteredItems = risks.filter(item => {
    if (item.type !== activeTab) return false;
    
    const searchLower = searchQuery.toLowerCase();
    
    // Resolve responsible name
    const member = projectMembers.find(m => m.uid === item.responsible);
    const respName = member ? member.name.toLowerCase() : '';
    
    const matchesText = item.risk.toLowerCase().includes(searchLower) ||
      (item.description && item.description.toLowerCase().includes(searchLower)) ||
      (item.cause && item.cause.toLowerCase().includes(searchLower)) ||
      respName.includes(searchLower) ||
      (item.status.toLowerCase().includes(searchLower));

    return matchesText;
  });

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;
    try {
      await commitWrite(deleteDoc(doc(db, 'projectRisks', itemToDelete.id)), { label: 'a exclusão do risco' });
      setItemToDelete(null);
    } catch (error) {
      logFirestoreError(error, OperationType.DELETE, 'projectRisks');
      alert(friendlyWriteError(error));
    }
  };

  const getProbabilityBadge = (prob: string) => {
    switch (prob) {
      case 'B': return <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap">Baixa (B)</span>;
      case 'M': return <span className="bg-yellow-50 text-yellow-600 px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap">Média (M)</span>;
      case 'A': return <span className="bg-orange-50 text-orange-600 px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap">Alta (A)</span>;
      case 'C': return <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap">Crítica (C)</span>;
      default: return <span className="text-gray-400">-</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Aberto': return <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap">Aberto</span>;
      case 'Andamento': return <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap">Andamento</span>;
      case 'Mitigado': return <span className="bg-green-50 text-green-600 px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap">Mitigado</span>;
      case 'Encerrado': return <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap">Encerrado</span>;
      default: return <span className="text-gray-400">-</span>;
    }
  };

  const getExternalTypeBadge = (extType?: 'Ameaça' | 'Oportunidade') => {
    if (extType === 'Oportunidade') {
      return <span className="bg-green-50 text-green-600 px-2.5 py-0.5 rounded text-xs font-bold whitespace-nowrap">Oportunidade</span>;
    }
    return <span className="bg-red-50 text-red-600 px-2.5 py-0.5 rounded text-xs font-bold whitespace-nowrap">Ameaça</span>;
  };

  const renderResponsibleCell = (respUid?: string) => {
    if (!respUid) return <span className="text-gray-400">-</span>;
    const member = projectMembers.find(m => m.uid === respUid);
    if (!member) return <span className="text-xs text-gray-400 font-mono">?</span>;
    return (
      <div className="flex justify-center items-center">
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
      </div>
    );
  };

  const renderImpactAreasCell = (areas?: string[], justification?: string) => {
    if (!areas || areas.length === 0) return <span className="text-gray-400">-</span>;
    return (
      <div className="flex flex-col gap-0.5" title={justification || undefined}>
        <div className="flex gap-1 justify-center">
          {areas.map(a => (
            <span key={a} className="text-[10px] font-bold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
              {a}
            </span>
          ))}
        </div>
        {justification && (
          <span className="text-[9px] text-gray-400 italic max-w-[120px] truncate text-center">
            {justification}
          </span>
        )}
      </div>
    );
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('pt-BR');
  };

  // Separate sequence calculators for Internal vs External
  const nextInternalNumericId = risks.filter(r => r.type === 'Interno').length > 0
    ? Math.max(...risks.filter(r => r.type === 'Interno').map(r => r.numericId || 0)) + 1
    : 1;

  const nextExternalNumericId = risks.filter(r => r.type === 'Externo').length > 0
    ? Math.max(...risks.filter(r => r.type === 'Externo').map(r => r.numericId || 0)) + 1
    : 1;

  const nextNumericId = activeTab === 'Interno' ? nextInternalNumericId : nextExternalNumericId;

  const probabilityLabel = (prob: string) => {
    switch (prob) {
      case 'B': return 'Baixa (B)';
      case 'M': return 'Média (M)';
      case 'A': return 'Alta (A)';
      case 'C': return 'Crítica (C)';
      default: return '-';
    }
  };

  const handleExportPDF = async (options: PdfExportOptions) => {
    if (isExporting || filteredItems.length === 0) return;
    setIsExporting(true);
    await new Promise(r => setTimeout(r, 100));

    try {
      const isExterno = activeTab === 'Externo';
      const TOTAL_W = isExterno ? 2000 : 1700;

      const container = document.createElement('div');
      container.style.cssText = `position:fixed;left:0;top:0;background:#fff;padding:40px;font-family:'lufga','Inter',system-ui,-apple-system,sans-serif;width:${TOTAL_W}px;box-sizing:border-box;z-index:50;overflow:visible;`;
      document.body.appendChild(container);

      container.innerHTML = options.chrome
        ? buildOfficialHeaderHTML({
            title: project?.name || 'Projeto',
            subtitle: `Matriz de Riscos ${isExterno ? 'Externa' : 'Interna'}`,
            responsibleName: user?.displayName || undefined,
          })
        : '';

      const tableWrapper = document.createElement('div');
      tableWrapper.style.cssText = 'border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#fff;';

      const tableEl = document.createElement('table');
      tableEl.style.cssText = 'width:100%;border-collapse:collapse;font-size:10px;';

      const thStyle = 'padding:10px 8px;text-align:left;font-size:9px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid #e5e7eb;background:#f9fafb;';
      const tdStyle = 'padding:8px;vertical-align:top;font-size:10px;font-weight:600;color:#374151;border-bottom:1px solid #f3f4f6;';

      let headerHTML = `<thead><tr>
        <th style="${thStyle}width:5%;">ID</th>
        ${isExterno ? `<th style="${thStyle}width:8%;">TIPO</th>` : ''}
        <th style="${thStyle}width:14%;">${isExterno ? 'RISCO' : 'AMEAÇA'}</th>
        ${isExterno ? `<th style="${thStyle}width:12%;">CAUSA</th>` : ''}
        <th style="${thStyle}width:18%;">DESCRIÇÃO</th>
        <th style="${thStyle}width:8%;">PROBABILIDADE</th>
        <th style="${thStyle}width:6%;text-align:center;">IMPACTO</th>
        <th style="${thStyle}width:8%;">PRIORIDADE</th>
        <th style="${thStyle}width:10%;">RESPONSÁVEL</th>
        <th style="${thStyle}width:8%;">STATUS</th>
      </tr></thead>`;

      let bodyHTML = '<tbody>';
      filteredItems.forEach((item, idx) => {
        const rowBg = idx % 2 === 0 ? '#ffffff' : '#fafafa';
        const member = projectMembers.find(m => m.uid === item.responsible);
        bodyHTML += `<tr style="background:${rowBg};">
          <td style="${tdStyle}font-family:monospace;">#${item.numericId || '-'}</td>
          ${isExterno ? `<td style="${tdStyle}">${item.externalType || 'Ameaça'}</td>` : ''}
          <td style="${tdStyle}font-weight:800;color:#111827;">${item.risk}</td>
          ${isExterno ? `<td style="${tdStyle}">${item.cause || '-'}</td>` : ''}
          <td style="${tdStyle}">${item.description || '-'}</td>
          <td style="${tdStyle}">${probabilityLabel(item.probability)}</td>
          <td style="${tdStyle}text-align:center;font-weight:800;">${item.impact}</td>
          <td style="${tdStyle}">${item.priority || '-'}</td>
          <td style="${tdStyle}">${member?.name || '-'}</td>
          <td style="${tdStyle}">${item.status}</td>
        </tr>`;
      });
      bodyHTML += '</tbody>';

      tableEl.innerHTML = headerHTML + bodyHTML;
      tableWrapper.appendChild(tableEl);
      container.appendChild(tableWrapper);

      if (options.chrome) {
        const footer = document.createElement('div');
        footer.innerHTML = buildOfficialFooterHTML(logoIbit, `Matriz de riscos exportada da plataforma IBIT em ${new Date().toLocaleDateString('pt-BR')}`);
        container.appendChild(footer);
      }

      await new Promise(r => setTimeout(r, 400));

      await captureContainerAsPdf(container, {
        filename: `riscos-${(project?.name || 'projeto').replace(/\s+/g, '-')}-${activeTab.toLowerCase()}-${new Date().toISOString().substring(0, 10)}.pdf`,
        widthPx: options.widthPx,
        heightPx: options.heightPx,
        dpi: options.dpi,
        chrome: options.chrome,
      });

      document.body.removeChild(container);
    } catch (err) {
      console.error('[Risk Management PDF Export] Error:', err);
      alert('Erro ao exportar PDF. Tente novamente.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    await exportRiskMatrixFromTemplate({
      filename: `riscos-${(project?.name || 'projeto').replace(/\s+/g, '-')}-${activeTab.toLowerCase()}-${new Date().toISOString().substring(0, 10)}.xlsx`,
      rows: filteredItems.map((item) => ({
        title: item.risk,
        probabilityLabel: item.probability, // template uses raw letters (B/M/A/C), same convention as the platform
        level: item.impact,
        impactArea: (item.impactAreas || []).join('&') || '-',
        solution: item.actionPlan || item.description || '-',
      })),
    });
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
      <Sidebar 
        projectId={projectId} 
        projectName={project?.name} 
        onOpenSettings={user?.uid === project?.ownerId ? () => setIsSettingsOpen(true) : undefined} 
      />

      <MobileToolsDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        projectId={projectId!}
        projectName={project?.name}
        onOpenSettings={user?.uid === project?.ownerId ? () => setIsSettingsOpen(true) : undefined}
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
          </div>
        </header>

        {/* Subheader / Tabs */}
        <div className="bg-white border-b border-gray-100 px-3 sm:px-6 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0 shadow-sm z-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 w-full sm:w-auto">
            <div className="flex bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('Interno')}
                className={clsx(
                  "flex items-center gap-2 px-4 py-2 rounded-md font-bold text-xs uppercase tracking-widest transition-all",
                  activeTab === 'Interno' ? "bg-white text-[#ff7f00] shadow-sm" : "text-gray-500 hover:text-gray-900"
                )}
              >
                <ShieldAlert className="w-4 h-4" />
                <span className="hidden sm:inline">MATRIZ INTERNA</span>
                <span className="sm:hidden">INTERNA</span>
              </button>
              <button
                onClick={() => setActiveTab('Externo')}
                className={clsx(
                  "flex items-center gap-2 px-4 py-2 rounded-md font-bold text-xs uppercase tracking-widest transition-all",
                  activeTab === 'Externo' ? "bg-white text-[#ff7f00] shadow-sm" : "text-gray-500 hover:text-gray-900"
                )}
              >
                <AlertTriangle className="w-4 h-4" />
                <span className="hidden sm:inline">MATRIZ EXTERNA</span>
                <span className="sm:hidden">EXTERNA</span>
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text"
                placeholder={activeTab === 'Interno' ? "Procurar ameaça..." : "Procurar risco ou causa..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 focus:outline-none focus:border-[#ff7f00] text-sm font-medium rounded-lg transition-all"
              />
            </div>
          </div>

          <div className="flex gap-2 w-full sm:w-auto shrink-0 justify-center">
            <ExportButton
              formats={['pdf', 'excel']}
              title="Exportar Matriz de Riscos"
              onExportPdf={handleExportPDF}
              onExportExcel={handleExportExcel}
              disabledFormats={{ pdf: filteredItems.length === 0, excel: filteredItems.length === 0 }}
              compact
              className="flex-1 sm:flex-none"
            />
            <button 
              onClick={() => { setEditingItem(null); setIsModalOpen(true); }}
              className="bg-[#ff7f00] hover:bg-orange-600 text-white px-4 sm:px-5 py-2 flex items-center justify-center gap-2 transition-all font-bold uppercase tracking-widest text-xs rounded-lg active:scale-95 shadow-md shadow-orange-100 flex-1 sm:flex-none"
            >
              <Plus className="w-4 h-4" />
              <span>{activeTab === 'Interno' ? 'NOVA AMEAÇA' : 'NOVO RISCO'}</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 sm:p-6 scrollbar-hide mobile-pb-nav">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto shadow-sm">
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-16">ID</th>
                  {activeTab === 'Externo' && (
                    <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center w-28">TIPO</th>
                  )}
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-48">
                    {activeTab === 'Interno' ? 'AMEAÇA' : 'RISCO'}
                  </th>
                  {activeTab === 'Externo' && (
                    <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-48">CAUSA</th>
                  )}
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest min-w-[200px]">DESCRIÇÃO</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center w-32">ÁREA DE IMPACTO</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center w-24">PROBABILIDADE</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center w-20">IMPACTO</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center w-24">PRIORIDADE</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-24 text-center">RESP.</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest min-w-[150px]">PLANO DE AÇÃO</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center w-28">STATUS</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center w-32">ÚLTIMA REVISÃO</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right w-24">AÇÕES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredItems.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-3 text-xs font-mono font-bold text-gray-500 uppercase">
                      #{item.numericId || '-'}
                    </td>
                    {activeTab === 'Externo' && (
                      <td className="px-4 py-3 text-center">
                        {getExternalTypeBadge(item.externalType)}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="font-bold text-sm text-gray-900">{item.risk}</span>
                    </td>
                    {activeTab === 'Externo' && (
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold text-gray-700 line-clamp-2" title={item.cause}>
                          {item.cause || '-'}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-600 line-clamp-2" title={item.description}>
                        {item.description || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {renderImpactAreasCell(item.impactAreas, item.impactJustification)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {getProbabilityBadge(item.probability)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-bold text-gray-700 bg-gray-100 px-2.5 py-0.5 rounded">
                        {item.impact}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs font-bold text-gray-700 uppercase whitespace-nowrap bg-gray-50 border border-gray-200 px-2 py-0.5 rounded">
                        {item.priority || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {renderResponsibleCell(item.responsible)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-600 line-clamp-2" title={item.actionPlan}>
                        {item.actionPlan || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {getStatusBadge(item.status)}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-500 font-medium whitespace-nowrap">
                      {formatDate(item.lastReviewDate)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => { setEditingItem(item); setIsModalOpen(true); }}
                          className="p-1 bg-white border border-gray-200 hover:bg-orange-50 text-gray-400 hover:text-[#ff7f00] rounded transition-all shadow-sm"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => setItemToDelete(item)}
                          className="p-1 bg-white border border-gray-200 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded transition-all shadow-sm"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={activeTab === 'Externo' ? 14 : 12} className="px-4 py-8 text-center text-gray-500 text-sm font-medium">
                      Nenhum risco encontrado para esta matriz.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
                <h3 className="text-lg font-bold text-center text-gray-900 mb-2">Excluir Risco</h3>
                <p className="text-gray-500 text-center text-sm mb-6">
                  Tem certeza que deseja excluir o risco <strong>{itemToDelete.risk}</strong>? Esta ação não pode ser desfeita.
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
        {isModalOpen && (
          <RiskModal 
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            projectId={projectId!}
            item={editingItem}
            type={activeTab}
            projectMembers={projectMembers}
            nextNumericId={nextNumericId}
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
              <p className="text-sm text-gray-500 font-medium">Gerando relatório da matriz de riscos...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface RiskModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  item: ProjectRisk | null;
  type: TabType;
  projectMembers: UserProfile[];
  nextNumericId: number;
}

function RiskModal({ 
  isOpen, 
  onClose, 
  projectId, 
  item, 
  type, 
  projectMembers, 
  nextNumericId 
}: RiskModalProps) {
  const [loading, setLoading] = useState(false);
  
  const [risk, setRisk] = useState(item?.risk || '');
  const [description, setDescription] = useState(item?.description || '');
  const [probability, setProbability] = useState<ProjectRisk['probability']>(item?.probability || 'M');
  const [impact, setImpact] = useState<ProjectRisk['impact']>(item?.impact || 3);
  const [priority, setPriority] = useState(item?.priority || '');
  const [responsible, setResponsible] = useState(item?.responsible || '');
  const [actionPlan, setActionPlan] = useState(item?.actionPlan || '');
  const [status, setStatus] = useState<ProjectRisk['status']>(item?.status || 'Aberto');
  
  const [impactAreas, setImpactAreas] = useState<string[]>(item?.impactAreas || []);
  const [impactJustification, setImpactJustification] = useState(item?.impactJustification || '');
  
  const [cause, setCause] = useState(item?.cause || '');
  const [externalType, setExternalType] = useState<ProjectRisk['externalType']>(item?.externalType || 'Ameaça');

  const toggleImpactArea = (areaId: string) => {
    setImpactAreas(prev => 
      prev.includes(areaId) ? prev.filter(a => a !== areaId) : [...prev, areaId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!risk.trim()) return;
    setLoading(true);

    try {
      const payload: any = {
        projectId,
        type: item?.type || type,
        risk: risk.trim(),
        description: description.trim(),
        probability,
        impact,
        priority: priority.trim(),
        responsible,
        actionPlan: actionPlan.trim(),
        status,
        impactAreas,
        impactJustification: impactJustification.trim(),
        lastReviewDate: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if ((item?.type || type) === 'Externo') {
        payload.cause = cause.trim();
        payload.externalType = externalType;
      }

      if (item) {
        // Keep existing numericId on edit
        await commitWrite(updateDoc(doc(db, 'projectRisks', item.id), payload), { label: 'o risco' });
      } else {
        // New item: save sequence number
        await commitWrite(addDoc(collection(db, 'projectRisks'), {
          ...payload,
          numericId: nextNumericId,
          createdAt: serverTimestamp()
        }), { label: 'o risco' });
      }
      onClose();
    } catch (error) {
      logFirestoreError(error, item ? OperationType.UPDATE : OperationType.CREATE, 'projectRisks');
      alert(friendlyWriteError(error));
    } finally {
      setLoading(false);
    }
  };

  const modalType = item?.type || type;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white border border-gray-200 w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl rounded-2xl flex flex-col"
      >
        <div className="flex justify-between items-center p-6 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-xl font-bold uppercase tracking-wider text-gray-900">
              {item ? 'Detalhes do Risco' : (modalType === 'Interno' ? 'Nova Ameaça' : 'Novo Risco Externo')}
            </h2>
            <p className="text-xs font-bold text-gray-400 tracking-widest uppercase mt-0.5">
              Matriz {modalType.toUpperCase()} {item && `#${item.numericId}`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          <form id="risk-form" onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Coluna da Esquerda */}
            <div className="space-y-6">
              {/* Título / Ameaça */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  {modalType === 'Interno' ? 'AMEAÇA *' : 'RISCO *'}
                </label>
                <input
                  type="text"
                  required
                  value={risk}
                  onChange={(e) => setRisk(e.target.value)}
                  className="w-full bg-white border border-gray-300 px-4 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm text-sm"
                  placeholder={modalType === 'Interno' ? "Ex: Indisponibilidade de servidor crítico" : "Ex: Mudança abrupta na regulamentação cambial"}
                />
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  DESCRIÇÃO
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full bg-white border border-gray-300 px-4 py-2.5 text-gray-900 focus:outline-none focus:border-[#ff7f00] resize-none rounded-lg shadow-sm text-sm"
                  placeholder="Detalhamento sobre o risco, causas prováveis ou impactos preliminares..."
                />
              </div>

              {/* Causa (Somente Externo) */}
              {modalType === 'Externo' && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                    CAUSA
                  </label>
                  <input
                    type="text"
                    value={cause}
                    onChange={(e) => setCause(e.target.value)}
                    className="w-full bg-white border border-gray-300 px-4 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-semibold rounded-lg shadow-sm text-sm"
                    placeholder="Ex: Instabilidade geopolítica internacional"
                  />
                </div>
              )}

              {/* Responsável (Lista vertical rolante com foto, nome e rádio - idêntica à de tarefas/stakeholders) */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                  RESPONSÁVEL
                </label>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2 max-h-48 overflow-y-auto shadow-inner">
                  {projectMembers.map(member => (
                    <div 
                      key={member.uid} 
                      onClick={() => setResponsible(responsible === member.uid ? '' : member.uid)}
                      className={clsx(
                        "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all",
                        responsible === member.uid ? "bg-orange-50 border border-orange-200 shadow-sm" : "hover:bg-white border border-transparent"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full overflow-hidden border border-gray-200 bg-white">
                          {member.photoURL ? (
                            <img src={member.photoURL} alt={member.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-400 bg-gray-50">
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <span className={clsx("text-xs font-bold", responsible === member.uid ? "text-[#ff7f00]" : "text-gray-600")}>
                          {member.name}
                        </span>
                      </div>
                      <div className={clsx(
                        "w-5 h-5 rounded-full border flex items-center justify-center transition-all shrink-0",
                        responsible === member.uid ? "bg-[#ff7f00] border-[#ff7f00]" : "bg-white border-gray-300"
                      )}>
                        {responsible === member.uid && <Check className="w-3 h-3 text-white stroke-[3px]" />}
                      </div>
                    </div>
                  ))}
                  {projectMembers.length === 0 && (
                    <span className="text-xs text-gray-400">Nenhum membro do projeto disponível.</span>
                  )}
                </div>
              </div>
            </div>

            {/* Coluna da Direita */}
            <div className="space-y-6">
              {/* Tipo de Risco Externo (Somente Externo) */}
              {modalType === 'Externo' && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                    TIPO DE RISCO EXTERNO *
                  </label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setExternalType('Ameaça')}
                      className={clsx(
                        "flex-1 py-2.5 border rounded-lg flex items-center justify-center font-bold text-xs uppercase tracking-wider transition-all shadow-sm",
                        externalType === 'Ameaça'
                          ? "bg-red-50 border-red-500 text-red-600 scale-102 font-extrabold"
                          : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
                      )}
                    >
                      Ameaça
                    </button>
                    <button
                      type="button"
                      onClick={() => setExternalType('Oportunidade')}
                      className={clsx(
                        "flex-1 py-2.5 border rounded-lg flex items-center justify-center font-bold text-xs uppercase tracking-wider transition-all shadow-sm",
                        externalType === 'Oportunidade'
                          ? "bg-green-50 border-green-500 text-green-600 scale-102 font-extrabold"
                          : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
                      )}
                    >
                      Oportunidade
                    </button>
                  </div>
                </div>
              )}

              {/* Probabilidade e Impacto */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                    PROBABILIDADE *
                  </label>
                  <select
                    value={probability}
                    onChange={(e) => setProbability(e.target.value as ProjectRisk['probability'])}
                    className="w-full bg-white border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm text-sm"
                  >
                    <option value="B">Baixa (B)</option>
                    <option value="M">Média (M)</option>
                    <option value="A">Alta (A)</option>
                    <option value="C">Crítica (C)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                    IMPACTO *
                  </label>
                  <select
                    value={impact}
                    onChange={(e) => setImpact(parseInt(e.target.value, 10) as ProjectRisk['impact'])}
                    className="w-full bg-white border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm text-sm"
                  >
                    <option value="1">1 - Muito Baixo</option>
                    <option value="2">2 - Baixo</option>
                    <option value="3">3 - Moderado</option>
                    <option value="4">4 - Alto</option>
                    <option value="5">5 - Muito Alto</option>
                  </select>
                </div>
              </div>

              {/* Prioridade e Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                    PRIORIDADE
                  </label>
                  <input
                    type="text"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full bg-white border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm text-sm"
                    placeholder="Ex: Crítica, Alta"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                    STATUS *
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ProjectRisk['status'])}
                    className="w-full bg-white border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm text-sm"
                  >
                    <option value="Aberto">Aberto</option>
                    <option value="Andamento">Andamento</option>
                    <option value="Mitigado">Mitigado</option>
                    <option value="Encerrado">Encerrado</option>
                  </select>
                </div>
              </div>

              {/* Área de Impacto com justificativa */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  ÁREA DE IMPACTO
                </label>
                <div className="flex gap-2">
                  {[
                    { id: 'R', label: 'Recursos (R)' },
                    { id: 'T', label: 'Tempo (T)' },
                    { id: 'A', label: 'Escopo (A)' },
                    { id: 'Q', label: 'Qualidade (Q)' },
                  ].map(area => {
                    const isSelected = impactAreas.includes(area.id);
                    return (
                      <button
                        key={area.id}
                        type="button"
                        onClick={() => toggleImpactArea(area.id)}
                        className={clsx(
                          "px-2 py-2 border text-xs font-bold rounded-lg transition-all flex-1 shadow-sm",
                          isSelected 
                            ? "bg-orange-50 border-[#ff7f00] text-[#ff7f00] scale-102 font-extrabold"
                            : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
                        )}
                      >
                        {area.id}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2.5">
                  <input
                    type="text"
                    value={impactJustification}
                    onChange={(e) => setImpactJustification(e.target.value)}
                    className="w-full bg-white border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] rounded-lg shadow-sm text-xs font-semibold"
                    placeholder="Justificativa da área de impacto..."
                  />
                </div>
              </div>

              {/* Plano de Ação */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  PLANO DE AÇÃO
                </label>
                <textarea
                  value={actionPlan}
                  onChange={(e) => setActionPlan(e.target.value)}
                  rows={3}
                  className="w-full bg-white border border-gray-300 px-4 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] resize-none rounded-lg shadow-sm text-sm"
                  placeholder="Passos práticos definidos para mitigação, contingência ou transferência..."
                />
              </div>

            </div>
          </form>
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end gap-3 bg-gray-50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors rounded-lg"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="risk-form"
            disabled={loading || !risk.trim()}
            className="px-8 py-2.5 text-xs font-bold uppercase tracking-widest text-white bg-[#ff7f00] hover:bg-orange-600 disabled:opacity-50 transition-colors rounded-lg shadow-lg shadow-orange-100 flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {item ? 'Salvar Alterações' : 'Criar Risco'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
