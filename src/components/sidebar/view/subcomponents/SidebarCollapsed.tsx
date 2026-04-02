import { useCallback, useEffect, useRef, useState } from 'react';
import { Settings, Sparkles, PanelLeftOpen, User, LogOut, FolderOpen } from 'lucide-react';
import type { TFunction } from 'i18next';
import { useAuth } from '../../../auth/context/AuthContext';
import ProjectsFolderBrowser from './ProjectsFolderBrowser';

type SidebarCollapsedProps = {
  onExpand: () => void;
  onShowSettings: () => void;
  updateAvailable: boolean;
  onShowVersionModal: () => void;
  t: TFunction;
};

export default function SidebarCollapsed({
  onExpand,
  onShowSettings,
  updateAvailable,
  onShowVersionModal,
  t,
}: SidebarCollapsedProps) {
  const { user, logout } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  const handleLogout = useCallback(() => {
    setShowMenu(false);
    if (window.confirm('Are you sure you want to logout?')) {
      logout();
    }
  }, [logout]);
  return (
    <div className="flex h-full w-12 flex-col items-center gap-1 bg-background/80 py-3 backdrop-blur-sm">
      {/* Expand button with brand logo */}
      <button
        onClick={onExpand}
        className="group flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-accent/80"
        aria-label={t('common:versionUpdate.ariaLabels.showSidebar')}
        title={t('common:versionUpdate.ariaLabels.showSidebar')}
      >
        <PanelLeftOpen className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
      </button>

      <div className="nav-divider my-1 w-6" />

      {/* Settings */}
      <button
        onClick={onShowSettings}
        className="group flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-accent/80"
        aria-label={t('actions.settings')}
        title={t('actions.settings')}
      >
        <Settings className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
      </button>

      {/* User */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="group flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-accent/80"
          title={user?.username || ''}
        >
          <User className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
        </button>
        {showMenu && (
          <div className="absolute bottom-0 left-full ml-1 w-40 rounded-lg border border-border bg-popover p-1 shadow-lg">
            <button
              onMouseDown={(e) => { e.preventDefault(); setShowMenu(false); setShowFolderBrowser(true); }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Manage Project Folders
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); handleLogout(); }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-red-500 transition-colors hover:bg-red-500/10"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </button>
          </div>
        )}
      </div>

      {/* Update indicator */}
      {updateAvailable && (
        <button
          onClick={onShowVersionModal}
          className="relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-accent/80"
          aria-label={t('common:versionUpdate.ariaLabels.updateAvailable')}
          title={t('common:versionUpdate.ariaLabels.updateAvailable')}
        >
          <Sparkles className="h-4 w-4 text-blue-500" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
        </button>
      )}

      <ProjectsFolderBrowser isOpen={showFolderBrowser} onClose={() => setShowFolderBrowser(false)} />
    </div>
  );
}
