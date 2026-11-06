import React, { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, auth } from '../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { X, Upload, User as UserIcon, Loader2 } from 'lucide-react';
import { logFirestoreError, OperationType } from '../utils/errorHandlers';
import { commitWrite, friendlyWriteError, withTimeout } from '../utils/firestoreWrite';
import { motion } from 'motion/react';
import { useI18n } from '../i18n/LanguageContext';

interface UserProfileModalProps {
  onClose: () => void;
}

export default function UserProfileModal({ onClose }: UserProfileModalProps) {
  const { user } = useAuth();
  const { t, language, toggleLanguage } = useI18n();
  const [name, setName] = useState(user?.displayName || '');
  const [photoURL, setPhotoURL] = useState(user?.photoURL || '');
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // CREDENCIAIS DO CLOUDINARY
  const CLOUDINARY_CLOUD_NAME = 'drmgydsjc';
  const CLOUDINARY_UPLOAD_PRESET = 'cirzsuhz';

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      setError(t.profile.imageOnly);
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
        throw new Error(data.error?.message || t.profile.uploadError);
      }
    } catch (err: any) {
      console.error('Cloudinary Error:', err);
      setError(t.profile.uploadFailed);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !user) return;

    setIsSaving(true);
    setError('');

    try {
      // 1. Atualizar no Firebase Auth
      await withTimeout(updateProfile(user, {
        displayName: name.trim(),
        photoURL: photoURL || null
      }));

      // 2. Atualizar no Firestore
      const userRef = doc(db, 'users', user.uid);
      const result = await commitWrite(updateDoc(userRef, {
        name: name.trim(),
        photoURL: photoURL || null,
        updatedAt: serverTimestamp()
      }), { label: 'o perfil' });

      onClose();
      // Recarregar a página para garantir que o contexto de auth seja atualizado em todo o app.
      // Só recarrega após a confirmação do servidor: o cache é em memória e o reload
      // descartaria uma escrita ainda na fila.
      if (result === 'committed') window.location.reload();
    } catch (err) {
      logFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
      setError(friendlyWriteError(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white border border-gray-200 w-full max-w-md overflow-hidden shadow-xl rounded-xl"
      >
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold uppercase tracking-wider text-gray-900">{t.profile.title}</h2>
          <button onClick={onClose} aria-label={t.profile.close} className="text-gray-400 hover:text-gray-900 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 border border-red-200 p-3 text-sm rounded-md font-medium text-center">
              {error}
            </div>
          )}

          <div className="flex flex-col items-center gap-4">
            <div 
              className="w-32 h-32 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden relative group cursor-pointer hover:border-[#ff7f00] transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {photoURL ? (
                <>
                  <img src={photoURL} alt={t.profile.photoAlt} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-center p-2">
                    <Upload className="w-5 h-5 mb-1" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">{t.profile.changePhoto}</span>
                  </div>
                </>
              ) : (
                <div className="text-gray-400 flex flex-col items-center group-hover:text-[#ff7f00] transition-colors p-4 text-center">
                  <UserIcon className="w-10 h-10 mb-2" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">
                    {t.profile.upload}
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
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
                {t.profile.userName}
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold uppercase rounded-none transition-colors"
              />
            </div>
            
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
                {t.profile.emailReadOnly}
              </label>
              <input
                type="email"
                disabled
                value={user?.email || ''}
                className="w-full bg-gray-50 border border-gray-200 px-4 py-3 text-gray-400 font-bold rounded-none cursor-not-allowed"
              />
            </div>

            <div>
              <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
                {t.profile.languageLabel}
              </span>
              {/* Applies immediately; not tied to the form's Save button. */}
              <button
                type="button"
                role="switch"
                aria-checked={language === 'en'}
                aria-label={t.profile.languageSwitchAria}
                onClick={toggleLanguage}
                className="flex items-center gap-3 group"
              >
                <span
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${language === 'en' ? 'bg-[#ff7f00]' : 'bg-gray-300'}`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${language === 'en' ? 'translate-x-5' : 'translate-x-0.5'}`}
                  />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-gray-700 group-hover:text-[#ff7f00] transition-colors">
                  {t.profile.languageEnglish}
                </span>
              </button>
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 text-xs font-bold uppercase tracking-wider text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors rounded-none"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={isSaving || isUploading || !name.trim()}
              className="flex-1 px-6 py-3 text-xs font-bold uppercase tracking-wider text-white bg-[#ff7f00] hover:bg-orange-600 disabled:opacity-50 transition-colors rounded-none flex items-center justify-center gap-2"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isSaving ? t.common.saving : t.common.save}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
