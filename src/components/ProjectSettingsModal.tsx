import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Project } from '../types';
import { X, Upload, Image as ImageIcon, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { logFirestoreError, OperationType } from '../utils/errorHandlers';
import { commitWrite, friendlyWriteError, withTimeout } from '../utils/firestoreWrite';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { getUserRole, isProjectOwner } from '../utils/roleHelpers';

interface ProjectSettingsModalProps {
  project: Project;
  onClose: () => void;
}

export default function ProjectSettingsModal({ project, onClose }: ProjectSettingsModalProps) {
  const { user } = useAuth();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [photoURL, setPhotoURL] = useState(project.photoURL || '');

  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Estados para Excluir Projeto
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Check permissions
  const userRole = user ? getUserRole(project, user.uid) : 'viewer';
  const isOwner = user ? isProjectOwner(project, user.uid) : false;
  const canEdit = userRole === 'owner' || userRole === 'admin';

  // Redirect if user doesn't have permission
  if (!canEdit) {
    onClose();
    return null;
  }

  // CREDENCIAIS DO CLOUDINARY - Substitua pelos seus dados
  const CLOUDINARY_CLOUD_NAME = 'drmgydsjc';
  const CLOUDINARY_UPLOAD_PRESET = 'cirzsuhz';

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Por favor, selecione apenas arquivos de imagem.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('A imagem deve ter no máximo 2MB.');
      return;
    }

    setIsUploading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        {
          method: 'POST',
          body: formData,
        }
      );

      const data = await response.json();

      if (response.ok) {
        setPhotoURL(data.secure_url);
      } else {
        throw new Error(data.error?.message || 'Erro ao fazer upload da imagem.');
      }
    } catch (err: any) {
      console.error('Cloudinary Error:', err);
      setError('Falha na comunicação com o servidor de imagens. Verifique as configurações.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    setError('');

    try {
      const projectRef = doc(db, 'projects', project.id);
      await commitWrite(updateDoc(projectRef, {
        name: name.trim(),
        description: description.trim(),
        photoURL: photoURL || null,
        updatedAt: serverTimestamp(),
      }), { label: 'as configurações do projeto' });
      onClose();
    } catch (err) {
      logFirestoreError(err, OperationType.UPDATE, `projects/${project.id}`);
      setError(friendlyWriteError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProject = async () => {
    if (deleteConfirmId !== project.shortId) return;
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);

      const boardsQ = query(collection(db, 'boards'), where('projectId', '==', project.id));
      const boardsSnap = await withTimeout(getDocs(boardsQ));
      boardsSnap.forEach((boardDoc) => {
        batch.delete(boardDoc.ref);
      });

      const tasksQ = query(collection(db, 'tasks'), where('projectId', '==', project.id));
      const tasksSnap = await withTimeout(getDocs(tasksQ));
      tasksSnap.forEach((taskDoc) => {
        batch.delete(taskDoc.ref);
      });

      batch.delete(doc(db, 'projects', project.id));

      await commitWrite(batch.commit(), { label: 'a exclusão do projeto' });

      setIsDeleteModalOpen(false);
      onClose();
      navigate('/dashboard');
    } catch (err) {
      console.error("Erro ao deletar projeto e dependências:", err);
      logFirestoreError(err, OperationType.DELETE, `projects/${project.id}`);
      setError(friendlyWriteError(err));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white border border-gray-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl rounded-xl"
      >
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold uppercase tracking-wider text-gray-900">Personalizar Projeto</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-8">
          {error && (
            <div className="bg-red-50 text-red-600 border border-red-200 p-3 text-sm rounded-md font-medium">
              {error}
            </div>
          )}

          {/* Seção de Upload de Imagem */}
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="flex-shrink-0 flex flex-col items-center gap-4">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider text-center w-full">
                Capa do Projeto
              </label>
              
              <div 
                className="w-40 h-40 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden relative group cursor-pointer hover:border-[#ff7f00] transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {photoURL ? (
                  <>
                    <img src={photoURL} alt="Capa" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white">
                      <Upload className="w-6 h-6 mb-1" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Trocar Capa</span>
                    </div>
                  </>
                ) : (
                  <div className="text-gray-400 flex flex-col items-center group-hover:text-[#ff7f00] transition-colors">
                    <ImageIcon className="w-8 h-8 mb-2" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-center px-4">
                      Clique para fazer upload
                    </span>
                  </div>
                )}

                {isUploading && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-[#ff7f00] animate-spin" />
                  </div>
                )}
              </div>
              
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageUpload} 
                accept="image/*" 
                className="hidden" 
              />
              
              {photoURL && (
                <button 
                  type="button" 
                  onClick={() => setPhotoURL('')}
                  className="text-xs text-red-500 font-bold uppercase tracking-wider hover:underline"
                >
                  Remover Foto
                </button>
              )}
            </div>

            {/* Campos de Texto */}
            <div className="flex-1 space-y-6 w-full">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Nome do Projeto *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] uppercase font-bold rounded-md transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Descrição
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] resize-none rounded-md transition-colors"
                  placeholder="Objetivos, metadados da escuderia..."
                />
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4 sm:gap-0">
            {isOwner ? (
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(true)}
                className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-red-600 hover:bg-red-50 transition-colors rounded-none flex items-center gap-2 w-full sm:w-auto justify-center"
                title="Apagar Projeto"
              >
                <Trash2 className="w-4 h-4" />
                Apagar Projeto
              </button>
            ) : (
              <div className="text-xs text-gray-500 italic">
                Apenas o dono pode excluir o projeto
              </div>
            )}
            <div className="flex justify-end gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors rounded-none"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving || isUploading || !name.trim()}
                className="px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white bg-[#ff7f00] hover:bg-orange-600 disabled:opacity-50 transition-colors rounded-none flex items-center gap-2"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isSaving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>

    <AnimatePresence>
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white border border-red-200 w-full max-w-md overflow-hidden shadow-2xl rounded-xl"
          >
            <div className="flex justify-between items-center p-6 border-b border-red-100 bg-red-50">
              <h3 className="text-xl font-bold uppercase text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Excluir Permanentemente
              </h3>
              <button onClick={() => { setIsDeleteModalOpen(false); setDeleteConfirmId(''); }} className="text-red-400 hover:text-red-600 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-gray-700">
                Atenção! Todas as colunas e tarefas de <strong className="text-gray-900 uppercase">{project.name}</strong> serão apagadas do banco de dados para sempre.
              </p>
              
              <div className="bg-gray-50 p-4 border border-gray-200 rounded-md">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Digite o ID <span className="text-red-600 tracking-[0.2em]">{project.shortId}</span> para confirmar:
                </label>
                <input 
                  type="text" 
                  value={deleteConfirmId} 
                  onChange={(e) => setDeleteConfirmId(e.target.value.toUpperCase())}
                  maxLength={8}
                  className="w-full bg-white border border-red-300 px-4 py-3 text-red-700 focus:outline-none focus:border-red-500 font-bold tracking-[0.2em] uppercase transition-all rounded-md placeholder:text-red-200"
                  placeholder="DIGITE AQUI"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => { setIsDeleteModalOpen(false); setDeleteConfirmId(''); }} className="flex-1 bg-white border border-gray-300 text-gray-700 px-4 py-3 font-bold uppercase tracking-wider transition-colors rounded-none">
                  Cancelar
                </button>
                <button 
                  type="button" 
                  onClick={handleDeleteProject} 
                  disabled={isDeleting || deleteConfirmId !== project.shortId} 
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:bg-gray-300 disabled:text-gray-500 text-white px-4 py-3 font-bold uppercase tracking-wider transition-colors rounded-none"
                >
                  {isDeleting ? 'Excluindo...' : 'Apagar Projeto'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
    </>
  );
}