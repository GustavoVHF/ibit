import { useState } from 'react';
import { motion } from 'motion/react';
import { Link, Copy, Trash2, AlertTriangle, X } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Project } from '../types';
import { commitWrite } from '../utils/firestoreWrite';
import { useI18n } from '../i18n/LanguageContext';

interface AuditModalProps {
  project: Project;
  onClose: () => void;
}

export default function AuditModal({ project, onClose }: AuditModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const { t } = useI18n();

  const generateToken = async () => {
    setIsGenerating(true);
    try {
      const token = crypto.randomUUID();
      await commitWrite(updateDoc(doc(db, 'projects', project.id), { auditToken: token }), { label: 'o link de auditoria' });
    } catch (error) {
      console.error('Erro ao gerar token:', error);
      alert(t.audit.generateError);
    } finally {
      setIsGenerating(false);
    }
  };

  const revokeToken = async () => {
    if (!confirm(t.audit.revokeConfirm)) return;

    try {
      await commitWrite(updateDoc(doc(db, 'projects', project.id), { auditToken: null }), { label: 'a revogação do link' });
    } catch (error) {
      console.error('Erro ao revogar token:', error);
      alert(t.audit.revokeError);
    }
  };

  const copyLink = () => {
    const url = `${window.location.origin}/audit/${project.auditToken}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center">
              <Link className="w-5 h-5 text-[#ff7f00]" />
            </div>
            <h2 className="text-lg font-bold uppercase tracking-wider text-gray-900">
              {t.audit.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t.common.close}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Warning */}
          <div className="flex gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-[#ff7f00] shrink-0 mt-0.5" />
            <div className="text-sm text-gray-700">
              <p className="font-bold mb-1">{t.audit.publicLink}</p>
              <p>{t.audit.publicLinkText}</p>
            </div>
          </div>

          {/* Token State */}
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-[#ff7f00] border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t.audit.generating}</p>
            </div>
          ) : project.auditToken ? (
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
                  {t.audit.linkLabel}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={`${window.location.origin}/audit/${project.auditToken}`}
                    readOnly
                    className="flex-1 px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm font-mono"
                  />
                  <button
                    onClick={copyLink}
                    className="px-4 py-2 bg-[#ff7f00] text-white font-bold uppercase tracking-wider text-xs rounded-none hover:bg-orange-600 transition-colors flex items-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    {copied ? t.audit.copied : t.audit.copy}
                  </button>
                </div>
              </div>

              <button
                onClick={revokeToken}
                className="w-full px-4 py-2 bg-red-50 border border-red-200 text-red-600 font-bold uppercase tracking-wider text-xs rounded-none hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {t.audit.revoke}
              </button>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500 mb-4">{t.audit.noLink}</p>
              <button
                onClick={generateToken}
                className="px-6 py-3 bg-[#ff7f00] text-white font-bold uppercase tracking-wider text-xs rounded-none hover:bg-orange-600 transition-colors"
              >
                {t.audit.generate}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 border border-gray-300 text-gray-700 font-bold uppercase tracking-wider text-xs rounded-none hover:bg-gray-200 transition-colors"
          >
            {t.common.close}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
