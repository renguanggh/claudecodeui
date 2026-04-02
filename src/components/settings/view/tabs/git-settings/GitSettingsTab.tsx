import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Key } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGitSettings } from '../../../hooks/useGitSettings';
import { Button, Input } from '../../../../../shared/view/ui';
import { authenticatedFetch } from '../../../../../utils/api';
import SettingsCard from '../../SettingsCard';
import SettingsSection from '../../SettingsSection';

export default function GitSettingsTab() {
  const { t } = useTranslation('settings');
  const {
    gitName,
    setGitName,
    gitEmail,
    setGitEmail,
    isLoading,
    isSaving,
    saveStatus,
    saveGitConfig,
  } = useGitSettings();

  const [sshPublicKey, setSshPublicKey] = useState<string | null>(null);
  const [sshKeyCopied, setSshKeyCopied] = useState(false);

  useEffect(() => {
    authenticatedFetch('/api/user/ssh-public-key')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.publicKey) {
          setSshPublicKey(data.publicKey);
        }
      })
      .catch(() => {});
  }, []);

  const copySshKey = useCallback(() => {
    if (!sshPublicKey) return;
    navigator.clipboard.writeText(sshPublicKey).then(() => {
      setSshKeyCopied(true);
      setTimeout(() => setSshKeyCopied(false), 2000);
    });
  }, [sshPublicKey]);

  return (
    <div className="space-y-8">
      <SettingsSection
        title={t('git.title')}
        description={t('git.description')}
      >
        <SettingsCard className="p-4">
          <div className="space-y-4">
            <div>
              <label htmlFor="settings-git-name" className="mb-2 block text-sm font-medium text-foreground">
                {t('git.name.label')}
              </label>
              <Input
                id="settings-git-name"
                type="text"
                value={gitName}
                onChange={(event) => setGitName(event.target.value)}
                placeholder="John Doe"
                disabled={isLoading}
                className="w-full"
              />
              <p className="mt-1 text-xs text-muted-foreground">{t('git.name.help')}</p>
            </div>

            <div>
              <label htmlFor="settings-git-email" className="mb-2 block text-sm font-medium text-foreground">
                {t('git.email.label')}
              </label>
              <Input
                id="settings-git-email"
                type="email"
                value={gitEmail}
                onChange={(event) => setGitEmail(event.target.value)}
                placeholder="john@example.com"
                disabled={isLoading}
                className="w-full"
              />
              <p className="mt-1 text-xs text-muted-foreground">{t('git.email.help')}</p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={saveGitConfig}
                disabled={isSaving || !gitName.trim() || !gitEmail.trim()}
              >
                {isSaving ? t('git.actions.saving') : t('git.actions.save')}
              </Button>

              {saveStatus === 'success' && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <Check className="h-4 w-4" />
                  {t('git.status.success')}
                </div>
              )}
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>

      {/* SSH Public Key Section */}
      {sshPublicKey && (
        <SettingsSection
          title="SSH Public Key"
          description="Add this key to your GitHub/GitLab account to enable SSH-based git operations (clone, push, pull)."
        >
          <SettingsCard className="p-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Key className="h-4 w-4 text-muted-foreground" />
                <span>ed25519 Public Key</span>
              </div>
              <div className="relative">
                <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-xs text-foreground select-all break-all whitespace-pre-wrap">
                  {sshPublicKey}
                </pre>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-2 h-7 px-2"
                  onClick={copySshKey}
                >
                  {sshKeyCopied ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Copy this key and add it to your Git hosting provider (e.g. GitHub → Settings → SSH and GPG keys → New SSH key).
              </p>
            </div>
          </SettingsCard>
        </SettingsSection>
      )}
    </div>
  );
}
