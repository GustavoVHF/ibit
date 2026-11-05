import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileHeader from './MobileHeader';
import MobileBottomNav from './MobileBottomNav';
import MobileToolsDrawer from './MobileToolsDrawer';
import UserProfileModal from './UserProfileModal';
import { db } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  documentId, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  setDoc,
  serverTimestamp,
  orderBy,
  writeBatch
} from 'firebase/firestore';
import { InventoryItem, Project, UserProfile, Task, ProjectTag } from '../types';
import { 
  Plus, 
  Search, 
  Package, 
  Trash2, 
  Edit2, 
  MapPin, 
  Tag as TagIcon, 
  ExternalLink,
  Users,
  X,
  Check,
  ChevronDown,
  AlertTriangle,
  User as UserIcon,
  CheckSquare,
  Loader2
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import ProjectSettingsModal from './ProjectSettingsModal';
import { handleFirestoreError, logFirestoreError, OperationType } from '../utils/errorHandlers';
import { commitWrite, friendlyWriteError } from '../utils/firestoreWrite';
import { logAutomaticChange } from '../utils/changeHistory';
import { motion, AnimatePresence } from 'motion/react';
import { TAG_COLORS } from './TaskDetailsModal';
// @ts-ignore
import logoIbit from '../media/ibitlogo.svg';
import ExportButton from './export/ExportButton';
import { buildOfficialHeaderHTML, buildOfficialFooterHTML, captureContainerAsPdf, PdfExportOptions } from '../utils/export/pdfEngine';
import { exportLedgerToExcel } from '../utils/export/ledgerTemplateEngine';

export default function Inventory() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [project, setProject] = useState<Project | null>(null);
  const [projectMembers, setProjectMembers] = useState<UserProfile[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [projectTags, setProjectTags] = useState<ProjectTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // 1. Fetch Project Data
  useEffect(() => {
    if (!projectId || !user) return;
    const projectRef = doc(db, 'projects', projectId);
    return onSnapshot(projectRef, (docSnap) => {
      if (docSnap.exists()) {
        setProject({ id: docSnap.id, ...docSnap.data() } as Project);
      }
    });
  }, [projectId, user]);

  // 2. Fetch Members
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

  // 3. Fetch Inventory, Tasks, and Tags
  useEffect(() => {
    if (!projectId) return;

    const qInv = query(collection(db, 'inventory'), where('projectId', '==', projectId));
    const unsubInv = onSnapshot(qInv, (snapshot) => {
      const invData: InventoryItem[] = [];
      snapshot.forEach((doc) => {
        invData.push({ id: doc.id, ...doc.data() } as InventoryItem);
      });
      setInventory(invData);
    });

    const qTasks = query(collection(db, 'tasks'), where('projectId', '==', projectId));
    const unsubTasks = onSnapshot(qTasks, (snapshot) => {
      const taskData: Task[] = [];
      snapshot.forEach((doc) => {
        taskData.push({ id: doc.id, ...doc.data() } as Task);
      });
      setAllTasks(taskData);
      setLoading(false);
    });

    const qTags = query(
      collection(db, 'projectTags'), 
      where('projectId', '==', projectId),
      orderBy('createdAt', 'asc')
    );
    const unsubTags = onSnapshot(qTags, (snapshot) => {
      const tagsData: ProjectTag[] = [];
      snapshot.forEach((doc) => {
        tagsData.push({ id: doc.id, ...doc.data() } as ProjectTag);
      });
      setProjectTags(tagsData);
    });

    return () => {
      unsubInv();
      unsubTasks();
      unsubTags();
    };
  }, [projectId]);

  const filteredItems = inventory.filter(item => {
    const searchLower = searchQuery.toLowerCase();
    const matchesText = item.name.toLowerCase().includes(searchLower) ||
      item.description?.toLowerCase().includes(searchLower) ||
      item.location?.toLowerCase().includes(searchLower);
    
    // Search in tags
    const matchesTag = item.tags?.some(tagId => {
      const tag = projectTags.find(pt => pt.id === tagId);
      return tag?.label.toLowerCase().includes(searchLower);
    });

    return matchesText || matchesTag;
  });

  const selectedOrFilteredItems = selectedItems.length > 0
    ? filteredItems.filter(item => selectedItems.includes(item.id))
    : filteredItems;

  const filteredTotalValue = selectedOrFilteredItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

  // Clean up selectedItems when inventory changes (e.g. items are deleted elsewhere)
  useEffect(() => {
    setSelectedItems(prev => prev.filter(id => inventory.some(item => item.id === id)));
  }, [inventory]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;
    try {
      await commitWrite(deleteDoc(doc(db, 'inventory', itemToDelete.id)), { label: 'a exclusão do item' });
      setItemToDelete(null);
    } catch (error) {
      logFirestoreError(error, OperationType.DELETE, 'inventory');
      alert(friendlyWriteError(error));
    }
  };

  const handleBulkDelete = async () => {
    try {
      const batch = writeBatch(db);
      selectedItems.forEach((itemId) => {
        batch.delete(doc(db, 'inventory', itemId));
      });
      await commitWrite(batch.commit(), { label: 'a exclusão dos itens' });
      setSelectedItems([]);
      setIsBulkDeleteConfirmOpen(false);
    } catch (error) {
      logFirestoreError(error, OperationType.DELETE, 'inventory (bulk)');
      alert(friendlyWriteError(error));
    }
  };

  const handleExportPDF = async (options: PdfExportOptions) => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      const container = document.createElement('div');
      container.style.cssText = `
        position: fixed;
        left: 0;
        top: 0;
        width: 564px;
        padding: 30px;
        background: #ffffff;
        font-family: 'lufga', 'Inter', -apple-system, sans-serif;
        box-sizing: border-box;
        z-index: 50;
        overflow: visible;
      `;
      document.body.appendChild(container);

      // Header block (only when chrome is enabled)
      container.innerHTML = options.chrome
        ? buildOfficialHeaderHTML({
            title: project?.name || 'Project',
            subtitle: 'Inventory Report',
            responsibleName: user?.displayName || undefined,
          })
        : '';

      // Create Table Wrapper
      const tableWrapper = document.createElement('div');
      tableWrapper.style.cssText = 'border: 1px solid #e5e7eb; border-radius: 4px; overflow: hidden; background: #ffffff;';

      const tableEl = document.createElement('table');
      tableEl.style.cssText = 'width: 100%; border-collapse: collapse; text-align: left; table-layout: fixed;';

      const headerHTML = `
        <thead>
          <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
            <th style="padding: 10px 8px; font-size: 8px; font-weight: 800; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.1em; font-family: 'lufga', 'Inter', sans-serif; width: 25%;">Product</th>
            <th style="padding: 10px 8px; font-size: 8px; font-weight: 800; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.1em; font-family: 'lufga', 'Inter', sans-serif; width: 15%;">Location</th>
            <th style="padding: 10px 8px; font-size: 8px; font-weight: 800; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.1em; font-family: 'lufga', 'Inter', sans-serif; text-align: center; width: 10%;">Qty</th>
            <th style="padding: 10px 8px; font-size: 8px; font-weight: 800; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.1em; font-family: 'lufga', 'Inter', sans-serif; width: 15%;">Price</th>
            <th style="padding: 10px 8px; font-size: 8px; font-weight: 800; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.1em; font-family: 'lufga', 'Inter', sans-serif; width: 15%;">Total</th>
            <th style="padding: 10px 8px; font-size: 8px; font-weight: 800; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.1em; font-family: 'lufga', 'Inter', sans-serif; width: 20%;">Tags</th>
          </tr>
        </thead>
      `;

      let bodyHTML = '<tbody>';
      selectedOrFilteredItems.forEach((item, index) => {
        const rowBg = index % 2 === 0 ? '#ffffff' : '#fafafa';
        
        // Tags logic
        let tagsHTML = '';
        if (item.tags && item.tags.length > 0) {
          tagsHTML = '<div style="display: flex; flex-wrap: wrap; gap: 4px;">';
          item.tags.forEach(tagId => {
            const tag = projectTags.find(t => t.id === tagId);
            if (tag) {
              const isHex = tag.color?.startsWith('#');
              const tagStyle = isHex 
                ? `background-color: ${tag.color}; color: #ffffff; border: none;`
                : `background-color: #f3f4f6; color: #374151; border: 1px solid #e5e7eb;`;
              tagsHTML += `<span style="font-size: 7px; font-weight: 800; padding: 2px 4px; border-radius: 3px; text-transform: uppercase; letter-spacing: 0.05em; ${tagStyle}">${tag.label}</span>`;
            }
          });
          tagsHTML += '</div>';
        } else {
          tagsHTML = '<span style="font-size: 8px; color: #9ca3af; font-weight: 500;">-</span>';
        }

        bodyHTML += `
          <tr style="background: ${rowBg}; border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 8px; vertical-align: top; word-wrap: break-word; overflow-wrap: break-word;">
              <div style="font-size: 9px; font-weight: 700; color: #111; text-transform: uppercase; letter-spacing: 0.02em; word-wrap: break-word; overflow-wrap: break-word;">${item.name.replace(/NÃO DEFINIDO/gi, 'NOT DEFINED')}</div>
              ${item.description ? `<div style="font-size: 8px; color: #6b7280; margin-top: 2px; font-weight: 500; line-height: 1.3; word-break: break-all; overflow-wrap: anywhere;">${item.description.replace(/NÃO DEFINIDO/gi, 'NOT DEFINED')}</div>` : ''}
            </td>
            <td style="padding: 10px 8px; vertical-align: middle; font-size: 8px; font-weight: 700; color: #4b5563; text-transform: uppercase; word-wrap: break-word; overflow-wrap: break-word;">
              ${item.location ? item.location.replace(/NÃO DEFINIDO/gi, 'NOT DEFINED') : 'NOT DEFINED'}
            </td>
            <td style="padding: 10px 8px; vertical-align: middle; text-align: center; font-size: 8px; font-weight: 700; color: #4b5563;">
              ${item.quantity} un
            </td>
            <td style="padding: 10px 8px; vertical-align: middle; font-size: 8px; font-weight: 700; color: #4b5563;">
              ${formatCurrency(item.unitPrice)}
            </td>
            <td style="padding: 10px 8px; vertical-align: middle; font-size: 8px; font-weight: 800; color: #111827;">
              ${formatCurrency(item.quantity * item.unitPrice)}
            </td>
            <td style="padding: 10px 8px; vertical-align: middle;">
              ${tagsHTML}
            </td>
          </tr>
        `;
      });
      bodyHTML += '</tbody>';

      tableEl.innerHTML = headerHTML + bodyHTML;
      tableWrapper.appendChild(tableEl);
      container.appendChild(tableWrapper);

      // Summary section at bottom of table
      const totalSection = document.createElement('div');
      totalSection.style.cssText = `
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 16px;
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid #e5e7eb;
        font-family: 'lufga', 'Inter', sans-serif;
      `;
      totalSection.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 8px; font-weight: 800; color: #6b7280; text-transform: uppercase; letter-spacing: 0.1em; font-family: 'lufga', 'Inter', sans-serif;">Total Items:</span>
          <span style="font-size: 9px; font-weight: 700; color: #111827;">${selectedOrFilteredItems.length}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 8px; font-weight: 800; color: #6b7280; text-transform: uppercase; letter-spacing: 0.1em; font-family: 'lufga', 'Inter', sans-serif;">Total Value:</span>
          <span style="font-size: 11px; font-weight: 900; color: #ff7f00; font-family: 'lufga', 'Inter', sans-serif;">${formatCurrency(filteredTotalValue)}</span>
        </div>
      `;
      container.appendChild(totalSection);

      // Footer (logo + export date), only when chrome is enabled
      if (options.chrome) {
        const footer = document.createElement('div');
        footer.innerHTML = buildOfficialFooterHTML(logoIbit, `Inventory report exported from the IBIT platform on ${new Date().toLocaleDateString('en-US')}`);
        container.appendChild(footer);
      }

      // Capture and generate PDF (page size = exact widthPx/heightPx at chosen DPI, content stretched to fill it)
      await new Promise(r => setTimeout(r, 500));
      const projectNameStr = (project?.name || 'project').replace(/\s+/g, '-');
      await captureContainerAsPdf(container, {
        filename: `inventory-${projectNameStr}-${new Date().toISOString().substring(0, 10)}.pdf`,
        widthPx: options.widthPx,
        heightPx: options.heightPx,
        dpi: options.dpi,
        chrome: options.chrome,
      });

      document.body.removeChild(container);
    } catch (err) {
      console.error('[Inventory PDF Export] Error:', err);
      alert('Error exporting PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    const projectNameStr = (project?.name || 'project').replace(/\s+/g, '-');

    // Group items by location, same "sectioned ledger" layout as the platform's own budget template.
    const groupsMap = new Map<string, InventoryItem[]>();
    selectedOrFilteredItems.forEach((item) => {
      const key = item.location?.trim() || 'Sem Localização';
      if (!groupsMap.has(key)) groupsMap.set(key, []);
      groupsMap.get(key)!.push(item);
    });

    await exportLedgerToExcel({
      filename: `inventario-${projectNameStr}-${new Date().toISOString().substring(0, 10)}.xlsx`,
      sheetName: 'Inventário',
      title: `Inventário — ${project?.name || 'Projeto'}`,
      totalColumnIndex: 4,
      columns: [
        { header: 'Produto', type: 'string', width: 28, value: (r: InventoryItem) => r.name },
        { header: 'Quantidade', type: 'number', width: 14, value: (r: InventoryItem) => r.quantity },
        { header: 'Preço Unit.', type: 'currency', width: 16, value: (r: InventoryItem) => r.unitPrice },
        {
          header: 'Tags',
          type: 'string',
          width: 24,
          value: (r: InventoryItem) => (r.tags || []).map((tagId: string) => projectTags.find(t => t.id === tagId)?.label).filter(Boolean).join(', '),
        },
        { header: 'Total', type: 'currency', width: 16, value: (r: InventoryItem) => r.quantity * r.unitPrice },
      ],
      groups: Array.from(groupsMap.entries()).map(([name, rows]) => ({ name, rows })),
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

        <div className={clsx(
          "border-b px-3 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0 shadow-sm z-10 transition-all duration-300",
          selectedItems.length > 0 ? "bg-orange-50/80 border-orange-200" : "bg-white border-gray-100"
        )}>
          {selectedItems.length > 0 ? (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-orange-800 uppercase tracking-widest">
                  {selectedItems.length} {selectedItems.length === 1 ? 'PRODUTO SELECIONADO' : 'PRODUTOS SELECIONADOS'}
                </span>
                <button
                  onClick={() => setSelectedItems([])}
                  className="text-xs text-gray-500 hover:text-gray-900 font-bold uppercase tracking-widest border border-gray-200 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-all active:scale-95"
                >
                  LIMPAR SELEÇÃO
                </button>
                <button
                  onClick={() => {
                    setSelectedItems([]);
                    setIsSelectionMode(false);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-900 font-bold uppercase tracking-widest border border-gray-200 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-all active:scale-95"
                >
                  SAIR DA SELEÇÃO
                </button>
              </div>
              <div className="flex items-center gap-2">
                <ExportButton
                  formats={['pdf', 'excel']}
                  title="Exportar Inventário"
                  onExportPdf={handleExportPDF}
                  onExportExcel={handleExportExcel}
                  disabledFormats={{ excel: selectedOrFilteredItems.length === 0 }}
                  className="px-4 py-2.5"
                />
                <button
                  onClick={() => setIsBulkDeleteConfirmOpen(true)}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 flex items-center gap-2 transition-all font-bold uppercase tracking-widest text-xs rounded-lg active:scale-95 shadow-md shadow-red-100"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>EXCLUIR SELECIONADOS</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-0 sm:gap-6 w-full sm:w-auto">
                <div className="hidden sm:flex items-center gap-2 shrink-0">
                  <Package className="w-5 h-5 text-[#ff7f00]" />
                  <h2 className="text-sm sm:text-lg font-bold text-gray-900 uppercase tracking-widest">
                    INVENTÁRIO
                  </h2>
                </div>
                
                <div className="relative flex-1 sm:w-64 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input 
                    type="text"
                    placeholder="Procurar..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 focus:outline-none focus:border-[#ff7f00] text-sm font-medium rounded-lg transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <ExportButton
                  formats={['pdf', 'excel']}
                  title="Exportar Inventário"
                  onExportPdf={handleExportPDF}
                  onExportExcel={handleExportExcel}
                  disabledFormats={{ excel: filteredItems.length === 0, pdf: filteredItems.length === 0 }}
                  compact
                  className="w-full sm:w-auto justify-center"
                />
                <button
                  onClick={() => {
                    if (isSelectionMode) {
                      setSelectedItems([]);
                    }
                    setIsSelectionMode(!isSelectionMode);
                  }}
                  className={clsx(
                    "px-4 py-2 flex items-center gap-2 transition-all font-bold uppercase tracking-widest text-xs rounded-lg active:scale-95 border shadow-sm w-full sm:w-auto justify-center",
                    isSelectionMode
                      ? "bg-[#ff7f00]/10 hover:bg-[#ff7f00]/20 border-orange-200 text-[#ff7f00]"
                      : "bg-white hover:bg-orange-50 border-gray-200 text-gray-600 hover:text-[#ff7f00]"
                  )}
                >
                  <CheckSquare className="w-4 h-4" />
                  <span>{isSelectionMode ? 'CONCLUIR SELEÇÃO' : 'SELECIONAR'}</span>
                </button>

                <button 
                  onClick={() => { setEditingItem(null); setIsModalOpen(true); }}
                  className="bg-[#ff7f00] hover:bg-orange-600 text-white px-4 sm:px-5 py-2 flex items-center gap-2 transition-all font-bold uppercase tracking-widest text-xs rounded-lg active:scale-95 shadow-md shadow-orange-100 w-full sm:w-auto justify-center"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">ADICIONAR PRODUTO</span>
                  <span className="sm:hidden">ADICIONAR</span>
                </button>
              </div>
            </>
          )}
        </div>

        <div className="flex-1 overflow-auto p-3 sm:p-6 scrollbar-hide mobile-pb-nav">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {isSelectionMode && (
                    <th className="px-4 py-4 w-12 text-center">
                      <div className="flex items-center justify-center">
                        <input 
                          type="checkbox"
                          checked={filteredItems.length > 0 && filteredItems.every(item => selectedItems.includes(item.id))}
                          ref={input => {
                            if (input) {
                              const allSelected = filteredItems.length > 0 && filteredItems.every(item => selectedItems.includes(item.id));
                              const someSelected = filteredItems.some(item => selectedItems.includes(item.id));
                              input.indeterminate = !allSelected && someSelected;
                            }
                          }}
                          onChange={(e) => {
                            if (e.target.checked) {
                              const newSelections = [...selectedItems];
                              filteredItems.forEach(item => {
                                if (!newSelections.includes(item.id)) {
                                  newSelections.push(item.id);
                                }
                              });
                              setSelectedItems(newSelections);
                            } else {
                              setSelectedItems(selectedItems.filter(id => !filteredItems.some(item => item.id === id)));
                            }
                          }}
                          className="rounded border-gray-300 text-[#ff7f00] focus:ring-[#ff7f00] focus:ring-2 focus:ring-offset-2 w-4.5 h-4.5 cursor-pointer accent-[#ff7f00] transition-all hover:border-[#ff7f00]"
                        />
                      </div>
                    </th>
                  )}
                  <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">PRODUTO</th>
                  <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">LOCALIZAÇÃO</th>
                  <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">QUANTIDADE</th>
                  <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">PREÇO UNIT.</th>
                  <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">TAGS / TAREFA</th>
                  <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">RESPONSÁVEIS</th>
                  <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">AÇÕES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredItems.map(item => (
                  <tr 
                    key={item.id} 
                    className={clsx(
                      "transition-colors group",
                      selectedItems.includes(item.id) ? "bg-orange-50/20 hover:bg-orange-50/40" : "hover:bg-gray-50"
                    )}
                  >
                    {isSelectionMode && (
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center">
                          <input 
                            type="checkbox"
                            checked={selectedItems.includes(item.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedItems([...selectedItems, item.id]);
                              } else {
                                setSelectedItems(selectedItems.filter(id => id !== item.id));
                              }
                            }}
                            className="rounded border-gray-300 text-[#ff7f00] focus:ring-[#ff7f00] focus:ring-2 focus:ring-offset-2 w-4.5 h-4.5 cursor-pointer accent-[#ff7f00] transition-all hover:border-[#ff7f00]"
                          />
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-sm text-gray-900 tracking-wide text-pretty">{item.name}</span>
                        {item.description && <span className="text-xs text-gray-500 line-clamp-1 truncate max-w-xs">{item.description}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2 text-xs text-gray-600 uppercase font-medium">
                        <MapPin className="w-3 h-3 text-gray-400" />
                        {item.location || 'NÃO DEFINIDO'}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={clsx(
                        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold",
                        item.quantity > 5 ? "bg-blue-50 text-blue-700" : (item.quantity > 0 ? "bg-orange-50 text-orange-700" : "bg-red-50 text-red-700")
                      )}>
                        {item.quantity} un
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs font-medium text-gray-600">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1.5">
                        {item.tags && item.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {item.tags.map(tagId => {
                              const tag = projectTags.find(t => t.id === tagId);
                              return (
                                <span key={tagId} 
                                  className={clsx(
                                    "text-[9px] font-bold px-1.5 py-0.5 border rounded transition-all shadow-sm",
                                    (!tag || !tag.color || !tag.color.startsWith('#')) ? (tag?.color || "bg-gray-50 text-gray-600 border-gray-200") : "text-white border-transparent"
                                  )}
                                  style={tag?.color?.startsWith('#') ? { backgroundColor: tag.color } : {}}
                                >
                                  {tag ? tag.label : 'Tag Removida'}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {item.taskId && (
                          <button 
                            onClick={() => navigate(`/project/${projectId}/kanban?taskId=${item.taskId}`)}
                            className="flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-[#ff7f00] transition-colors uppercase"
                          >
                            <ExternalLink className="w-3 h-3" />
                            TAREFA VINCULADA
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex -space-x-2 items-center justify-center">
                        {item.assignedTo && item.assignedTo.length > 0 ? item.assignedTo.map(uid => {
                          const member = projectMembers.find(m => m.uid === uid);
                          return (
                            <div key={uid} className="relative inline-block" title={member?.name}>
                              {member?.photoURL ? (
                                <img src={member.photoURL} alt={member.name} className="w-7 h-7 rounded-full border-2 border-white object-cover shadow-sm" />
                              ) : (
                                <div className="w-7 h-7 rounded-full border-2 border-white bg-[#ff7f00] flex items-center justify-center text-[8px] font-bold text-white uppercase">
                                  {member?.name?.charAt(0) || '?'}
                                </div>
                              )}
                            </div>
                          );
                        }) : (
                          <Users className="w-4 h-4 text-gray-300" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex justify-end gap-2 transition-opacity">
                        <button 
                          onClick={() => { setEditingItem(item); setIsModalOpen(true); }}
                          className="p-1.5 bg-white border border-gray-200 hover:bg-orange-50 text-gray-400 hover:text-[#ff7f00] rounded transition-all shadow-sm"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setItemToDelete(item)}
                          className="p-1.5 bg-white border border-gray-200 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded transition-all shadow-sm"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50/80 border-t border-gray-200">
                  <td className="px-4 py-4" colSpan={isSelectionMode ? 4 : 3}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                        {selectedItems.length > 0 ? "TOTAL SELECIONADO" : "TOTAL FILTRADO"}
                      </span>
                      <span className="text-xs font-bold text-gray-600 bg-gray-200/60 px-2 py-0.5 rounded-full">
                        {selectedOrFilteredItems.length} {selectedOrFilteredItems.length === 1 ? 'PRODUTO' : 'PRODUTOS'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right pr-12" colSpan={4}>
                    <div className="flex items-center justify-end gap-3">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">VALOR TOTAL:</span>
                      <span className="text-lg font-black text-[#ff7f00] tracking-wide">
                        {formatCurrency(filteredTotalValue)}
                      </span>
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {isModalOpen && (
          <ItemModal 
            projectId={projectId!} 
            item={editingItem} 
            members={projectMembers} 
            tasks={allTasks} 
            projectTags={projectTags}
            onClose={() => setIsModalOpen(false)} 
          />
        )}
        {itemToDelete && (
          <DeleteConfirmModal 
            title="EXCLUIR PRODUTO"
            message={`Tem certeza que deseja excluir o produto "${itemToDelete.name}"? Esta ação não pode ser desfeita.`}
            onConfirm={handleDeleteItem}
            onCancel={() => setItemToDelete(null)}
          />
        )}
        {isBulkDeleteConfirmOpen && (
          <DeleteConfirmModal 
            title="EXCLUIR PRODUTOS SELECIONADOS"
            message={`Tem certeza que deseja excluir os ${selectedItems.length} produtos selecionados? Esta ação não pode ser desfeita.`}
            onConfirm={handleBulkDelete}
            onCancel={() => setIsBulkDeleteConfirmOpen(false)}
          />
        )}
      </AnimatePresence>

      {isSettingsOpen && project && (
        <ProjectSettingsModal 
          onClose={() => setIsSettingsOpen(false)} 
          project={project} 
        />
      )}

      <MobileBottomNav onOpenProfile={() => setIsProfileOpen(true)} />

      <AnimatePresence>
        {isProfileOpen && (
          <UserProfileModal onClose={() => setIsProfileOpen(false)} />
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
              <p className="text-sm text-gray-500 font-medium">Gerando relatório do inventário...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface DeleteConfirmModalProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmModal({ title, message, onConfirm, onCancel }: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white border border-red-200 w-full max-w-md overflow-hidden rounded-2xl"
      >
        <div className="flex justify-between items-center p-6 border-b border-red-100 bg-red-50">
          <h3 className="text-xl font-bold text-red-700 flex items-center gap-2 uppercase tracking-widest">
            <AlertTriangle className="w-5 h-5" /> {title}
          </h3>
          <button onClick={onCancel} className="text-red-400 hover:text-red-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6 space-y-6">
          <p className="text-gray-700 leading-relaxed font-medium">{message}</p>
          <div className="flex gap-3">
            <button 
              onClick={onCancel}
              className="flex-1 bg-white border border-gray-300 text-gray-700 px-4 py-3 font-bold uppercase tracking-widest transition-colors rounded-lg hover:bg-gray-50 text-xs"
            >
              CANCELAR
            </button>
            <button 
              onClick={onConfirm}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-3 font-bold uppercase tracking-widest transition-colors rounded-lg shadow-lg shadow-red-100 text-xs"
            >
              EXCLUIR
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

interface ItemModalProps {
  projectId: string;
  item: InventoryItem | null;
  members: UserProfile[];
  tasks: Task[];
  projectTags: ProjectTag[];
  onClose: () => void;
}

function ItemModal({ projectId, item, members, tasks, projectTags, onClose }: ItemModalProps) {
  const { user } = useAuth();
  const [name, setName] = useState(item?.name || '');
  const [description, setDescription] = useState(item?.description || '');
  const [quantity, setQuantity] = useState(item?.quantity.toString() || '');
  const [unitPrice, setUnitPrice] = useState(item?.unitPrice.toString() || '');
  const [location, setLocation] = useState(item?.location || '');
  const [selectedTags, setSelectedTags] = useState<string[]>(item?.tags || []);
  const [assignedTo, setAssignedTo] = useState<string[]>(item?.assignedTo || []);
  const [taskId, setTaskId] = useState(item?.taskId || '');
  const [isSaving, setIsSaving] = useState(false);

  // New Tag Creation Support
  const [isAddingCustomTag, setIsAddingCustomTag] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState('');
  const [selectedTagColor, setSelectedTagColor] = useState(TAG_COLORS[0].color);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      const qNum = quantity === '' ? 0 : Number(quantity);
      const pNum = unitPrice === '' ? 0 : Number(unitPrice);

      const data = {
        projectId,
        name: name.trim(),
        description: description.trim(),
        quantity: qNum,
        unitPrice: pNum,
        totalPrice: qNum * pNum,
        location: location.trim(),
        tags: selectedTags,
        assignedTo,
        taskId: taskId || null,
        updatedAt: serverTimestamp(),
      };
      if (item) {
        await commitWrite(updateDoc(doc(db, 'inventory', item.id), data), { label: 'o item' });
      } else {
        await commitWrite(addDoc(collection(db, 'inventory'), { ...data, createdAt: serverTimestamp() }), { label: 'o item' });
      }
      await logAutomaticChange({
        projectId,
        source: 'Inventário',
        title: `${item ? 'Item atualizado' : 'Novo item'}: ${data.name}`,
        description: `${data.quantity} un. · ${data.location || 'Local não definido'} · ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.totalPrice)}`,
        actorUid: user?.uid,
        actorName: user?.displayName || user?.email || undefined,
        impactAmount: item ? data.totalPrice - item.totalPrice : data.totalPrice,
      });
      onClose();
    } catch (error) {
      logFirestoreError(error, OperationType.CREATE, 'inventory');
      alert(friendlyWriteError(error));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleTag = (tagId: string) => {
    setSelectedTags(prev => prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]);
  };

  const handleAddCustomTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagLabel.trim()) return;
    const label = newTagLabel.trim();
    const existing = projectTags.find(t => t.label.toLowerCase() === label.toLowerCase());
    
    if (existing) {
      if (!selectedTags.includes(existing.id)) setSelectedTags([...selectedTags, existing.id]);
    } else {
      const tagRef = doc(collection(db, 'projectTags'));
      setSelectedTags(prev => [...prev, tagRef.id]);
      try {
        await commitWrite(setDoc(tagRef, {
          projectId,
          label,
          color: selectedTagColor,
          createdAt: serverTimestamp()
        }), { label: 'a tag' });
      } catch (error) {
        setSelectedTags(prev => prev.filter(t => t !== tagRef.id));
        logFirestoreError(error, OperationType.CREATE, 'projectTags');
        alert(friendlyWriteError(error));
      }
    }
    setNewTagLabel('');
    setIsAddingCustomTag(false);
  };

  const toggleAssignee = (uid: string) => {
    setAssignedTo(prev => prev.includes(uid) ? prev.filter(u => u !== uid) : [...prev, uid]);
  };

  const calculateTotal = () => {
    const qNum = quantity === '' ? 0 : Number(quantity);
    const pNum = unitPrice === '' ? 0 : Number(unitPrice);
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(qNum * pNum);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white border border-gray-200 w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-gray-100 shrink-0">
          <h3 className="text-xl font-bold text-gray-900 uppercase tracking-widest">{item ? 'EDITAR PRODUTO' : 'NOVO PRODUTO'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors"><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide text-gray-900">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">NOME DO PRODUTO *</label>
                <input 
                  type="text" 
                  required 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg placeholder-gray-400" 
                  placeholder="" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">SOBRE / DESCRIÇÃO</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] resize-none h-32 rounded-lg" placeholder="" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">QUANTIDADE</label>
                  <input 
                    type="number" 
                    required 
                    min="0" 
                    value={quantity} 
                    onChange={(e) => setQuantity(e.target.value)} 
                    className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">PREÇO UNITÁRIO (R$)</label>
                  <input 
                    type="number" 
                    required 
                    min="0" 
                    step="0.01" 
                    value={unitPrice} 
                    onChange={(e) => setUnitPrice(e.target.value)} 
                    className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm" 
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">DEPÓSITO / LOCALIZAÇÃO</label>
                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-medium rounded-lg" placeholder="" />
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                   <TagIcon className="w-4 h-4" /> TAGS
                </label>
                <div className="flex flex-wrap gap-2 mb-4">
                  {projectTags.map(tag => (
                      <button 
                        key={tag.id} 
                        type="button" 
                        onClick={() => toggleTag(tag.id)} 
                        className={clsx(
                          "px-3 py-1.5 text-[10px] font-bold border rounded-md transition-all shadow-sm", 
                          selectedTags.includes(tag.id) 
                            ? ((!tag.color || !tag.color.startsWith('#')) ? tag.color : 'text-white border-transparent')
                            : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
                        )}
                        style={selectedTags.includes(tag.id) && tag.color?.startsWith('#') ? { backgroundColor: tag.color } : {}}
                      >
                        {tag.label}
                      </button>
                  ))}
                </div>
                {isAddingCustomTag ? (
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-3">
                    <input
                      type="text" autoFocus value={newTagLabel} onChange={(e) => setNewTagLabel(e.target.value)}
                      placeholder="Nome da tag..."
                      className="w-full bg-white border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-[#ff7f00] rounded-lg"
                    />
                    <div className="flex flex-wrap gap-1.5 justify-center">
                      {TAG_COLORS.map(tc => (
                        <button
                          key={tc.id}
                          type="button"
                          onClick={() => setSelectedTagColor(tc.color)}
                          className={clsx(
                            "w-6 h-6 rounded-md border-2 transition-all",
                            selectedTagColor === tc.color ? "border-gray-900 scale-110" : "border-transparent"
                          )}
                        >
                          <div className={clsx("w-full h-full rounded-[3px]", tc.color.split(' ')[0])} />
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                       <button onClick={handleAddCustomTag} type="button" className="flex-1 bg-[#ff7f00] text-white py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-orange-600 transition-all active:scale-95">CRIAR</button>
                       <button onClick={() => setIsAddingCustomTag(false)} type="button" className="px-3 py-2 bg-white border border-gray-200 text-gray-400 rounded-lg hover:bg-gray-50 transition-all"><X className="w-3 h-3" /></button>
                    </div>
                  </div>
                ) : (
                  <button 
                    type="button"
                    onClick={() => setIsAddingCustomTag(true)}
                    className="w-full py-2 border-2 border-dashed border-gray-200 text-gray-400 hover:border-[#ff7f00] hover:text-[#ff7f00] rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest"
                  >
                    + NOVA TAG
                  </button>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">RESPONSÁVEIS</label>
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-1.5 max-h-48 overflow-y-auto">
                  {members.map(member => (
                    <div key={member.uid} onClick={() => toggleAssignee(member.uid)} className={clsx("flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all", assignedTo.includes(member.uid) ? "bg-orange-50 border border-orange-100" : "hover:bg-white border border-transparent")}>
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full overflow-hidden border border-gray-200 bg-white">{member.photoURL ? <img src={member.photoURL} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-gray-400">{member?.name?.charAt(0) || '?'}</div>}</div>
                        <span className={clsx("text-xs font-bold", assignedTo.includes(member.uid) ? "text-[#ff7f00]" : "text-gray-600")}>{member.name}</span>
                      </div>
                      <div className={clsx("w-4 h-4 rounded-full border transition-all flex items-center justify-center", assignedTo.includes(member.uid) ? "bg-[#ff7f00] border-[#ff7f00]" : "bg-white border-gray-300")}>{assignedTo.includes(member.uid) && <Check className="w-2.5 h-2.5 text-white stroke-[4px]" />}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">VINCULAR A UMA TAREFA</label>
                <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className="w-full bg-white border border-gray-300 px-4 py-3 text-xs font-bold text-gray-900 focus:outline-none focus:border-[#ff7f00] appearance-none rounded-lg bg-no-repeat bg-[right_1rem_center] cursor-pointer">
                  <option value="">Nenhuma tarefa</option>
                  {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </div>
            </div>
          </div>
        </form>
        <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex justify-between items-center shrink-0 rounded-b-2xl">
          <div className="flex flex-col"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">SOMA TOTAL</span><span className="text-xl font-bold text-[#ff7f00]">{calculateTotal()}</span></div>
          <div className="flex gap-3">
            <button onClick={onClose} type="button" className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-gray-50 transition-colors">CANCELAR</button>
            <button onClick={handleSubmit} disabled={isSaving || !name.trim()} className="px-8 py-2.5 bg-[#ff7f00] text-white font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-all active:scale-95">{isSaving ? 'SALVANDO...' : 'SALVAR'}</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
