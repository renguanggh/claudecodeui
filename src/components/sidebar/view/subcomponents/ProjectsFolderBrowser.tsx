import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, Loader2, Trash2, X } from 'lucide-react';
import { Button } from '../../../../shared/view/ui';
import { authenticatedFetch } from '../../../../utils/api';

type FolderEntry = {
  name: string;
  path: string;
  type: string;
};

type ProjectsFolderBrowserProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function ProjectsFolderBrowser({ isOpen, onClose }: ProjectsFolderBrowserProps) {
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rootPath, setRootPath] = useState('');

  const loadFolders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch workspace root to know the projects dir
      const rootRes = await authenticatedFetch('/api/workspace-root');
      const rootData = await rootRes.json();
      const projectsRoot = rootData.path || '~';
      setRootPath(projectsRoot);

      // Browse the projects root
      const browseRes = await authenticatedFetch(`/api/browse-filesystem?path=${encodeURIComponent(projectsRoot)}`);
      const browseData = await browseRes.json();
      if (browseData.suggestions) {
        setFolders(
          browseData.suggestions
            .filter((s: FolderEntry) => !s.name.startsWith('.'))
            .sort((a: FolderEntry, b: FolderEntry) => a.name.localeCompare(b.name))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load folders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadFolders();
    }
  }, [isOpen, loadFolders]);

  const handleDelete = useCallback(async (folder: FolderEntry) => {
    if (!window.confirm(`Are you sure you want to delete "${folder.name}"?\n\nThis will permanently remove the directory and all its contents.`)) {
      return;
    }
    setDeleting(folder.path);
    setError(null);
    try {
      const res = await authenticatedFetch('/api/delete-folder', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folder.path }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to delete folder');
      } else {
        // Refresh the list
        await loadFolders();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete folder');
    } finally {
      setDeleting(null);
    }
  }, [loadFolders]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[70vh] w-full max-w-lg flex-col rounded-lg border border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
              <FolderOpen className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Browse Projects</h3>
              <p className="text-xs text-muted-foreground truncate max-w-[300px]">{rootPath}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Folder list */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : folders.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No project folders found.
            </div>
          ) : (
            <div className="space-y-0.5">
              {folders.map((folder) => (
                <div
                  key={folder.path}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-accent/40 transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FolderOpen className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <span className="text-sm text-foreground truncate">{folder.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all"
                    onClick={() => handleDelete(folder)}
                    disabled={deleting === folder.path}
                    title={`Delete ${folder.name}`}
                  >
                    {deleting === folder.path ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border p-3 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
