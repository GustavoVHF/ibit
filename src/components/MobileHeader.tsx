import React from 'react';
import { Menu } from 'lucide-react';
import { useI18n } from '../i18n/LanguageContext';

interface MobileHeaderProps {
  projectName?: string;
  projectPhotoURL?: string;
  onOpenDrawer: () => void;
}

export default function MobileHeader({ projectName, projectPhotoURL, onOpenDrawer }: MobileHeaderProps) {
  const { t } = useI18n();
  return (
    <header className="lg:hidden sticky top-0 z-40 bg-white border-b border-gray-200 px-4 h-16 flex items-center gap-4 shrink-0">
      {/* Hamburger */}
      <button
        onClick={onOpenDrawer}
        aria-label={t.nav.openMenu}
        className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors shrink-0"
      >
        <Menu className="w-5 h-5 text-gray-700" />
      </button>

      {/* Project photo */}
      <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden border border-gray-100 shrink-0 shadow-sm">
        {projectPhotoURL ? (
          <img src={projectPhotoURL} alt={projectName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="text-xl">🏎️</span>
        )}
      </div>

      {/* Project name */}
      <h1 className="text-lg sm:text-xl font-bold uppercase tracking-wider text-gray-900 truncate min-w-0 flex-1">
        {projectName || t.common.project}
      </h1>
    </header>
  );
}
