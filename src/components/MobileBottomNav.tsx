import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FolderKanban, User } from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '../i18n/LanguageContext';

interface MobileBottomNavProps {
  onOpenProfile?: () => void;
}

export default function MobileBottomNav({ onOpenProfile }: MobileBottomNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  const isProjectsActive = location.pathname === '/dashboard';

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 safe-area-bottom">
      <div className="flex items-center justify-around h-16">
        {/* Projetos */}
        <button
          onClick={() => navigate('/dashboard')}
          className={clsx(
            'flex flex-col items-center justify-center flex-1 h-full transition-colors gap-1',
            isProjectsActive
              ? 'text-[#ff7f00]'
              : 'text-gray-400 active:text-gray-900'
          )}
        >
          <FolderKanban className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase tracking-wider">
            {t.nav.mobileProjects}
          </span>
        </button>

        {/* Perfil */}
        <button
          onClick={onOpenProfile}
          className="flex flex-col items-center justify-center flex-1 h-full transition-colors gap-1 text-gray-400 active:text-gray-900"
        >
          <User className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase tracking-wider">
            {t.nav.mobileProfile}
          </span>
        </button>
      </div>
    </nav>
  );
}
