import { useCallback, useEffect, useState } from 'react';
import { Users, Plus, Trash2, Shield, ShieldOff, KeyRound, RotateCcw, UserX, UserCheck } from 'lucide-react';
import { authenticatedFetch } from '../../../../utils/api';

type User = {
  id: number;
  username: string;
  role: 'admin' | 'user';
  data_dir: string | null;
  git_name: string | null;
  git_email: string | null;
  created_at: string;
  last_login: string | null;
  is_active: number;
  claude_auth_status: string;
};

type CreateUserForm = {
  username: string;
  password: string;
  role: 'admin' | 'user';
  gitName: string;
  gitEmail: string;
};

const INITIAL_FORM: CreateUserForm = {
  username: '',
  password: '',
  role: 'user',
  gitName: '',
  gitEmail: '',
};

export default function UserManagementTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>(INITIAL_FORM);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authenticatedFetch('/api/admin/users');
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
      } else {
        setError(data.error || 'Failed to load users');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreateUser = useCallback(async () => {
    if (!createForm.username || !createForm.password) return;
    setCreating(true);
    setActionError(null);
    try {
      const res = await authenticatedFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateForm(false);
        setCreateForm(INITIAL_FORM);
        await loadUsers();
      } else {
        setActionError(data.error || 'Failed to create user');
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  }, [createForm, loadUsers]);

  const handleAction = useCallback(async (userId: number, action: string, body?: object) => {
    setActionError(null);
    try {
      const method = action === 'delete' ? 'DELETE' : 'PUT';
      const url = action === 'delete'
        ? `/api/admin/users/${userId}`
        : `/api/admin/users/${userId}/${action}`;
      const res = await authenticatedFetch(url, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await res.json();
      if (!data.success) {
        setActionError(data.error || `Failed to ${action} user`);
      }
      await loadUsers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Failed to ${action} user`);
    }
  }, [loadUsers]);

  const handleResetPassword = useCallback(async (userId: number) => {
    const newPassword = prompt('Enter new password (min 6 characters):');
    if (!newPassword || newPassword.length < 6) {
      if (newPassword !== null) setActionError('Password must be at least 6 characters');
      return;
    }
    await handleAction(userId, 'password', { password: newPassword });
  }, [handleAction]);

  const authStatusBadge = (status: string) => {
    switch (status) {
      case 'oauth':
        return <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-600">OAuth</span>;
      case 'api_key':
        return <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-600">API Key</span>;
      default:
        return <span className="inline-flex items-center rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-600">Not configured</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-medium text-foreground">User Management</h3>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create User
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage users who can access this CloudCLI instance. Each user has an isolated workspace and independent Claude CLI credentials.
        </p>
      </div>

      {/* Error display */}
      {(error || actionError) && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error || actionError}
        </div>
      )}

      {/* Create user form */}
      {showCreateForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <h4 className="font-medium text-foreground">Create New User</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Username *</label>
              <input
                type="text"
                value={createForm.username}
                onChange={(e) => setCreateForm(f => ({ ...f, username: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Password *</label>
              <input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm(f => ({ ...f, password: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="min 6 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Git Name</label>
              <input
                type="text"
                value={createForm.gitName}
                onChange={(e) => setCreateForm(f => ({ ...f, gitName: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Git Email</label>
              <input
                type="text"
                value={createForm.gitEmail}
                onChange={(e) => setCreateForm(f => ({ ...f, gitEmail: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="john@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Role</label>
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm(f => ({ ...f, role: e.target.value as 'admin' | 'user' }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleCreateUser}
              disabled={creating || !createForm.username || !createForm.password}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {creating ? 'Creating...' : 'Create User'}
            </button>
            <button
              onClick={() => { setShowCreateForm(false); setCreateForm(INITIAL_FORM); }}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Git Identity</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Claude Auth</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Login</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => (
                <tr key={user.id} className={user.is_active ? '' : 'opacity-50'}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{user.username}</div>
                    <div className="text-xs text-muted-foreground">ID: {user.id}</div>
                  </td>
                  <td className="px-4 py-3">
                    {user.role === 'admin' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-600">
                        <Shield className="h-3 w-3" /> Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-500/10 px-2 py-0.5 text-xs text-muted-foreground">User</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {user.git_name || user.git_email ? (
                      <div>
                        <div className="text-foreground">{user.git_name || '—'}</div>
                        <div className="text-xs text-muted-foreground">{user.git_email || '—'}</div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{authStatusBadge(user.claude_auth_status)}</td>
                  <td className="px-4 py-3">
                    {user.is_active ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-600">Active</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-600">Deactivated</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {/* Toggle role */}
                      <button
                        onClick={() => handleAction(user.id, 'role', { role: user.role === 'admin' ? 'user' : 'admin' })}
                        className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                        title={user.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
                      >
                        {user.role === 'admin' ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                      </button>
                      {/* Reset password */}
                      <button
                        onClick={() => handleResetPassword(user.id)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                        title="Reset password"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      {/* Activate/Deactivate */}
                      {user.is_active ? (
                        <button
                          onClick={() => handleAction(user.id, 'deactivate')}
                          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-orange-500 transition-colors"
                          title="Deactivate user"
                        >
                          <UserX className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAction(user.id, 'reactivate')}
                          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-green-500 transition-colors"
                          title="Reactivate user"
                        >
                          <UserCheck className="h-4 w-4" />
                        </button>
                      )}
                      {/* Delete */}
                      <button
                        onClick={() => {
                          if (confirm(`Delete user "${user.username}"? This will also remove their data directory.`)) {
                            handleAction(user.id, 'delete');
                          }
                        }}
                        className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-red-500 transition-colors"
                        title="Delete user"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 && (
          <div className="px-4 py-8 text-center text-muted-foreground">No users found.</div>
        )}
      </div>
    </div>
  );
}
