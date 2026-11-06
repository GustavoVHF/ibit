import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileHeader from './MobileHeader';
import MobileBottomNav from './MobileBottomNav';
import MobileToolsDrawer from './MobileToolsDrawer';
import UserProfileModal from './UserProfileModal';
import DocumentEditor from './DocumentEditor';
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
import { AssetFolder, AssetLink, AssetDocument, Project, UserProfile } from '../types';
import {
  Plus,
  Search,
  Folder,
  ExternalLink,
  Trash2,
  Edit2,
  ChevronRight,
  MoreVertical,
  X,
  Link as LinkIcon,
  Loader2,
  FileText,
  LayoutGrid,
  List,
  ArrowLeft,
  FilePlus2,
  Upload
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import ProjectSettingsModal from './ProjectSettingsModal';
import { handleFirestoreError, logFirestoreError, OperationType } from '../utils/errorHandlers';
import { commitWrite, friendlyWriteError } from '../utils/firestoreWrite';
import { motion, AnimatePresence } from 'motion/react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useI18n } from '../i18n/LanguageContext';

export default function Assets() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  
  const [project, setProject] = useState<Project | null>(null);
  const [projectMembers, setProjectMembers] = useState<UserProfile[]>([]);
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  const [links, setLinks] = useState<AssetLink[]>([]);
  const [documents, setDocuments] = useState<AssetDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<AssetFolder | null>(null);
  const [editingLink, setEditingLink] = useState<AssetLink | null>(null);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; type: 'folder' | 'link' | 'document'; name: string } | null>(null);
  const [showNewAssetDropdown, setShowNewAssetDropdown] = useState(false);
  const [openDocumentId, setOpenDocumentId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowNewAssetDropdown(false);
      }
    };
    if (showNewAssetDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNewAssetDropdown]);

  const importInputRef = useRef<HTMLInputElement>(null);

  const handleImportJSON = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !projectId || !user) return;
    
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      
      if (!parsed.content) {
        throw new Error('Arquivo JSON inválido para documento');
      }

      await addDoc(collection(db, 'assetDocuments'), {
        projectId,
        title: parsed.title || t.assets.importedDefault,
        content: parsed.content,
        type: 'note',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ownerId: user.uid,
        folderId: currentFolderId || null
      });

      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error importing JSON:', error);
      alert(t.assets.importError);
    }
  };

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

  // 3. Fetch Folders & Links
  useEffect(() => {
    if (!projectId) return;

    const qFolders = query(
      collection(db, 'assetFolders'), 
      where('projectId', '==', projectId)
    );
    const unsubFolders = onSnapshot(qFolders, (snapshot) => {
      const folderData: AssetFolder[] = [];
      snapshot.forEach((doc) => {
        folderData.push({ id: doc.id, ...doc.data() } as AssetFolder);
      });
      // Sort in memory to avoid index requirements
      setFolders(folderData.sort((a, b) => {
        const timeA = a.createdAt?.toMillis() || 0;
        const timeB = b.createdAt?.toMillis() || 0;
        return timeA - timeB;
      }));
    }, (error) => {
      console.error("Error fetching folders:", error);
      handleFirestoreError(error, OperationType.LIST, 'assetFolders');
    });

    const qLinks = query(
      collection(db, 'assetLinks'), 
      where('projectId', '==', projectId)
    );
    const unsubLinks = onSnapshot(qLinks, (snapshot) => {
      const linkData: AssetLink[] = [];
      snapshot.forEach((doc) => {
        linkData.push({ id: doc.id, ...doc.data() } as AssetLink);
      });
      // Sort in memory to avoid index requirements
      setLinks(linkData.sort((a, b) => {
        const timeA = a.createdAt?.toMillis() || 0;
        const timeB = b.createdAt?.toMillis() || 0;
        return timeB - timeA; // desc
      }));
      setLoading(false);
    }, (error) => {
      console.error("Error fetching links:", error);
      handleFirestoreError(error, OperationType.LIST, 'assetLinks');
      setLoading(false);
    });

    // 3b. Fetch Documents
    const qDocs = query(
      collection(db, 'assetDocuments'),
      where('projectId', '==', projectId)
    );
    const unsubDocs = onSnapshot(qDocs, (snapshot) => {
      const docData: AssetDocument[] = [];
      snapshot.forEach((d) => {
        docData.push({ id: d.id, ...d.data() } as AssetDocument);
      });
      setDocuments(docData.sort((a, b) => {
        const timeA = a.createdAt?.toMillis() || 0;
        const timeB = b.createdAt?.toMillis() || 0;
        return timeB - timeA;
      }));
    }, (error) => {
      console.error("Error fetching documents:", error);
    });

    return () => {
      unsubFolders();
      unsubLinks();
      unsubDocs();
    };
  }, [projectId]);

  const currentFolder = currentFolderId ? folders.find(f => f.id === currentFolderId) : null;
  
  const filteredFolders = folders.filter(f => {
    const parentMatch = (f.parentId || null) === (currentFolderId || null);
    const searchMatch = f.name.toLowerCase().includes(searchQuery.toLowerCase());
    return parentMatch && searchMatch;
  });

  const filteredLinks = links.filter(l => {
    const folderMatch = (l.folderId || null) === (currentFolderId || null);
    const searchMatch = l.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                        l.url.toLowerCase().includes(searchQuery.toLowerCase());
    return folderMatch && searchMatch;
  });

  const filteredDocuments = documents.filter(d => {
    const folderMatch = (d.folderId || null) === (currentFolderId || null);
    const docTitle = d.title || (d as any).name || '';
    const searchMatch = docTitle.toLowerCase().includes(searchQuery.toLowerCase());
    return folderMatch && searchMatch;
  });

  const handleDelete = async () => {
    if (!itemToDelete) return;
    try {
      if (itemToDelete.type === 'folder') {
        // Recursive deletion for folders: collect every delete, commit once
        const deletes: Promise<void>[] = [];
        const deleteFolderRecursive = (folderId: string) => {
          const linksInFolder = links.filter(l => l.folderId === folderId);
          for (const link of linksInFolder) {
            deletes.push(deleteDoc(doc(db, 'assetLinks', link.id)));
          }
          const docsInFolder = documents.filter(d => d.folderId === folderId);
          for (const d of docsInFolder) {
            deletes.push(deleteDoc(doc(db, 'assetDocuments', d.id)));
          }
          const subfolders = folders.filter(f => f.parentId === folderId);
          for (const sub of subfolders) {
            deleteFolderRecursive(sub.id);
          }
          deletes.push(deleteDoc(doc(db, 'assetFolders', folderId)));
        };
        
        deleteFolderRecursive(itemToDelete.id);
        await commitWrite(Promise.all(deletes), { label: 'a exclusão da pasta' });
        if (currentFolderId === itemToDelete.id) {
          setCurrentFolderId(null);
        }
      } else if (itemToDelete.type === 'document') {
        await commitWrite(deleteDoc(doc(db, 'assetDocuments', itemToDelete.id)), { label: 'a exclusão do documento' });
      } else {
        await commitWrite(deleteDoc(doc(db, 'assetLinks', itemToDelete.id)), { label: 'a exclusão do link' });
      }
      
      setItemToDelete(null);
    } catch (error) {
      logFirestoreError(error, OperationType.DELETE, 'assets');
      alert(friendlyWriteError(error));
    }
  };

  // --- Create Document ---
  const handleCreateDocument = async () => {
    if (!user || !projectId) return;
    setShowNewAssetDropdown(false);
    try {
      const docRef = doc(collection(db, 'assetDocuments'));
      await commitWrite(setDoc(docRef, {
        projectId,
        folderId: currentFolderId || null,
        type: 'note',
        title: t.assets.untitledDocument,
        content: {},
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }), { label: 'o documento' });
      // Open the editor immediately after creation
      setOpenDocumentId(docRef.id);
    } catch (error) {
      logFirestoreError(error, OperationType.CREATE, 'assetDocuments');
      alert(friendlyWriteError(error));
    }
  };

  const getBreadcrumbs = () => {
    const crumbs = [{ id: null, name: t.assets.home }];
    if (currentFolderId) {
      const buildCrumbs = (folderId: string): { id: string | null, name: string }[] => {
        const folder = folders.find(f => f.id === folderId);
        if (!folder) return [];
        const parentCrumbs = folder.parentId ? buildCrumbs(folder.parentId) : [];
        return [...parentCrumbs, { id: folder.id, name: folder.name.toUpperCase() }];
      };
      crumbs.push(...buildCrumbs(currentFolderId));
    }
    return crumbs;
  };

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    console.log('onDragEnd called:', { destination, source, draggableId });

    // Dropped outside a valid droppable
    if (!destination) {
      console.log('No destination - dropped outside');
      return;
    }

    console.log('Destination droppableId:', destination.droppableId);

    // Handle dropping into back button (move to parent folder)
    if (destination.droppableId === 'back-button') {
      const currentFolder = folders.find(f => f.id === currentFolderId);
      const targetFolderId = currentFolder?.parentId || null;
      console.log('Dropping into back button, moving to parent:', targetFolderId);

      const isLink = filteredLinks.some(link => link.id === draggableId);
      const isDocument = filteredDocuments.some(doc => doc.id === draggableId);

      try {
        if (isLink) {
          await updateDoc(doc(db, 'assetLinks', draggableId), {
            folderId: targetFolderId,
            updatedAt: serverTimestamp()
          });
        } else if (isDocument) {
          await updateDoc(doc(db, 'assetDocuments', draggableId), {
            folderId: targetFolderId,
            updatedAt: serverTimestamp()
          });
        }
      } catch (error) {
        console.error('Error updating item:', error);
        handleFirestoreError(error, OperationType.UPDATE, `asset/${draggableId}`);
      }
      return;
    }

    // Handle dropping into folders
    if (destination.droppableId.startsWith('folder-')) {
      const targetFolderId = destination.droppableId.replace('folder-', '');
      console.log('Dropping into folder:', targetFolderId);

      // Determine if it's a link or document by checking which array contains it
      const isLink = filteredLinks.some(link => link.id === draggableId);
      const isDocument = filteredDocuments.some(doc => doc.id === draggableId);

      console.log('Item type:', { isLink, isDocument, draggableId });

      try {
        if (isLink) {
          console.log('Updating link folderId to:', targetFolderId);
          await updateDoc(doc(db, 'assetLinks', draggableId), {
            folderId: targetFolderId,
            updatedAt: serverTimestamp()
          });
          console.log('Link updated successfully');
        } else if (isDocument) {
          console.log('Updating document folderId to:', targetFolderId);
          await updateDoc(doc(db, 'assetDocuments', draggableId), {
            folderId: targetFolderId,
            updatedAt: serverTimestamp()
          });
          console.log('Document updated successfully');
        }
      } catch (error) {
        console.error('Error updating item:', error);
        handleFirestoreError(error, OperationType.UPDATE, `asset/${draggableId}`);
      }
    } else {
      console.log('Not dropped into a folder, droppableId:', destination.droppableId);
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

        <div className="bg-white border-b border-gray-100 px-3 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-0 sm:gap-6 w-full sm:w-auto">
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <Folder className="w-5 h-5 text-[#ff7f00]" />
              <h2 className="text-sm sm:text-lg font-bold text-gray-900 uppercase tracking-widest">
                {t.assets.title}
              </h2>
            </div>
            
            <div className="relative flex-1 sm:w-64 sm:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text"
                placeholder={t.common.search}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 focus:outline-none focus:border-[#ff7f00] text-sm font-medium rounded-lg transition-all"
              />
            </div>
          </div>

          <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
            <button 
              onClick={() => { setEditingFolder(null); setIsFolderModalOpen(true); }}
              className="bg-white text-gray-700 border border-gray-300 px-3 sm:px-5 py-2 flex items-center gap-2 transition-all font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-gray-50 active:scale-95 flex-1 sm:flex-none justify-center"
            >
              <Plus className="w-4 h-4" />
              {t.assets.folder}
            </button>
            
            <input
              type="file"
              ref={importInputRef}
              accept=".json"
              className="hidden"
              onChange={handleImportJSON}
            />
            <button 
              onClick={() => importInputRef.current?.click()}
              className="bg-white text-gray-700 border border-gray-300 px-3 sm:px-5 py-2 flex items-center gap-2 transition-all font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-gray-50 active:scale-95 flex-1 sm:flex-none justify-center"
              title={t.assets.importTitle}
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">{t.assets.import}</span>
            </button>

            {/* New Asset Dropdown */}
            <div className="relative flex-1 sm:flex-none" ref={dropdownRef}>
              <button 
                onClick={() => setShowNewAssetDropdown(!showNewAssetDropdown)}
                className="w-full bg-[#ff7f00] hover:bg-orange-600 text-white px-3 sm:px-5 py-2 flex items-center gap-2 transition-all font-bold uppercase tracking-widest text-xs rounded-lg active:scale-95 shadow-md shadow-orange-100 justify-center"
              >
                <Plus className="w-4 h-4" />
                {t.assets.newAsset}
              </button>
              
              <AnimatePresence>
                {showNewAssetDropdown && (
                  <motion.div 
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-200 rounded-xl overflow-hidden z-50 shadow-lg"
                  >
                    <button
                      onClick={() => { setShowNewAssetDropdown(false); setEditingLink(null); setIsLinkModalOpen(true); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                        <LinkIcon className="w-4 h-4 text-blue-500" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-gray-900 uppercase tracking-wider">{t.assets.addLink}</span>
                        <p className="text-[10px] text-gray-400">{t.assets.addLinkHint}</p>
                      </div>
                    </button>
                    <div className="h-px bg-gray-100" />
                    <button
                      onClick={handleCreateDocument}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center shrink-0">
                        <FilePlus2 className="w-4 h-4 text-[#ff7f00]" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-gray-900 uppercase tracking-wider">{t.assets.createDocument}</span>
                        <p className="text-[10px] text-gray-400">{t.assets.createDocumentHint}</p>
                      </div>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Breadcrumbs */}
        <div className="px-6 pt-6 flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-gray-400 uppercase">
          {getBreadcrumbs().map((crumb, idx) => (
            <React.Fragment key={crumb.id || 'root'}>
              {idx > 0 && <ChevronRight className="w-3 h-3 text-gray-300" />}
              <button 
                onClick={() => setCurrentFolderId(crumb.id as string | null)}
                className={clsx(
                  "hover:text-[#ff7f00] transition-colors",
                  idx === getBreadcrumbs().length - 1 ? "text-gray-900" : ""
                )}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-6 scrollbar-hide">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center opacity-50">
              <Loader2 className="w-10 h-10 text-[#ff7f00] animate-spin mb-4" />
              <p className="font-bold uppercase tracking-widest text-xs">{t.assets.loadingAssets}</p>
            </div>
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {/* Back to Home folder if nested - Now a Droppable */}
                {currentFolderId && (
                  <Droppable droppableId="back-button" type="ASSET">
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        onClick={() => !snapshot.isDraggingOver && (() => {
                          const current = folders.find(f => f.id === currentFolderId);
                          setCurrentFolderId(current?.parentId || null);
                        })()}
                        className={clsx(
                          "group bg-white rounded-2xl border p-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all relative min-h-[150px]",
                          snapshot.isDraggingOver
                            ? "border-[#ff7f00] border-2 border-dashed bg-orange-50"
                            : "border-gray-200 hover:border-[#ff7f00] hover:shadow-xl"
                        )}
                      >
                        {snapshot.isDraggingOver ? (
                          <>
                            <ArrowLeft className="w-12 h-12 text-[#ff7f00]" />
                            <span className="text-xs font-bold text-[#ff7f00] uppercase tracking-widest text-center">{t.assets.moveUp}</span>
                          </>
                        ) : (
                          <>
                            <ArrowLeft className="w-12 h-12 text-gray-200 group-hover:text-[#ff7f00] transition-colors" />
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest text-center transition-colors group-hover:text-gray-900 line-clamp-2">{t.common.back}</span>
                          </>
                        )}
                        <div className="hidden">{provided.placeholder}</div>
                      </div>
                    )}
                  </Droppable>
                )}

              {/* Folders List - Each folder is a Droppable */}
              {filteredFolders.map((folder, index) => (
                <Droppable key={folder.id} droppableId={`folder-${folder.id}`} type="ASSET">
                  {(provided, snapshot) => {
                    console.log(`Folder ${folder.name} isDraggingOver:`, snapshot.isDraggingOver);
                    return (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      onClick={() => !snapshot.isDraggingOver && setCurrentFolderId(folder.id)}
                      className={clsx(
                        "group bg-white rounded-2xl border p-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all relative min-h-[150px]",
                        snapshot.isDraggingOver
                          ? "border-[#ff7f00] bg-orange-50 border-2 border-dashed"
                          : "border-gray-200 hover:border-[#ff7f00] hover:shadow-xl"
                      )}
                    >
                      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingFolder(folder);
                            setIsFolderModalOpen(true);
                          }}
                          className="p-1.5 hover:bg-orange-50 text-gray-400 hover:text-[#ff7f00] rounded-lg"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setItemToDelete({ id: folder.id, type: 'folder', name: folder.name });
                          }}
                          className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {snapshot.isDraggingOver ? (
                        <div className="flex flex-col items-center justify-center gap-3">
                          <Folder className="w-16 h-16 text-[#ff7f00] fill-[#ff7f00]/20" />
                          <span className="text-sm font-bold text-[#ff7f00] uppercase tracking-wider text-center">{t.assets.dropHere}</span>
                        </div>
                      ) : (
                        <>
                          <Folder className="w-16 h-16 text-[#ff7f00] fill-[#ff7f00]/5 group-hover:scale-110 transition-transform" />
                          <span className="text-sm font-bold text-gray-900 uppercase tracking-wider text-center line-clamp-2">{folder.name}</span>
                        </>
                      )}

                      <div className="hidden">{provided.placeholder}</div>
                    </div>
                    );
                  }}
                </Droppable>
              ))}

              {/* Droppable wrapper for loose items (links and documents) */}
              <Droppable droppableId="loose-items" type="ASSET">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="contents">
                    {/* Links List */}
                    {filteredLinks.map((link, index) => (
                      <Draggable key={link.id} draggableId={link.id} index={index} type="ASSET">
                        {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      onClick={() => !snapshot.isDragging && window.open(link.url, '_blank')}
                      className={clsx(
                        "group bg-white rounded-2xl border border-gray-200 p-6 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-[#ff7f00] hover:shadow-xl transition-all relative",
                        snapshot.isDragging && "shadow-2xl rotate-3 scale-105 opacity-80"
                      )}
                    >
                      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingLink(link);
                            setIsLinkModalOpen(true);
                          }}
                          className="p-1.5 hover:bg-orange-50 text-gray-400 hover:text-[#ff7f00] rounded-lg"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setItemToDelete({ id: link.id, type: 'link', name: link.name });
                          }}
                          className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <ExternalLink className="w-12 h-12 text-blue-500 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold text-gray-900 uppercase tracking-wider text-center line-clamp-2">{link.name}</span>
                    </div>
                  )}
                </Draggable>
              ))}

              {/* Documents List */}
              {filteredDocuments.map((assetDoc, index) => (
                <Draggable key={assetDoc.id} draggableId={assetDoc.id} index={index} type="ASSET">
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      onClick={() => !snapshot.isDragging && setOpenDocumentId(assetDoc.id)}
                      className={clsx(
                        "group bg-white rounded-2xl border border-gray-200 p-6 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-[#ff7f00] hover:shadow-xl transition-all relative",
                        snapshot.isDragging && "shadow-2xl rotate-3 scale-105 opacity-80"
                      )}
                    >
                      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenDocumentId(assetDoc.id);
                          }}
                          className="p-1.5 hover:bg-orange-50 text-gray-400 hover:text-[#ff7f00] rounded-lg"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setItemToDelete({ id: assetDoc.id, type: 'document', name: assetDoc.title });
                          }}
                          className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                        <FileText className="w-8 h-8 text-[#ff7f00]" />
                      </div>
                      <div className="flex flex-col items-center gap-1 overflow-hidden w-full">
                        <span className="text-sm font-bold text-gray-900 uppercase tracking-wider text-center line-clamp-2">{assetDoc.title}</span>
                        <span className="text-[10px] text-gray-400">{t.assets.documentLabel}</span>
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}

              {filteredFolders.length === 0 && filteredLinks.length === 0 && filteredDocuments.length === 0 && (
                <div className="col-span-full h-64 flex flex-col items-center justify-center text-gray-400 opacity-50">
                  <Folder className="w-12 h-12 mb-4 border-2 border-dashed border-gray-200 p-2 rounded-xl" />
                  <p className="font-bold uppercase tracking-widest text-[10px]">{t.assets.empty}</p>
                </div>
              )}

              {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          </DragDropContext>
          )}
        </div>
      </main>

      <AnimatePresence>
        {isFolderModalOpen && (
          <FolderModal 
            projectId={projectId!}
            parentId={currentFolderId}
            folder={editingFolder}
            onClose={() => setIsFolderModalOpen(false)}
          />
        )}
        {isLinkModalOpen && (
          <LinkModal 
            projectId={projectId!}
            folderId={currentFolderId}
            link={editingLink}
            onClose={() => setIsLinkModalOpen(false)}
          />
        )}
        {itemToDelete && (
          <DeleteConfirmModal 
            title={t.assets.deleteTitle(itemToDelete.type)}
            message={t.assets.deleteMessage(itemToDelete.name, itemToDelete.type === 'folder')}
            onConfirm={handleDelete}
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

      {/* Document Editor Full-screen Overlay */}
      {openDocumentId && (
        <DocumentEditor
          documentId={openDocumentId}
          onClose={() => setOpenDocumentId(null)}
        />
      )}
    </div>
  );
}

