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
  orderBy
} from 'firebase/firestore';
import { Project, UserProfile, ProjectStakeholder, ProjectTag } from '../types';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  Tag as TagIcon, 
  Users,
  X,
  AlertTriangle,
  Briefcase,
  Grid3X3,
  List,
  MoveRight,
  Loader2
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import ProjectSettingsModal from './ProjectSettingsModal';
import { handleFirestoreError, logFirestoreError, OperationType } from '../utils/errorHandlers';
import { commitWrite, friendlyWriteError } from '../utils/firestoreWrite';
import { motion, AnimatePresence } from 'motion/react';
import { TAG_COLORS } from './TaskDetailsModal';
// @ts-ignore
import logoIbit from '../media/ibitlogo.svg';
import ExportButton from './export/ExportButton';
import { buildOfficialFooterHTML, captureContainerAsPdf, PdfExportOptions } from '../utils/export/pdfEngine';
import { exportToExcel } from '../utils/export/excelEngine';

type TabType = 'Lista' | 'Matriz' | 'Plano';

const ENGAGEMENT_LEVELS = [
  { id: 'Desinformado', label: 'Desinformado', color: 'bg-white text-gray-700 border-gray-300' },
  { id: 'Resistente', label: 'Resistente', color: 'bg-white text-gray-700 border-gray-300' },
  { id: 'Neutro', label: 'Neutro', color: 'bg-white text-gray-700 border-gray-300' },
  { id: 'Apoiador', label: 'Apoiador', color: 'bg-white text-gray-700 border-gray-300' },
  { id: 'Engajado', label: 'Engajado', color: 'bg-white text-gray-700 border-gray-300' }
];

