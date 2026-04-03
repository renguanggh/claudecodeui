import { useCallback, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { Button, Input } from '../../../shared/view/ui';
import type { WorkspaceType } from '../types';
import FolderBrowserModal from './FolderBrowserModal';

type WorkspacePathFieldProps = {
  workspaceType: WorkspaceType;
  value: string;
  disabled?: boolean;
  onChange: (path: string) => void;
  onAdvanceToConfirm: () => void;
};

export default function WorkspacePathField({
  workspaceType,
  value,
  disabled = false,
  onChange,
  onAdvanceToConfirm,
}: WorkspacePathFieldProps) {
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);

  const handleFolderSelected = useCallback(
    (selectedPath: string, advanceToConfirm: boolean) => {
      onChange(selectedPath);
      setShowFolderBrowser(false);
      if (advanceToConfirm) {
        onAdvanceToConfirm();
      }
    },
    [onAdvanceToConfirm, onChange],
  );

  return (
    <>
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <Input
            type="text"
            value={value}
            readOnly
            placeholder={
              workspaceType === 'existing'
                ? 'Click browse to select a folder'
                : 'Click browse to select a folder'
            }
            className="w-full cursor-pointer bg-muted/30"
            disabled={disabled}
            onClick={() => !disabled && setShowFolderBrowser(true)}
          />
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => setShowFolderBrowser(true)}
          className="px-3"
          title="Browse folders"
          disabled={disabled}
        >
          <FolderOpen className="h-4 w-4" />
        </Button>
      </div>

      <FolderBrowserModal
        isOpen={showFolderBrowser}
        autoAdvanceOnSelect={workspaceType === 'existing'}
        onClose={() => setShowFolderBrowser(false)}
        onFolderSelected={handleFolderSelected}
      />
    </>
  );
}