// --- MODALS ---

interface FolderModalProps {
  projectId: string;
  parentId: string | null;
  folder: AssetFolder | null;
  onClose: () => void;
}

function FolderModal({ projectId, parentId, folder, onClose }: FolderModalProps) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [name, setName] = useState(folder?.name || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !user) return;
    setIsSaving(true);
    try {
      const data = {
        projectId,
        parentId: folder ? folder.parentId : (parentId || null),
        name: name.trim(),
        updatedAt: serverTimestamp(),
        order: 0,
        ownerId: user.uid
      };
      if (folder) {
        await commitWrite(updateDoc(doc(db, 'assetFolders', folder.id), data), { label: 'a pasta' });
      } else {
        await commitWrite(addDoc(collection(db, 'assetFolders'), { ...data, createdAt: serverTimestamp() }), { label: 'a pasta' });
      }
      onClose();
    } catch (error) {
      logFirestoreError(error, OperationType.CREATE, 'assetFolders');
      alert(friendlyWriteError(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white border border-gray-200 w-full max-w-md overflow-hidden rounded-2xl">
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <h3 className="text-xl font-bold text-gray-900 uppercase tracking-widest">{folder ? t.assets.editFolder : t.assets.newFolder}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors"><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">{t.assets.folderName}</label>
            <input 
              type="text" autoFocus required value={name} onChange={(e) => setName(e.target.value)} 
              className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg" 
              placeholder={t.assets.folderPlaceholder} 
            />
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} type="button" className="flex-1 px-6 py-3 bg-white border border-gray-300 text-gray-700 font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-gray-50">{t.common.cancel}</button>
            <button type="submit" disabled={isSaving || !name.trim()} className="flex-1 px-6 py-3 bg-[#ff7f00] text-white font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-orange-600 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSaving ? t.common.saving : t.common.save}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

interface LinkModalProps {
  projectId: string;
  folderId: string | null;
  link: AssetLink | null;
  onClose: () => void;
}

function LinkModal({ projectId, folderId, link, onClose }: LinkModalProps) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [name, setName] = useState(link?.name || '');
  const [url, setUrl] = useState(link?.url || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim() || !user) return;
    
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = 'https://' + formattedUrl;
    }

    setIsSaving(true);
    try {
      const data = {
        projectId,
        folderId: folderId || null,
        name: name.trim(),
        url: formattedUrl,
        updatedAt: serverTimestamp(),
        ownerId: user.uid
      };
      if (link) {
        await commitWrite(updateDoc(doc(db, 'assetLinks', link.id), data), { label: 'o link' });
      } else {
        await commitWrite(addDoc(collection(db, 'assetLinks'), { ...data, createdAt: serverTimestamp() }), { label: 'o link' });
      }
      onClose();
    } catch (error) {
      logFirestoreError(error, OperationType.CREATE, 'assetLinks');
      alert(friendlyWriteError(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white border border-gray-200 w-full max-w-md overflow-hidden rounded-2xl">
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <h3 className="text-xl font-bold text-gray-900 uppercase tracking-widest">{link ? t.assets.editLink : t.assets.newLink}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors"><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">{t.assets.assetName}</label>
              <input 
                type="text" autoFocus required value={name} onChange={(e) => setName(e.target.value)} 
                className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg" 
                placeholder={t.assets.assetNamePlaceholder} 
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">{t.assets.url}</label>
              <div className="relative">
                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="text" required value={url} onChange={(e) => setUrl(e.target.value)} 
                  className="w-full bg-white border border-gray-300 pl-10 pr-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-medium rounded-lg" 
                  placeholder="google.com/docs..." 
                />
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} type="button" className="flex-1 px-6 py-3 bg-white border border-gray-300 text-gray-700 font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-gray-50">{t.common.cancel}</button>
            <button type="submit" disabled={isSaving || !name.trim() || !url.trim()} className="flex-1 px-6 py-3 bg-[#ff7f00] text-white font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-orange-600 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSaving ? t.common.saving : t.common.save}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function DeleteConfirmModal({ title, message, onConfirm, onCancel }: { title: string, message: string, onConfirm: () => void, onCancel: () => void }) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white border border-gray-200 w-full max-w-md overflow-hidden rounded-2xl">
        <div className="flex justify-between items-center p-6 border-b border-red-100 bg-red-50">
          <h3 className="text-xl font-bold text-red-700 uppercase tracking-widest">{title}</h3>
          <button onClick={onCancel} className="text-red-400 hover:text-red-600 transition-colors"><X className="w-6 h-6" /></button>
        </div>
        <div className="p-6 space-y-6">
          <p className="text-gray-700 font-medium">{message}</p>
          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 bg-white border border-gray-300 text-gray-700 px-4 py-3 font-bold uppercase tracking-widest rounded-lg hover:bg-gray-50 text-xs">{t.common.cancel}</button>
            <button onClick={onConfirm} className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-3 font-bold uppercase tracking-widest rounded-lg shadow-lg shadow-red-100 text-xs">{t.common.delete}</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