export default function Stakeholders() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [project, setProject] = useState<Project | null>(null);
  const [projectMembers, setProjectMembers] = useState<UserProfile[]>([]);
  const [stakeholders, setStakeholders] = useState<ProjectStakeholder[]>([]);
  const [projectTags, setProjectTags] = useState<ProjectTag[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('Lista');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProjectStakeholder | null>(null);
  const [itemToDelete, setItemToDelete] = useState<ProjectStakeholder | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Communication Plan Modal State
  const [isCommPlanModalOpen, setIsCommPlanModalOpen] = useState(false);
  const [editingCommPlan, setEditingCommPlan] = useState<{ stakeholderId: string, planId?: string } | null>(null);

  // 1. Fetch Project Data
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

  // 3. Fetch Stakeholders and Tags
  useEffect(() => {
    if (!projectId) return;

    const qStakeholders = query(collection(db, 'projectStakeholders'), where('projectId', '==', projectId));
    const unsubStakeholders = onSnapshot(qStakeholders, (snapshot) => {
      const data: ProjectStakeholder[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as ProjectStakeholder);
      });
      setStakeholders(data);
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
      unsubStakeholders();
      unsubTags();
    };
  }, [projectId]);

  const filteredItems = stakeholders.filter(item => {
    const searchLower = searchQuery.toLowerCase();
    const matchesText = item.name.toLowerCase().includes(searchLower) ||
      item.organization?.toLowerCase().includes(searchLower) ||
      item.role?.toLowerCase().includes(searchLower);
    
    // Search in tags
    const matchesTag = item.tags?.some(tagId => {
      const tag = projectTags.find(pt => pt.id === tagId);
      return tag?.label.toLowerCase().includes(searchLower);
    });

    return matchesText || matchesTag;
  });

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;
    try {
      await commitWrite(deleteDoc(doc(db, 'projectStakeholders', itemToDelete.id)), { label: 'a exclusão do stakeholder' });
      setItemToDelete(null);
    } catch (error) {
      logFirestoreError(error, OperationType.DELETE, 'projectStakeholders');
      alert(friendlyWriteError(error));
    }
  };

  const getEngagementBadge = (level?: string, type: 'A' | 'D' = 'A') => {
    if (!level) return null;
    const config = ENGAGEMENT_LEVELS.find(l => l.id === level);
    if (!config) return null;
    return (
      <span className={clsx("relative z-10 inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border", config.color)} title={`${type === 'A' ? 'Atual' : 'Desejado'}: ${level}`}>
        {type}
      </span>
    );
  };

  const handleExportPDF = async (options: PdfExportOptions) => {
    if (isExporting || stakeholders.length === 0) return;
    setIsExporting(true);
    await new Promise(r => setTimeout(r, 100));

    try {
      const TOTAL_W = activeTab === 'Matriz' ? 2200 : 1600;
      
      const container = document.createElement('div');
      container.style.cssText = `position:fixed;left:0;top:0;background:#fff;padding:50px;font-family:'Lufga','Inter',system-ui,-apple-system,sans-serif;width:${TOTAL_W}px;box-sizing:border-box;z-index:-50;overflow:visible;`;
      document.body.appendChild(container);

      const titleText = activeTab === 'Lista' ? 'STAKEHOLDER LIST' : activeTab === 'Matriz' ? 'STAKEHOLDER ENGAGEMENT MATRIX' : 'COMMUNICATION PLAN';
      const projectTitle = project?.name?.toUpperCase() || 'PROJECT';
      const projectSubtitle = project?.shortId ? `PROJECT ID: #${project.shortId}` : '';

      const headerHTML = options.chrome ? `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #ff7f00;box-sizing:border-box;">
          <div>
            <div style="font-size:28px;font-weight:900;color:#111;text-transform:uppercase;letter-spacing:0.1em;line-height:1.2;">${titleText}</div>
            <div style="font-size:14px;color:#4b5563;font-weight:700;text-transform:uppercase;letter-spacing:0.15em;margin-top:6px;display:flex;gap:12px;align-items:center;">
              <span>${projectTitle}</span>
              ${projectSubtitle ? `<span style="color:#d1d5db;">|</span><span>${projectSubtitle}</span>` : ''}
            </div>
          </div>
        </div>
      ` : '';

      let contentHTML = '';

      if (activeTab === 'Lista') {
        let rowsHTML = '';
        filteredItems.forEach(item => {
          let tagsHTML = '';
          if (item.tags && item.tags.length > 0) {
            item.tags.forEach(tagId => {
              const tag = projectTags.find(t => t.id === tagId);
              if (tag) {
                const colorStyle = tag.color?.startsWith('#') 
                  ? `background-color:${tag.color};color:#ffffff;border-color:transparent;`
                  : `background-color:#f3f4f6;color:#374151;border-color:#e5e7eb;`;
                tagsHTML += `<span style="font-size:11px;font-weight:800;padding:3px 8px;border:1px solid;border-radius:6px;margin-right:4px;white-space:nowrap;display:inline-block;${colorStyle}">${tag.label}</span>`;
              }
            });
          } else {
            tagsHTML = '<span style="color:#9ca3af;font-size:12px;">-</span>';
          }

          const infLevel = item.influenceLevel === 'Alto' ? 'High' : item.influenceLevel === 'Médio' ? 'Medium' : item.influenceLevel === 'Baixo' ? 'Low' : '-';
          const infColor = item.influenceLevel === 'Alto' ? 'background:#fee2e2;color:#b91c1c;' : item.influenceLevel === 'Médio' ? 'background:#fef9c3;color:#854d0e;' : item.influenceLevel === 'Baixo' ? 'background:#dbeafe;color:#1e40af;' : 'color:#9ca3af;';

          const intLevel = item.interestLevel === 'Alto' ? 'High' : item.interestLevel === 'Médio' ? 'Medium' : item.interestLevel === 'Baixo' ? 'Low' : '-';
          const intColor = item.interestLevel === 'Alto' ? 'background:#fee2e2;color:#b91c1c;' : item.interestLevel === 'Médio' ? 'background:#fef9c3;color:#854d0e;' : item.interestLevel === 'Baixo' ? 'background:#dbeafe;color:#1e40af;' : 'color:#9ca3af;';

          let engagementHTML = '';
          if (item.engagementCurrent) {
            const currentBadge = '<span style="width:28px;height:28px;border-radius:50%;background:#ffffff;border:2.5px solid #d1d5db;color:#374151;display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;box-sizing:border-box;">A</span>';
            const desiredBadge = '<span style="width:28px;height:28px;border-radius:50%;background:#ffffff;border:2.5px solid #d1d5db;color:#374151;display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;box-sizing:border-box;">D</span>';
            if (item.engagementCurrent === item.engagementDesired) {
              engagementHTML = `<div style="display:flex;align-items:center;justify-content:center;gap:6px;">${currentBadge}${desiredBadge}</div>`;
            } else {
              engagementHTML = `
                <div style="display:flex;align-items:center;justify-content:center;gap:6px;">
                  ${currentBadge}
                  <span style="font-size:12px;color:#9ca3af;font-weight:bold;">➔</span>
                  ${desiredBadge}
                </div>
              `;
            }
          } else {
            engagementHTML = '<span style="color:#9ca3af;font-size:12px;">-</span>';
          }

          rowsHTML += `
            <tr style="border-bottom:1px solid #f3f4f6;">
              <td style="padding:12px 12px;box-sizing:border-box;">
                <div style="display:flex;align-items:center;gap:12px;">
                  <div style="width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;border:1px solid #ffedd5;background:#fff7ed;color:#ff7f00;box-sizing:border-box;">
                    ${item.name.charAt(0).toUpperCase()}
                  </div>
                  <div style="display:flex;flex-direction:column;text-align:left;">
                    <span style="font-weight:800;font-size:14px;color:#111827;text-transform:uppercase;letter-spacing:0.02em;">${item.name}</span>
                    <span style="font-size:11px;color:#6b7280;font-weight:600;margin-top:2px;">${item.role || '-'}</span>
                  </div>
                </div>
              </td>
              <td style="padding:12px 12px;font-size:13px;font-weight:600;color:#374151;text-align:left;box-sizing:border-box;">${item.organization || '-'}</td>
              <td style="padding:12px 12px;font-size:13px;font-weight:600;color:#374151;text-align:left;box-sizing:border-box;">${item.contactInfo || '-'}</td>
              <td style="padding:12px 12px;text-align:left;box-sizing:border-box;"><div style="display:flex;flex-wrap:wrap;gap:4px;">${tagsHTML}</div></td>
              <td style="padding:12px 12px;text-align:center;box-sizing:border-box;">
                <span style="font-size:11px;font-weight:800;padding:4px 10px;border-radius:6px;text-transform:uppercase;letter-spacing:0.05em;box-sizing:border-box;${infColor}">
                  ${infLevel}
                </span>
              </td>
              <td style="padding:12px 12px;text-align:center;box-sizing:border-box;">
                <span style="font-size:11px;font-weight:800;padding:4px 10px;border-radius:6px;text-transform:uppercase;letter-spacing:0.05em;box-sizing:border-box;${intColor}">
                  ${intLevel}
                </span>
              </td>
              <td style="padding:12px 12px;text-align:center;box-sizing:border-box;">${engagementHTML}</td>
            </tr>
          `;
        });

        contentHTML = `
          <div style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#fff;box-sizing:border-box;">
            <table style="width:100%;border-collapse:collapse;font-size:12px;box-sizing:border-box;">
              <thead>
                <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
                  <th style="padding:16px 12px;text-align:left;font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;width:25%;box-sizing:border-box;">STAKEHOLDER / ROLE</th>
                  <th style="padding:16px 12px;text-align:left;font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;width:15%;box-sizing:border-box;">ORGANIZATION</th>
                  <th style="padding:16px 12px;text-align:left;font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;width:15%;box-sizing:border-box;">CONTACT</th>
                  <th style="padding:16px 12px;text-align:left;font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;width:20%;box-sizing:border-box;">TAGS</th>
                  <th style="padding:16px 12px;text-align:center;font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;width:8%;box-sizing:border-box;">INFLUENCE</th>
                  <th style="padding:16px 12px;text-align:center;font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;width:8%;box-sizing:border-box;">INTEREST</th>
                  <th style="padding:16px 12px;text-align:center;font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;width:9%;box-sizing:border-box;">ENGAGEMENT (A/D)</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHTML}
              </tbody>
            </table>
          </div>
        `;
      } else if (activeTab === 'Matriz') {
        const translatedLevels = [
          { id: 'Desinformado', label: 'Uninformed' },
          { id: 'Resistente', label: 'Resistant' },
          { id: 'Neutro', label: 'Neutral' },
          { id: 'Apoiador', label: 'Supportive' },
          { id: 'Engajado', label: 'Engaged' }
        ];

        let headerColsHTML = '<th style="padding:16px 12px;text-align:left;font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;width:25%;border-right:1px solid #e5e7eb;box-sizing:border-box;">STAKEHOLDER</th>';
        translatedLevels.forEach(level => {
          headerColsHTML += `
            <th style="padding:16px 12px;text-align:center;font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;width:11%;border-right:1px solid #e5e7eb;box-sizing:border-box;">
              ${level.label}
            </th>
          `;
        });
        headerColsHTML += '<th style="padding:16px 12px;text-align:left;font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;width:20%;box-sizing:border-box;">ACTION & STRATEGY</th>';

        let rowsHTML = '';
        stakeholders.forEach(item => {
          const currIdx = ENGAGEMENT_LEVELS.findIndex(l => l.id === item.engagementCurrent);
          const desIdx = ENGAGEMENT_LEVELS.findIndex(l => l.id === item.engagementDesired);

          let cellsHTML = '';
          translatedLevels.forEach((level, colIdx) => {
            const hasC = item.engagementCurrent === level.id;
            const hasD = item.engagementDesired === level.id;

            let cellContentHTML = '';
            const badgeA = '<span style="width:24px;height:24px;border-radius:50%;background:#ffffff;border:2px solid #d1d5db;color:#374151;display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:11px;z-index:10;position:relative;box-sizing:border-box;">A</span>';
            const badgeD = '<span style="width:24px;height:24px;border-radius:50%;background:#ffffff;border:2px solid #d1d5db;color:#374151;display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:11px;z-index:10;position:relative;box-sizing:border-box;">D</span>';

            if (hasC && hasD) {
              cellContentHTML = `<div style="display:flex;align-items:center;justify-content:center;gap:4px;position:relative;z-index:10;box-sizing:border-box;">${badgeA}${badgeD}</div>`;
            } else if (hasC) {
              cellContentHTML = badgeA;
            } else if (hasD) {
              cellContentHTML = badgeD;
            }

            let arrowLineHTML = '';
            if (hasC && item.engagementDesired && currIdx !== -1 && desIdx !== -1 && currIdx !== desIdx) {
              const diff = Math.abs(desIdx - currIdx);
              const widthPct = `calc(${diff * 100}% - 20px)`;
              
              const borderLeftStyle = currIdx < desIdx ? 'border-top:4px solid transparent;border-bottom:4px solid transparent;border-left:6px solid #9ca3af;' : '';
              const borderRightStyle = currIdx > desIdx ? 'border-top:4px solid transparent;border-bottom:4px solid transparent;border-right:6px solid #9ca3af;' : '';

              arrowLineHTML = `
                <div style="position:absolute;top:50%;transform:translateY(-50%);display:flex;align-items:center;z-index:1;box-sizing:border-box;
                  left: ${currIdx < desIdx ? 'calc(50% + 12px)' : 'auto'};
                  right: ${currIdx > desIdx ? 'calc(50% + 12px)' : 'auto'};
                  width: ${widthPct};
                ">
                  ${currIdx > desIdx ? `<div style="width:0;height:0;${borderRightStyle}margin-right:-1px;z-index:5;box-sizing:border-box;"></div>` : ''}
                  <div style="height:2px;background:#9ca3af;width:100%;box-sizing:border-box;"></div>
                  ${currIdx < desIdx ? `<div style="width:0;height:0;${borderLeftStyle}margin-left:-1px;z-index:5;box-sizing:border-box;"></div>` : ''}
                </div>
              `;
            }

            cellsHTML += `
              <td style="padding:10px 0px;border-right:1px solid #e5e7eb;position:relative;text-align:center;vertical-align:middle;box-sizing:border-box;">
                <div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;box-sizing:border-box;">
                  ${cellContentHTML}
                  ${arrowLineHTML}
                </div>
              </td>
            `;
          });

          rowsHTML += `
            <tr style="border-bottom:1px solid #f3f4f6;">
              <td style="padding:10px 12px;border-right:1px solid #e5e7eb;box-sizing:border-box;">
                <div style="display:flex;flex-direction:column;text-align:left;">
                  <span style="font-weight:800;font-size:14px;color:#111827;text-transform:uppercase;letter-spacing:0.02em;">${item.name}</span>
                  <span style="font-size:11px;color:#6b7280;font-weight:600;margin-top:2px;">${item.organization || item.role || '-'}</span>
                </div>
              </td>
              ${cellsHTML}
              <td style="padding:10px 12px;font-size:12px;font-weight:600;color:#4b5563;text-align:left;vertical-align:middle;white-space:pre-wrap;max-width:350px;box-sizing:border-box;">
                ${item.actionStrategy || '<span style="color:#d1d5db;font-style:italic;">No strategy defined</span>'}
              </td>
            </tr>
          `;
        });

        contentHTML = `
          <div style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#fff;box-sizing:border-box;">
            <table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;box-sizing:border-box;">
              <thead>
                <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
                  ${headerColsHTML}
                </tr>
              </thead>
              <tbody>
                ${rowsHTML}
              </tbody>
            </table>
          </div>
        `;
      } else if (activeTab === 'Plano') {
        let rowsHTML = '';
        const allComms: { stakeholder: ProjectStakeholder, comm: any }[] = [];
        stakeholders.forEach(sh => {
          if (sh.communications && sh.communications.length > 0) {
            sh.communications.forEach(c => allComms.push({ stakeholder: sh, comm: c }));
          }
        });

        allComms.forEach(({ stakeholder, comm }) => {
          const member = projectMembers.find(m => m.uid === comm.responsible);
          const respName = member ? member.name.toUpperCase() : '-';

          rowsHTML += `
            <tr style="border-bottom:1px solid #f3f4f6;">
              <td style="padding:12px 12px;box-sizing:border-box;">
                <div style="display:flex;align-items:center;gap:12px;">
                  <div style="width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;border:1px solid #ffedd5;background:#fff7ed;color:#ff7f00;box-sizing:border-box;">
                    ${stakeholder.name.charAt(0).toUpperCase()}
                  </div>
                  <div style="display:flex;flex-direction:column;text-align:left;">
                    <span style="font-weight:800;font-size:14px;color:#111827;text-transform:uppercase;letter-spacing:0.02em;">${stakeholder.name}</span>
                    <span style="font-size:11px;color:#6b7280;font-weight:600;margin-top:2px;">${stakeholder.role || '-'}</span>
                  </div>
                </div>
              </td>
              <td style="padding:12px 12px;font-size:13px;font-weight:600;color:#374151;text-align:left;text-transform:uppercase;box-sizing:border-box;">${comm.what}</td>
              <td style="padding:12px 12px;font-size:13px;font-weight:600;color:#374151;text-align:center;text-transform:uppercase;box-sizing:border-box;">${comm.method}</td>
              <td style="padding:12px 12px;font-size:13px;font-weight:600;color:#374151;text-align:center;text-transform:uppercase;box-sizing:border-box;">${comm.when}</td>
              <td style="padding:12px 12px;font-size:13px;font-weight:600;color:#374151;text-align:center;text-transform:uppercase;box-sizing:border-box;">${respName}</td>
            </tr>
          `;
        });

        contentHTML = `
          <div style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#fff;box-sizing:border-box;">
            <table style="width:100%;border-collapse:collapse;font-size:12px;box-sizing:border-box;">
              <thead>
                <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
                  <th style="padding:16px 12px;text-align:left;font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;width:25%;box-sizing:border-box;">WHO TO CONTACT?</th>
                  <th style="padding:16px 12px;text-align:left;font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;width:25%;box-sizing:border-box;">WHAT TO COMMUNICATE?</th>
                  <th style="padding:16px 12px;text-align:center;font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;width:15%;box-sizing:border-box;">COMMUNICATION METHOD</th>
                  <th style="padding:16px 12px;text-align:center;font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;width:15%;box-sizing:border-box;">WHEN TO COMMUNICATE?</th>
                  <th style="padding:16px 12px;text-align:center;font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;width:20%;box-sizing:border-box;">RESPONSIBLE</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHTML}
              </tbody>
            </table>
          </div>
        `;
      }

      const legendHTML = `
        <div style="display:flex;justify-content:center;gap:32px;margin-top:32px;padding-top:20px;border-top:1px solid #e5e7eb;box-sizing:border-box;">
          <div style="display:flex;align-items:center;gap:8px;box-sizing:border-box;">
            <span style="width:24px;height:24px;border-radius:50%;background:#ffffff;border:2px solid #9ca3af;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:11px;color:#374151;box-sizing:border-box;">A</span>
            <span style="font-size:11px;font-weight:800;color:#4b5563;text-transform:uppercase;letter-spacing:0.1em;">Actual Engagement Level</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;box-sizing:border-box;">
            <span style="width:24px;height:24px;border-radius:50%;background:#ffffff;border:2px solid #9ca3af;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:11px;color:#374151;box-sizing:border-box;">D</span>
            <span style="font-size:11px;font-weight:800;color:#4b5563;text-transform:uppercase;letter-spacing:0.1em;">Desired Engagement Level</span>
          </div>
        </div>
      `;

      const footerHTML = options.chrome
        ? buildOfficialFooterHTML(logoIbit, `Exported from the IBIT platform on ${new Date().toLocaleDateString('en-US')}`)
        : '';

      container.innerHTML = `
        ${headerHTML}
        ${contentHTML}
        ${activeTab === 'Matriz' ? legendHTML : ''}
        ${footerHTML}
      `;

      await new Promise(r => setTimeout(r, 400));

      const pageName = activeTab === 'Lista' ? 'List' : activeTab === 'Matriz' ? 'Engagement-Matrix' : 'Communication-Plan';
      const projectNameStr = (project?.name || 'project').replace(/\s+/g, '-');
      await captureContainerAsPdf(container, {
        filename: `stakeholders-${projectNameStr}-${pageName}-${new Date().toISOString().substring(0, 10)}.pdf`,
        widthPx: options.widthPx,
        heightPx: options.heightPx,
        dpi: options.dpi,
        chrome: options.chrome,
      });

      document.body.removeChild(container);
    } catch (err) {
      console.error('[Stakeholders PDF Export] Error:', err);
      alert('Error exporting PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    const projectNameStr = (project?.name || 'project').replace(/\s+/g, '-');

    // Excel content must mirror whichever tab is active, same as the PDF export does.
    if (activeTab === 'Plano') {
      const allComms: { stakeholder: ProjectStakeholder; comm: any }[] = [];
      stakeholders.forEach(sh => {
        if (sh.communications && sh.communications.length > 0) {
          sh.communications.forEach(c => allComms.push({ stakeholder: sh, comm: c }));
        }
      });
      await exportToExcel({
        filename: `stakeholders-${projectNameStr}-plano-comunicacao-${new Date().toISOString().substring(0, 10)}.xlsx`,
        sheetName: 'Plano de Comunicação',
        title: `Plano de Comunicação — ${project?.name || 'Projeto'}`,
        columns: [
          { header: 'Quem Contatar', key: 'stakeholder', type: 'string', width: 26, value: (r) => r.stakeholder.name },
          { header: 'O que Comunicar', key: 'what', type: 'string', width: 30, value: (r) => r.comm.what },
          { header: 'Método', key: 'method', type: 'string', width: 18, value: (r) => r.comm.method },
          { header: 'Quando', key: 'when', type: 'string', width: 16, value: (r) => r.comm.when },
          {
            header: 'Responsável',
            key: 'responsible',
            type: 'string',
            width: 22,
            value: (r) => projectMembers.find(m => m.uid === r.comm.responsible)?.name || '-',
          },
        ],
        rows: allComms,
      });
      return;
    }

    if (activeTab === 'Matriz') {
      await exportToExcel({
        filename: `stakeholders-${projectNameStr}-matriz-engajamento-${new Date().toISOString().substring(0, 10)}.xlsx`,
        sheetName: 'Matriz de Engajamento',
        title: `Matriz de Engajamento — ${project?.name || 'Projeto'}`,
        columns: [
          { header: 'Stakeholder', key: 'name', type: 'string', width: 26 },
          { header: 'Organização/Papel', key: 'org', type: 'string', width: 22, value: (r) => r.organization || r.role || '-' },
          { header: 'Engajamento Atual', key: 'engagementCurrent', type: 'string', width: 18 },
          { header: 'Engajamento Desejado', key: 'engagementDesired', type: 'string', width: 20 },
          { header: 'Ação e Estratégia', key: 'actionStrategy', type: 'string', width: 36 },
        ],
        rows: stakeholders,
      });
      return;
    }

    // 'Lista' tab (default): full stakeholder directory.
    await exportToExcel({
      filename: `stakeholders-${projectNameStr}-lista-${new Date().toISOString().substring(0, 10)}.xlsx`,
      sheetName: 'Stakeholders',
      title: `Stakeholders — ${project?.name || 'Projeto'}`,
      columns: [
        { header: 'Nome', key: 'name', type: 'string', width: 26 },
        { header: 'Papel', key: 'role', type: 'string', width: 20 },
        { header: 'Organização', key: 'organization', type: 'string', width: 22 },
        { header: 'Contato', key: 'contactInfo', type: 'string', width: 22 },
        { header: 'Influência', key: 'influenceLevel', type: 'string', width: 14 },
        { header: 'Interesse', key: 'interestLevel', type: 'string', width: 14 },
        { header: 'Engajamento Atual', key: 'engagementCurrent', type: 'string', width: 18 },
        { header: 'Engajamento Desejado', key: 'engagementDesired', type: 'string', width: 20 },
        {
          header: 'Tags',
          key: 'tags',
          type: 'string',
          width: 24,
          value: (r) => (r.tags || []).map((tagId: string) => projectTags.find(t => t.id === tagId)?.label).filter(Boolean).join(', '),
        },
      ],
      rows: filteredItems,
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

        {/* Subheader / Tabs */}
        <div className="bg-white border-b border-gray-100 px-3 sm:px-6 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0 shadow-sm z-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 w-full sm:w-auto">
            <div className="flex bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('Lista')}
                className={clsx(
                  "flex items-center gap-2 px-4 py-2 rounded-md font-bold text-xs uppercase tracking-widest transition-all",
                  activeTab === 'Lista' ? "bg-white text-[#ff7f00] shadow-sm" : "text-gray-500 hover:text-gray-900"
                )}
              >
                <List className="w-4 h-4" />
                <span className="hidden sm:inline">LISTA</span>
              </button>
              <button
                onClick={() => setActiveTab('Matriz')}
                className={clsx(
                  "flex items-center gap-2 px-4 py-2 rounded-md font-bold text-xs uppercase tracking-widest transition-all",
                  activeTab === 'Matriz' ? "bg-white text-[#ff7f00] shadow-sm" : "text-gray-500 hover:text-gray-900"
                )}
              >
                <Grid3X3 className="w-4 h-4" />
                <span className="hidden sm:inline">MATRIZ DE ENGAJAMENTO</span>
                <span className="sm:hidden">MATRIZ</span>
              </button>
              <button
                onClick={() => setActiveTab('Plano')}
                className={clsx(
                  "flex items-center gap-2 px-4 py-2 rounded-md font-bold text-xs uppercase tracking-widest transition-all",
                  activeTab === 'Plano' ? "bg-white text-[#ff7f00] shadow-sm" : "text-gray-500 hover:text-gray-900"
                )}
              >
                <Briefcase className="w-4 h-4" />
                <span className="hidden sm:inline">PLANO DE COMUNICAÇÃO</span>
                <span className="sm:hidden">PLANO</span>
              </button>
            </div>

            {activeTab === 'Lista' && (
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="text"
                  placeholder="Procurar stakeholder..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 focus:outline-none focus:border-[#ff7f00] text-sm font-medium rounded-lg transition-all"
                />
              </div>
            )}
          </div>

          <div className="flex gap-2 w-full sm:w-auto shrink-0 justify-center">
            <ExportButton
              formats={['pdf', 'excel']}
              title="Exportar Stakeholders"
              onExportPdf={handleExportPDF}
              onExportExcel={handleExportExcel}
              disabledFormats={{ pdf: stakeholders.length === 0, excel: stakeholders.length === 0 }}
              className="flex-1 sm:flex-none"
            />

            {activeTab === 'Plano' ? (
              <button 
                onClick={() => { setEditingCommPlan(null); setIsCommPlanModalOpen(true); }}
                className="bg-[#ff7f00] hover:bg-orange-600 text-white px-4 sm:px-5 py-2 flex items-center justify-center gap-2 transition-all font-bold uppercase tracking-widest text-xs rounded-lg active:scale-95 shadow-md shadow-orange-100 flex-1 sm:flex-none"
              >
                <Plus className="w-4 h-4" />
                <span>NOVO PLANO</span>
              </button>
            ) : (
              <button 
                onClick={() => { setEditingItem(null); setIsModalOpen(true); }}
                className="bg-[#ff7f00] hover:bg-orange-600 text-white px-4 sm:px-5 py-2 flex items-center justify-center gap-2 transition-all font-bold uppercase tracking-widest text-xs rounded-lg active:scale-95 shadow-md shadow-orange-100 flex-1 sm:flex-none"
              >
                <Plus className="w-4 h-4" />
                <span>NOVO STAKEHOLDER</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 sm:p-6 scrollbar-hide mobile-pb-nav">
          
          {activeTab === 'Lista' && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest min-w-[200px]">NOME / PAPEL</th>
                    <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">ORGANIZAÇÃO</th>
                    <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">CONTATO</th>
                    <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">TAGS</th>
                    <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">INFLUÊNCIA</th>
                    <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">INTERESSE</th>
                    <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">ENGAJAMENTO (A/D)</th>
                    <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">AÇÕES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredItems.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          {item.photoURL ? (
                            <img src={item.photoURL} alt={item.name} className="w-8 h-8 rounded-full border border-gray-200 object-cover" />
                          ) : (
                            <div className="w-8 h-8 bg-orange-100 text-[#ff7f00] rounded-full flex items-center justify-center font-bold text-xs border border-orange-200">
                              {item.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="flex flex-col">
                            <span className="font-bold text-sm text-gray-900 tracking-wide">{item.name}</span>
                            {item.role && <span className="text-xs text-gray-500">{item.role}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-xs text-gray-600 font-medium">
                          {item.organization || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-xs text-gray-600 font-medium">
                          {item.contactInfo || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1">
                          {item.tags && item.tags.length > 0 ? item.tags.map(tagId => {
                            const tag = projectTags.find(t => t.id === tagId);
                            if (!tag) return null;
                            return (
                              <span key={tagId} 
                                className={clsx(
                                  "text-[9px] font-bold px-1.5 py-0.5 border rounded transition-all shadow-sm",
                                  (!tag.color || !tag.color.startsWith('#')) ? (tag.color || "bg-gray-50 text-gray-600 border-gray-200") : "text-white border-transparent"
                                )}
                                style={tag.color?.startsWith('#') ? { backgroundColor: tag.color } : {}}
                              >
                                {tag.label}
                              </span>
                            );
                          }) : <span className="text-xs text-gray-400">-</span>}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={clsx("text-xs font-bold px-2 py-1 rounded-md", 
                          item.influenceLevel === 'Alto' ? 'bg-red-50 text-red-600' :
                          item.influenceLevel === 'Médio' ? 'bg-yellow-50 text-yellow-600' :
                          item.influenceLevel === 'Baixo' ? 'bg-blue-50 text-blue-600' : 'text-gray-400'
                        )}>
                          {item.influenceLevel || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={clsx("text-xs font-bold px-2 py-1 rounded-md", 
                          item.interestLevel === 'Alto' ? 'bg-red-50 text-red-600' :
                          item.interestLevel === 'Médio' ? 'bg-yellow-50 text-yellow-600' :
                          item.interestLevel === 'Baixo' ? 'bg-blue-50 text-blue-600' : 'text-gray-400'
                        )}>
                          {item.interestLevel || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {item.engagementCurrent === item.engagementDesired && item.engagementCurrent ? (
                            <>
                              {getEngagementBadge(item.engagementCurrent, 'A')}
                              {getEngagementBadge(item.engagementDesired, 'D')}
                            </>
                          ) : (
                            <>
                              {getEngagementBadge(item.engagementCurrent, 'A')}
                              {item.engagementCurrent && item.engagementDesired && item.engagementCurrent !== item.engagementDesired && (
                                <MoveRight className="w-3 h-3 text-gray-400" />
                              )}
                              {item.engagementCurrent !== item.engagementDesired && getEngagementBadge(item.engagementDesired, 'D')}
                            </>
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
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500 text-sm font-medium">
                        Nenhum stakeholder encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'Plano' && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest min-w-[200px]">QUEM CONTACTAR?</th>
                    <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest min-w-[250px]">O QUE COMUNICAR?</th>
                    <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest min-w-[200px] text-center">MÉTODO DE COMUNICAÇÃO</th>
                    <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest min-w-[200px] text-center">QUANDO COMUNICAR?</th>
                    <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest min-w-[200px] text-center">RESPONSÁVEL</th>
                    <th className="px-4 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">AÇÕES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stakeholders.flatMap(sh => 
                    (sh.communications || []).map(comm => (
                      <tr key={comm.id} className="hover:bg-gray-50 transition-colors group">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col">
                              <span className="font-bold text-sm text-gray-900 tracking-wide uppercase">{sh.name}</span>
                              {sh.role && <span className="text-xs text-gray-500 uppercase">{sh.role}</span>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-xs text-gray-600 font-bold uppercase">{comm.what}</span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="text-xs text-gray-600 font-bold uppercase">{comm.method}</span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="text-xs text-gray-600 font-bold uppercase">{comm.when}</span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          {comm.responsible ? (
                            (() => {
                              const member = projectMembers.find(m => m.uid === comm.responsible);
                              if (!member) return <span className="text-xs text-gray-400 font-mono">-</span>;
                              return (
                                <div className="inline-flex items-center gap-2">
                                  {member.photoURL ? (
                                    <img src={member.photoURL} alt={member.name} className="w-6 h-6 rounded-full border border-gray-200 object-cover" />
                                  ) : (
                                    <div className="w-6 h-6 bg-orange-100 text-[#ff7f00] rounded-full flex items-center justify-center font-bold text-[10px] border border-orange-200 uppercase">
                                      {member.name.charAt(0)}
                                    </div>
                                  )}
                                  <span className="text-xs text-gray-600 font-bold uppercase">{member.name}</span>
                                </div>
                              );
                            })()
                          ) : (
                            <span className="text-xs text-gray-400 font-bold">-</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex justify-end gap-2 transition-opacity opacity-0 group-hover:opacity-100">
                            <button 
                              onClick={() => { setEditingCommPlan({ stakeholderId: sh.id, planId: comm.id }); setIsCommPlanModalOpen(true); }}
                              className="p-1.5 bg-white border border-gray-200 hover:bg-orange-50 text-gray-400 hover:text-[#ff7f00] rounded transition-all shadow-sm"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={async () => {
                                if (confirm('Tem certeza que deseja remover este plano de comunicação?')) {
                                  try {
                                    const newComms = sh.communications!.filter(c => c.id !== comm.id);
                                    await updateDoc(doc(db, 'projectStakeholders', sh.id), { communications: newComms, updatedAt: serverTimestamp() });
                                  } catch (err) {
                                    handleFirestoreError(err, OperationType.UPDATE, 'projectStakeholders');
                                  }
                                }
                              }}
                              className="p-1.5 bg-white border border-gray-200 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded transition-all shadow-sm"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                  {(!stakeholders.some(sh => sh.communications && sh.communications.length > 0)) && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm font-medium">
                        Nenhum plano de comunicação cadastrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'Matriz' && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto shadow-sm">
              <table className="w-full text-left border-collapse min-w-[800px] table-fixed">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-[25%] border-r border-gray-100">STAKEHOLDER</th>
                    {ENGAGEMENT_LEVELS.map(level => (
                      <th key={level.id} className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center w-[11%] border-r border-gray-100">
                        {level.label}
                      </th>
                    ))}
                    <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-[20%]">AÇÃO E ESTRATÉGIA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stakeholders.map(item => {
                    const currIdx = ENGAGEMENT_LEVELS.findIndex(l => l.id === item.engagementCurrent);
                    const desIdx = ENGAGEMENT_LEVELS.findIndex(l => l.id === item.engagementDesired);
                    
                    return (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4 border-r border-gray-100">
                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-gray-900 tracking-wide">{item.name}</span>
                          <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{item.organization || item.role || '-'}</span>
                        </div>
                      </td>
                      {ENGAGEMENT_LEVELS.map((level, colIdx) => (
                        <td key={level.id} className="py-4 px-0 border-r border-gray-100 relative">
                          <div className="flex items-center justify-center h-full w-full relative">
                             {item.engagementCurrent === level.id && item.engagementDesired === level.id && (
                               <div className="relative z-10 flex items-center justify-center gap-1.5">
                                 {getEngagementBadge(level.id, 'A')}
                                 {getEngagementBadge(level.id, 'D')}
                               </div>
                             )}
                             {item.engagementCurrent === level.id && item.engagementDesired !== level.id && getEngagementBadge(level.id, 'A')}
                             {item.engagementDesired === level.id && item.engagementDesired !== item.engagementCurrent && getEngagementBadge(level.id, 'D')}
                             
                             {item.engagementCurrent === level.id && item.engagementDesired && currIdx !== -1 && desIdx !== -1 && currIdx !== desIdx && (
                               <div 
                                 className="absolute top-1/2 -translate-y-1/2 flex items-center z-0"
                                 style={{
                                    left: currIdx < desIdx ? 'calc(50% + 12px)' : 'auto',
                                    right: currIdx > desIdx ? 'calc(50% + 12px)' : 'auto',
                                    width: `calc(${Math.abs(desIdx - currIdx) * 100}% - 24px)`,
                                 }}
                               >
                                 {currIdx > desIdx && <div className="w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-r-[6px] border-r-gray-400 -mr-1 z-10" />}
                                 <div className="h-[2px] bg-gray-400 w-full" />
                                 {currIdx < desIdx && <div className="w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[6px] border-l-gray-400 -ml-1 z-10" />}
                               </div>
                             )}
                          </div>
                        </td>
                      ))}
                      <td className="p-4 text-xs text-gray-600 font-medium whitespace-pre-wrap max-w-xs">
                        {item.actionStrategy || <span className="text-gray-300 italic">Nenhuma estratégia definida</span>}
                      </td>
                    </tr>
                  )})}
                  {stakeholders.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500 text-sm font-medium">
                        Nenhum stakeholder cadastrado para a matriz.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex justify-center gap-6 text-xs text-gray-500 font-bold uppercase tracking-wider">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-white border border-gray-300 flex items-center justify-center text-gray-700">A</span>
                  NÍVEL ATUAL
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-white border border-gray-300 flex items-center justify-center text-gray-700">D</span>
                  NÍVEL DESEJADO
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      <AnimatePresence>
        {isModalOpen && (
          <ItemModal 
            projectId={projectId!} 
            item={editingItem} 
            projectTags={projectTags}
            onClose={() => setIsModalOpen(false)} 
          />
        )}
        {itemToDelete && (
          <DeleteConfirmModal 
            title="EXCLUIR STAKEHOLDER"
            message={`Tem certeza que deseja excluir o stakeholder "${itemToDelete.name}"? Esta ação não pode ser desfeita.`}
            onConfirm={handleDeleteItem}
            onCancel={() => setItemToDelete(null)}
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
              <p className="text-sm text-gray-500 font-medium">Generating stakeholders document...</p>
            </div>
          </motion.div>
        )}
        {isCommPlanModalOpen && (
          <CommunicationPlanModal
            isOpen={isCommPlanModalOpen}
            onClose={() => { setIsCommPlanModalOpen(false); setEditingCommPlan(null); }}
            stakeholders={stakeholders}
            editingPlan={editingCommPlan}
            projectMembers={projectMembers}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Modals ---
function CommunicationPlanModal({ isOpen, onClose, stakeholders, editingPlan, projectMembers }: { 
  isOpen: boolean; 
  onClose: () => void; 
  stakeholders: ProjectStakeholder[];
  editingPlan: { stakeholderId: string, planId?: string } | null;
  projectMembers: UserProfile[];
}) {
  const [stakeholderId, setStakeholderId] = useState('');
  const [what, setWhat] = useState('');
  const [method, setMethod] = useState('');
  const [when, setWhen] = useState('');
  const [responsible, setResponsible] = useState('');

  useEffect(() => {
    if (editingPlan && editingPlan.planId) {
      const sh = stakeholders.find(s => s.id === editingPlan.stakeholderId);
      const plan = sh?.communications?.find(c => c.id === editingPlan.planId);
      if (sh && plan) {
        setStakeholderId(sh.id);
        setWhat(plan.what);
        setMethod(plan.method);
        setWhen(plan.when);
        setResponsible(plan.responsible || '');
      }
    } else {
      setStakeholderId('');
      setWhat('');
      setMethod('');
      setWhen('');
      setResponsible('');
    }
  }, [editingPlan, stakeholders]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stakeholderId) {
      alert("Selecione um Stakeholder.");
      return;
    }

    try {
      const sh = stakeholders.find(s => s.id === stakeholderId);
      if (!sh) return;

      let newComms = [...(sh.communications || [])];

      if (editingPlan && editingPlan.planId) {
        // Update existing
        newComms = newComms.map(c => c.id === editingPlan.planId ? { id: c.id, what, method, when, responsible } : c);
      } else {
        // Create new
        newComms.push({ id: Math.random().toString(36).substr(2, 9), what, method, when, responsible });
      }

      await commitWrite(updateDoc(doc(db, 'projectStakeholders', sh.id), {
        communications: newComms,
        updatedAt: serverTimestamp()
      }), { label: 'o plano de comunicação' });

      onClose();
    } catch (error) {
      logFirestoreError(error, OperationType.UPDATE, 'projectStakeholders');
      alert(friendlyWriteError(error));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white border border-gray-200 w-full max-w-xl max-h-[90vh] overflow-hidden rounded-2xl flex flex-col shadow-xl"
      >
        <div className="flex justify-between items-center p-6 border-b border-gray-100 shrink-0">
          <h3 className="text-xl font-bold text-gray-900 uppercase tracking-widest">
            {editingPlan?.planId ? 'EDITAR PLANO DE COMUNICAÇÃO' : 'NOVO PLANO DE COMUNICAÇÃO'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form id="comm-plan-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide text-gray-900">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Stakeholder *</label>
            <select
              value={stakeholderId}
              onChange={(e) => setStakeholderId(e.target.value)}
              disabled={!!(editingPlan && editingPlan.planId)}
              className="w-full bg-white border border-gray-300 px-4 py-3 text-sm font-bold text-gray-900 focus:outline-none focus:border-[#ff7f00] rounded-lg disabled:opacity-50 cursor-pointer"
              required
            >
              <option value="">Selecione um stakeholder</option>
              {stakeholders.map(sh => (
                <option key={sh.id} value={sh.id}>{sh.name} {sh.role ? `(${sh.role})` : ''}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">O que comunicar? *</label>
            <input
              type="text"
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] rounded-lg placeholder-gray-400 uppercase"
              placeholder="Ex: Resultados da Regional"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Método de Comunicação *</label>
            <input
              type="text"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] rounded-lg placeholder-gray-400 uppercase"
              placeholder="Ex: Video Chamada"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Quando comunicar? *</label>
            <input
              type="text"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] rounded-lg placeholder-gray-400 uppercase"
              placeholder="Ex: Toda vez que o resultado sair"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Responsável</label>
            <select
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
              className="w-full bg-white border border-gray-300 px-4 py-3 text-sm font-bold text-gray-900 focus:outline-none focus:border-[#ff7f00] rounded-lg cursor-pointer"
            >
              <option value="">Selecione um responsável</option>
              {projectMembers.map(member => (
                <option key={member.uid} value={member.uid}>{member.name}</option>
              ))}
            </select>
          </div>
        </form>

        <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3 shrink-0 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-gray-50 transition-colors"
          >
            CANCELAR
          </button>
          <button
            type="submit"
            form="comm-plan-form"
            className="px-8 py-2.5 bg-[#ff7f00] text-white font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-orange-600 transition-all active:scale-95 shadow-md shadow-orange-200"
          >
            SALVAR
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// --------------------------------------------------------
// Modal Confirm Delete
// --------------------------------------------------------
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

// --------------------------------------------------------
// Form Modal for Create/Edit
// --------------------------------------------------------
interface ItemModalProps {
  projectId: string;
  item: ProjectStakeholder | null;
  projectTags: ProjectTag[];
  onClose: () => void;
}

function ItemModal({ projectId, item, projectTags, onClose }: ItemModalProps) {
  const [name, setName] = useState(item?.name || '');
  const [description, setDescription] = useState(item?.description || '');
  const [role, setRole] = useState(item?.role || '');
  const [organization, setOrganization] = useState(item?.organization || '');
  const [contactInfo, setContactInfo] = useState(item?.contactInfo || '');
  const [activities, setActivities] = useState(item?.activities || '');
  const [selectedTags, setSelectedTags] = useState<string[]>(item?.tags || []);
  
  const [influenceLevel, setInfluenceLevel] = useState<string>(item?.influenceLevel || '');
  const [interestLevel, setInterestLevel] = useState<string>(item?.interestLevel || '');
  const [expectations, setExpectations] = useState(item?.expectations || '');
  
  const [engagementCurrent, setEngagementCurrent] = useState<string>(item?.engagementCurrent || '');
  const [engagementDesired, setEngagementDesired] = useState<string>(item?.engagementDesired || '');
  const [actionStrategy, setActionStrategy] = useState(item?.actionStrategy || '');
  
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
      const data: Partial<ProjectStakeholder> = {
        name: name.trim(),
        description: description.trim(),
        role: role.trim(),
        organization: organization.trim(),
        contactInfo: contactInfo.trim(),
        activities: activities.trim(),
        tags: selectedTags,
        influenceLevel: influenceLevel as any,
        interestLevel: interestLevel as any,
        expectations: expectations.trim(),
        engagementCurrent: engagementCurrent as any,
        engagementDesired: engagementDesired as any,
        actionStrategy: actionStrategy.trim(),
        updatedAt: serverTimestamp(),
      };
      
      if (item) {
        await commitWrite(updateDoc(doc(db, 'projectStakeholders', item.id), data), { label: 'o stakeholder' });
      } else {
        await commitWrite(addDoc(collection(db, 'projectStakeholders'), { 
          ...data, 
          projectId, 
          createdAt: serverTimestamp() 
        }), { label: 'o stakeholder' });
      }
      onClose();
    } catch (error) {
      logFirestoreError(error, OperationType.CREATE, 'projectStakeholders');
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white border border-gray-200 w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-gray-100 shrink-0">
          <h3 className="text-xl font-bold text-gray-900 uppercase tracking-widest">{item ? 'EDITAR STAKEHOLDER' : 'NOVO STAKEHOLDER'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors"><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide text-gray-900">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Esquerda: Informações Gerais */}
            <div className="space-y-6">
              <h4 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] border-b border-gray-200 pb-2">Informações Gerais</h4>
              
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">NOME *</label>
                <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg placeholder-gray-400" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">PAPEL / CARGO</label>
                  <input type="text" value={role} onChange={(e) => setRole(e.target.value)} className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] rounded-lg placeholder-gray-400" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">ORGANIZAÇÃO</label>
                  <input type="text" value={organization} onChange={(e) => setOrganization(e.target.value)} className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] rounded-lg placeholder-gray-400" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">INFORMAÇÕES DE CONTATO</label>
                <input type="text" value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} placeholder="Email, Telefone, LinkedIn..." className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] rounded-lg placeholder-gray-400" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">DESCRIÇÃO</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] resize-none h-24 rounded-lg" />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">ATIVIDADES NO PROJETO</label>
                <textarea value={activities} onChange={(e) => setActivities(e.target.value)} className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] resize-none h-20 rounded-lg" />
              </div>
              
              {/* Tags Section */}
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
            </div>
            
            {/* Direita: Avaliação e Matriz */}
            <div className="space-y-6">
              <h4 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] border-b border-gray-200 pb-2">Avaliação e Engajamento</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">GRAU DE INFLUÊNCIA</label>
                  <select value={influenceLevel} onChange={(e) => setInfluenceLevel(e.target.value)} className="w-full bg-white border border-gray-300 px-4 py-3 text-sm font-bold text-gray-900 focus:outline-none focus:border-indigo-500 rounded-lg">
                    <option value="">Não definido</option>
                    <option value="Alto">Alto</option>
                    <option value="Médio">Médio</option>
                    <option value="Baixo">Baixo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">GRAU DE INTERESSE</label>
                  <select value={interestLevel} onChange={(e) => setInterestLevel(e.target.value)} className="w-full bg-white border border-gray-300 px-4 py-3 text-sm font-bold text-gray-900 focus:outline-none focus:border-indigo-500 rounded-lg">
                    <option value="">Não definido</option>
                    <option value="Alto">Alto</option>
                    <option value="Médio">Médio</option>
                    <option value="Baixo">Baixo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">EXPECTATIVAS</label>
                <textarea value={expectations} onChange={(e) => setExpectations(e.target.value)} className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500 resize-none h-20 rounded-lg" />
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
                <h5 className="text-xs font-bold text-gray-700 uppercase tracking-widest flex items-center gap-2">
                  <Grid3X3 className="w-4 h-4" /> Matriz de Engajamento
                </h5>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">NÍVEL ATUAL (A)</label>
                  <select value={engagementCurrent} onChange={(e) => setEngagementCurrent(e.target.value)} className="w-full bg-white border border-gray-300 px-4 py-3 text-sm font-bold text-gray-900 focus:outline-none focus:border-indigo-500 rounded-lg">
                    <option value="">Não definido</option>
                    {ENGAGEMENT_LEVELS.map(l => <option key={`A_${l.id}`} value={l.id}>{l.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">NÍVEL DESEJADO (D)</label>
                  <select value={engagementDesired} onChange={(e) => setEngagementDesired(e.target.value)} className="w-full bg-white border border-gray-300 px-4 py-3 text-sm font-bold text-gray-900 focus:outline-none focus:border-indigo-500 rounded-lg">
                    <option value="">Não definido</option>
                    {ENGAGEMENT_LEVELS.map(l => <option key={`D_${l.id}`} value={l.id}>{l.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">AÇÃO E ESTRATÉGIA</label>
                  <textarea value={actionStrategy} onChange={(e) => setActionStrategy(e.target.value)} placeholder="Como mover este stakeholder do nível atual para o desejado?" className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-indigo-500 resize-none h-24 rounded-lg" />
                </div>
              </div>

            </div>
          </div>

        </form>
        <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3 shrink-0 rounded-b-2xl">
          <button onClick={onClose} type="button" className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-gray-50 transition-colors">CANCELAR</button>
          <button onClick={handleSubmit} disabled={isSaving || !name.trim()} className="px-8 py-2.5 bg-[#ff7f00] text-white font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-all active:scale-95">{isSaving ? 'SALVANDO...' : 'SALVAR'}</button>
        </div>
      </motion.div>
    </div>
  );
}
