import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, documentId } from 'firebase/firestore';
import { Project, ProjectTag, UserProfile } from '../types';
import { canEditProject } from '../utils/roleHelpers';
import { commitWrite } from '../utils/firestoreWrite';
import Sidebar from './Sidebar';
import ProjectSettingsModal from './ProjectSettingsModal';
import { Trash2, Tag, Plus, X, Check, Edit2, Palette } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';

const PRESET_COLORS = [
  '#ff7f00', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6b7280',
  '#000000', '#1f2937', '#059669', '#dc2626', '#2563eb', '#7c3aed', '#db2777', '#d97706'
];

export default function ProjectTags() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [projectMembers, setProjectMembers] = useState<UserProfile[]>([]);
  const [projectTags, setProjectTags] = useState<ProjectTag[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<ProjectTag | null>(null);

  // Form state
  const [tagLabel, setTagLabel] = useState('');
  const [tagColor, setTagColor] = useState(PRESET_COLORS[0]);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch project
  useEffect(() => {
    if (!projectId || !user) return;
    const projectRef = doc(db, 'projects', projectId);
    return onSnapshot(projectRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Project;
        if (!data.members.includes(user.uid)) {
          navigate('/dashboard');
          return;
        }
        setProject({ id: docSnap.id, ...data });
      }
    });
  }, [projectId, user, navigate]);

  // Fetch members
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
      setLoading(false);
    });
  }, [project?.members?.join(',')]);

  // Check permissions
  const canManage = project && user ? canEditProject(project, user.uid) : false;

  // Redirect if no permission
  useEffect(() => {
    if (!loading && !canManage) {
      navigate(`/project/${projectId}`);
    }
  }, [loading, canManage, navigate, projectId]);

  // Fetch tags
  useEffect(() => {
    if (!projectId) return;
    const qTags = query(
      collection(db, 'projectTags'),
      where('projectId', '==', projectId)
    );
    return onSnapshot(qTags, (snapshot) => {
      const tagsData: ProjectTag[] = [];
      snapshot.forEach((doc) => {
        tagsData.push({ id: doc.id, ...doc.data() } as ProjectTag);
      });
      // Sort tags by label
      tagsData.sort((a, b) => a.label.localeCompare(b.label));
      setProjectTags(tagsData);
    });
  }, [projectId]);

  const handleOpenModal = (tag?: ProjectTag) => {
    if (tag) {
      setEditingTag(tag);
      setTagLabel(tag.label);
      setTagColor(tag.color);
    } else {
      setEditingTag(null);
      setTagLabel('');
      setTagColor(PRESET_COLORS[0]);
    }
    setIsTagModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsTagModalOpen(false);
    setEditingTag(null);
    setTagLabel('');
    setTagColor(PRESET_COLORS[0]);
  };

  const handleSaveTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !tagLabel.trim() || isSaving) return;

    setIsSaving(true);
    try {
      if (editingTag) {
        const tagRef = doc(db, 'projectTags', editingTag.id);
        await commitWrite(updateDoc(tagRef, {
          label: tagLabel.trim(),
          color: tagColor,
          updatedAt: serverTimestamp()
        }), { label: 'a tag' });
      } else {
        await commitWrite(addDoc(collection(db, 'projectTags'), {
          projectId,
          label: tagLabel.trim(),
          color: tagColor,
          createdAt: serverTimestamp()
        }), { label: 'a tag' });
      }
      handleCloseModal();
    } catch (error) {
      console.error('Error saving tag:', error);
      alert('Erro ao salvar tag.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta tag?')) return;

    try {
      await commitWrite(deleteDoc(doc(db, 'projectTags', tagId)), { label: 'a exclusão da tag' });
    } catch (error) {
      console.error('Error deleting tag:', error);
      alert('Erro ao excluir tag.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#ff7f00] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!project || !canManage) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-gray-900 flex h-screen">
      <Sidebar
        projectId={projectId}
        projectName={project.name}
        onOpenSettings={canManage ? () => setIsSettingsModalOpen(true) : undefined}
      />

      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        {/* Header */}
        <header className="border-b border-gray-200 bg-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden border border-gray-100 shrink-0">
              {project.photoURL ? (
                <img src={project.photoURL} alt={project.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl">🏎️</span>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-wider leading-tight text-gray-900 truncate">
                {project.name} - #{project.shortId || '---'}
              </h2>
            </div>
            <div className="flex items-center ml-4 shrink-0">
              <div className="flex -space-x-2 mr-3">
                {projectMembers.map((member) => (
                  <div key={member.uid} className="relative inline-block" title={member?.name}>
                    {member?.photoURL ? (
                      <img src={member.photoURL} alt={member.name} className="w-8 h-8 rounded-full border-2 border-white object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                        {member?.name?.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-1 border border-gray-200 rounded-md">
                {project.members.length} {project.members.length === 1 ? 'MEMBRO' : 'MEMBROS'}
              </span>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-6 mt-8">
            {/* Title */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-wider uppercase text-gray-900">Gestão de Tags</h1>
                <p className="text-sm text-gray-500 mt-1">Crie e gerencie as tags de identificação do projeto</p>
              </div>
              <button
                onClick={() => handleOpenModal()}
                className="bg-[#ff7f00] hover:bg-orange-600 text-white px-4 py-2 flex items-center gap-2 transition-all font-bold uppercase tracking-widest text-[10px] rounded-lg active:scale-95 shadow-md shadow-orange-100 shrink-0"
              >
                <Plus className="w-4 h-4" />
                NOVA TAG
              </button>
            </div>

            {/* Tags Grid/Table */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Tag</th>
                      <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Visualização</th>
                      <th className="px-6 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {projectTags.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-gray-500 italic text-sm">
                          Nenhuma tag cadastrada.
                        </td>
                      </tr>
                    ) : (
                      projectTags.map((tag) => (
                        <tr key={tag.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="text-sm font-bold text-gray-900">{tag.label}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span 
                              className={clsx(
                                "px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md shadow-sm inline-block",
                                (!tag.color || !tag.color.startsWith('#')) ? (tag.color || 'bg-gray-500 text-white') : 'text-white'
                              )}
                              style={tag.color?.startsWith('#') ? { backgroundColor: tag.color } : {}}
                            >
                              {tag.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => handleOpenModal(tag)}
                                className="p-2 text-gray-400 hover:text-[#ff7f00] hover:bg-orange-50 transition-colors rounded-lg"
                                title="Editar tag"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteTag(tag.id)}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors rounded-lg"
                                title="Excluir tag"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Tag Modal */}
      <AnimatePresence>
        {isTagModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-orange-200 w-full max-w-md overflow-hidden shadow-2xl rounded-xl"
            >
              <div className="flex justify-between items-center p-6 border-b border-orange-100 bg-orange-50">
                <h3 className="text-xl font-bold uppercase text-gray-900 flex items-center gap-2">
                  <Tag className="w-5 h-5 text-[#ff7f00]" /> {editingTag ? 'Editar Tag' : 'Nova Tag'}
                </h3>
                <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSaveTag} className="p-6 space-y-6">
                {/* Preview */}
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col items-center gap-3">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Prévia</span>
                  <span 
                    className={clsx(
                      "px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg shadow-md transition-all duration-300",
                      (!tagColor || !tagColor.startsWith('#')) ? (tagColor || 'bg-gray-500 text-white') : 'text-white'
                    )}
                    style={tagColor?.startsWith('#') ? { backgroundColor: tagColor } : {}}
                  >
                    {tagLabel || 'NOME DA TAG'}
                  </span>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-2">
                      Nome da Tag
                    </label>
                    <input
                      type="text"
                      value={tagLabel}
                      onChange={(e) => setTagLabel(e.target.value)}
                      placeholder="Ex: PRIORIDADE ALTA"
                      required
                      autoFocus
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#ff7f00] focus:ring-1 focus:ring-[#ff7f00] font-bold text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                      <Palette className="w-3 h-3" /> Cor da Tag
                    </label>
                    <div className="grid grid-cols-8 gap-2">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setTagColor(color)}
                          className={`w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center ${
                            tagColor === color ? 'border-gray-900 scale-110 shadow-lg' : 'border-transparent hover:scale-105'
                          }`}
                          style={{ backgroundColor: color }}
                        >
                          {tagColor === color && <Check className="w-4 h-4 text-white drop-shadow-sm" />}
                        </button>
                      ))}
                    </div>
                    
                    {/* Custom Color Picker */}
                    <div className="mt-4 flex items-center gap-3">
                      <input 
                        type="color" 
                        value={tagColor}
                        onChange={(e) => setTagColor(e.target.value)}
                        className="w-10 h-10 border-none bg-transparent cursor-pointer p-0"
                      />
                      <span className="text-xs font-mono font-bold text-gray-500 uppercase">{tagColor}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="flex-1 bg-white border border-gray-200 text-gray-500 px-4 py-3 font-bold uppercase tracking-widest text-[10px] transition-all rounded-lg hover:bg-gray-50 active:scale-95"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving || !tagLabel.trim()}
                    className="flex-1 bg-[#ff7f00] hover:bg-orange-600 disabled:opacity-50 text-white px-4 py-3 font-bold uppercase tracking-widest text-[10px] transition-all rounded-lg active:scale-95 shadow-md shadow-orange-100"
                  >
                    {isSaving ? 'Salvando...' : 'Salvar Tag'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Project Settings Modal */}
      {isSettingsModalOpen && project && (
        <ProjectSettingsModal
          project={project}
          onClose={() => setIsSettingsModalOpen(false)}
        />
      )}
    </div>
  );
}
