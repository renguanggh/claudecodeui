import express from 'express';
import bcrypt from 'bcrypt';
import path from 'path';
import fs from 'fs';
import { userDb } from '../database/db.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import userEnvManager from '../services/user-env-manager.js';

const router = express.Router();

// All admin routes require authentication + admin role
router.use(authenticateToken, requireAdmin);

// GET /api/admin/users — List all users
router.get('/', (req, res) => {
  try {
    const users = userDb.getAllUsers();

    // Check Claude auth status per user by checking credentials file existence
    const usersWithStatus = users.map(user => {
      let claudeAuthStatus = 'not_configured';
      if (user.data_dir) {
        const credPath = path.join(user.data_dir, '.claude', '.credentials.json');
        const settingsPath = path.join(user.data_dir, '.claude', 'settings.json');
        try {
          if (fs.existsSync(credPath)) {
            claudeAuthStatus = 'oauth';
          } else if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            if (settings.env?.ANTHROPIC_API_KEY) {
              claudeAuthStatus = 'api_key';
            }
          }
        } catch {
          // ignore read errors
        }
      }
      return {
        id: user.id,
        username: user.username,
        role: user.role,
        data_dir: user.data_dir,
        git_name: user.git_name,
        git_email: user.git_email,
        created_at: user.created_at,
        last_login: user.last_login,
        is_active: user.is_active,
        claude_auth_status: claudeAuthStatus,
      };
    });

    res.json({ success: true, users: usersWithStatus });
  } catch (error) {
    console.error('Admin list users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// POST /api/admin/users — Create a new user
router.post('/', async (req, res) => {
  try {
    const { username, password, role, gitName, gitEmail } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (role && role !== 'admin' && role !== 'user') {
      return res.status(400).json({ error: 'Role must be "admin" or "user"' });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = userDb.createUserByAdmin(username, passwordHash, role || 'user', gitName, gitEmail, null);

    // Initialize user data directory
    const dataDir = userEnvManager.initUserDataDir(user.id);
    userDb.updateUserDataDir(user.id, dataDir);

    // Generate SSH key pair for the user
    try {
      userEnvManager.generateSshKey(user.id, gitEmail || '');
    } catch (err) {
      console.warn(`Failed to generate SSH key for user ${user.id}:`, err.message);
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        data_dir: dataDir,
        git_name: gitName || null,
        git_email: gitEmail || null,
      },
    });
  } catch (error) {
    console.error('Admin create user error:', error);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'Username already exists' });
    } else {
      res.status(500).json({ error: error.message || 'Failed to create user' });
    }
  }
});

// PUT /api/admin/users/:id — Update user info (gitName, gitEmail)
router.put('/:id', (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { gitName, gitEmail } = req.body;

    if (gitName !== undefined || gitEmail !== undefined) {
      userDb.updateGitConfig(userId, gitName || null, gitEmail || null);
    }

    const user = userDb.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('Admin update user error:', error);
    res.status(500).json({ error: error.message || 'Failed to update user' });
  }
});

// PUT /api/admin/users/:id/role — Change user role
router.put('/:id/role', (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { role } = req.body;

    if (!role || (role !== 'admin' && role !== 'user')) {
      return res.status(400).json({ error: 'Role must be "admin" or "user"' });
    }

    userDb.setUserRole(userId, role);
    res.json({ success: true });
  } catch (error) {
    console.error('Admin set role error:', error);
    res.status(400).json({ error: error.message || 'Failed to update role' });
  }
});

// PUT /api/admin/users/:id/deactivate — Deactivate user
router.put('/:id/deactivate', (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot deactivate yourself' });
    }
    userDb.deactivateUser(userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Admin deactivate user error:', error);
    res.status(400).json({ error: error.message || 'Failed to deactivate user' });
  }
});

// PUT /api/admin/users/:id/reactivate — Reactivate user
router.put('/:id/reactivate', (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    userDb.reactivateUser(userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Admin reactivate user error:', error);
    res.status(500).json({ error: error.message || 'Failed to reactivate user' });
  }
});

// PUT /api/admin/users/:id/password — Reset user password
router.put('/:id/password', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    userDb.updateUserPassword(userId, passwordHash);

    res.json({ success: true });
  } catch (error) {
    console.error('Admin reset password error:', error);
    res.status(500).json({ error: error.message || 'Failed to reset password' });
  }
});

// DELETE /api/admin/users/:id — Delete user and clean up data directory
router.delete('/:id', (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    // Get user to find data_dir before deletion
    const user = userDb.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete from database (will throw if last admin)
    userDb.deleteUser(userId);

    // Clean up data directory
    if (user.data_dir) {
      try {
        userEnvManager.removeUserDataDir(userId);
      } catch (err) {
        console.warn(`Failed to remove data directory for user ${userId}:`, err.message);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Admin delete user error:', error);
    res.status(400).json({ error: error.message || 'Failed to delete user' });
  }
});

export default router;
