import { useCallback, useEffect, useRef, useState } from 'react';
import { Settings, ArrowUpCircle, User, LogOut, FolderOpen } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { ReleaseInfo } from '../../../../types/sharedTypes';
import { useAuth } from '../../../auth/context/AuthContext';
import ProjectsFolderBrowser from './ProjectsFolderBrowser';

type SidebarFooterProps = {
  updateAvailable: boolean;
  releaseInfo: ReleaseInfo | null;
  latestVersion: string | null;
  onShowVersionModal: () => void;
  onShowSettings: () => void;
  t: TFunction;
};

export default function SidebarFooter({
  updateAvailable,
  releaseInfo,
  latestVersion,
  onShowVersionModal,
  onShowSettings,
  t,
}: SidebarFooterProps) {
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!showUserMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showUserMenu]);

  const handleLogout = useCallback(() => {
    setShowUserMenu(false);
    if (window.confirm('Are you sure you want to logout?')) {
      logout();
    }
  }, [logout]);
  return (
    <div className="flex-shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}>
      {/* Update banner */}
      {updateAvailable && (
        <>
          <div className="nav-divider" />
          {/* Desktop update */}
          <div className="hidden px-2 py-1.5 md:block">
            <button
              className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-blue-50/80 dark:hover:bg-blue-900/15"
              onClick={onShowVersionModal}
            >
              <div className="relative flex-shrink-0">
                <ArrowUpCircle className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-blue-600 dark:text-blue-300">
                  {releaseInfo?.title || `v${latestVersion}`}
                </span>
                <span className="text-[10px] text-blue-500/70 dark:text-blue-400/60">
                  {t('version.updateAvailable')}
                </span>
              </div>
            </button>
          </div>

          {/* Mobile update */}
          <div className="px-3 py-2 md:hidden">
            <button
              className="flex h-11 w-full items-center gap-3 rounded-xl border border-blue-200/60 bg-blue-50/80 px-3.5 transition-all active:scale-[0.98] dark:border-blue-700/40 dark:bg-blue-900/15"
              onClick={onShowVersionModal}
            >
              <div className="relative flex-shrink-0">
                <ArrowUpCircle className="w-4.5 h-4.5 text-blue-500 dark:text-blue-400" />
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium text-blue-600 dark:text-blue-300">
                  {releaseInfo?.title || `v${latestVersion}`}
                </span>
                <span className="text-xs text-blue-500/70 dark:text-blue-400/60">
                  {t('version.updateAvailable')}
                </span>
              </div>
            </button>
          </div>
        </>
      )}

      {/* Discord + Settings */}
      <div className="nav-divider" />

      {/* Desktop user info with menu */}
      <div className="hidden px-2 pt-1.5 md:block">
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            <User className="h-3.5 w-3.5" />
            <span className="text-sm truncate">{user?.username || t('actions.joinCommunity')}</span>
          </button>
          {showUserMenu && (
            <div className="absolute bottom-full left-0 mb-1 w-full rounded-lg border border-border bg-popover p-1 shadow-lg">
              <button
                onMouseDown={(e) => { e.preventDefault(); setShowUserMenu(false); setShowFolderBrowser(true); }}
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
      </div>

      {/* Desktop settings */}
      <div className="hidden px-2 py-1.5 md:block">
        <button
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          onClick={onShowSettings}
        >
          <Settings className="h-3.5 w-3.5" />
          <span className="text-sm">{t('actions.settings')}</span>
        </button>
      </div>

      {/* Mobile user info with menu */}
      <div className="px-3 pt-3 md:hidden">
        <div className="relative" ref={showUserMenu ? menuRef : undefined}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex h-12 w-full items-center gap-3.5 rounded-xl bg-muted/40 px-4 transition-all hover:bg-muted/60 active:scale-[0.98]"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-background/80">
              <User className="w-4.5 h-4.5 text-muted-foreground" />
            </div>
            <span className="text-base font-medium text-foreground truncate">{user?.username || t('actions.joinCommunity')}</span>
          </button>
          {showUserMenu && (
            <div className="absolute bottom-full left-0 mb-1 w-full rounded-xl border border-border bg-popover p-1 shadow-lg">
              <button
                onMouseDown={(e) => { e.preventDefault(); setShowUserMenu(false); setShowFolderBrowser(true); }}
                className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                <FolderOpen className="h-4 w-4" />
                Manage Project Folders
              </button>
              <button
                onMouseDown={(e) => { e.preventDefault(); handleLogout(); }}
                className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-red-500 transition-colors hover:bg-red-500/10"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile settings */}
      <div className="px-3 pb-20 pt-2 md:hidden">
        <button
          className="flex h-12 w-full items-center gap-3.5 rounded-xl bg-muted/40 px-4 transition-all hover:bg-muted/60 active:scale-[0.98]"
          onClick={onShowSettings}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-background/80">
            <Settings className="w-4.5 h-4.5 text-muted-foreground" />
          </div>
          <span className="text-base font-medium text-foreground">{t('actions.settings')}</span>
        </button>
      </div>

      <ProjectsFolderBrowser isOpen={showFolderBrowser} onClose={() => setShowFolderBrowser(false)} />
    </div>
  );
}
