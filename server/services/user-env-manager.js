import path from 'path';
import fs from 'fs';

// Base directory for all user data. Override with CLOUDCLI_USERS_DIR env var.
const USERS_BASE_DIR = process.env.CLOUDCLI_USERS_DIR || '/data/cloudcli/users';

const userEnvManager = {

  /**
   * Initialize the directory structure for a new user.
   * Called when admin creates a user.
   * @returns {string} The user's data directory path
   */
  initUserDataDir(userId) {
    const userDir = path.join(USERS_BASE_DIR, String(userId));
    const dirs = [
      userDir,
      path.join(userDir, '.claude'),
      path.join(userDir, 'workspace'),
      path.join(userDir, 'projects'),
    ];
    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return userDir;
  },

  /**
   * Get the base data directory for a user.
   */
  getUserDataDir(userId) {
    return path.join(USERS_BASE_DIR, String(userId));
  },

  /**
   * Get the workspace directory for a user (where CLI tools operate).
   */
  getUserWorkspaceDir(userId) {
    return path.join(USERS_BASE_DIR, String(userId), 'workspace');
  },

  /**
   * Get the projects directory for a user (where all project folders must be created).
   */
  getUserProjectsDir(userId) {
    return path.join(USERS_BASE_DIR, String(userId), 'projects');
  },

  /**
   * Validate that a requested path is inside the user's workspace directory.
   * Prevents path traversal attacks.
   * @throws {Error} if path is outside workspace
   * @returns {string} The resolved absolute path
   */
  validateWorkspacePath(userId, requestedPath) {
    const workspacePath = this.getUserWorkspaceDir(userId);
    const resolvedPath = path.resolve(requestedPath);
    if (resolvedPath !== workspacePath && !resolvedPath.startsWith(workspacePath + path.sep)) {
      throw new Error('Access denied: path outside user workspace');
    }
    return resolvedPath;
  },

  /**
   * Build environment variables for spawning processes as a specific user.
   * This is the core isolation mechanism:
   * - CLAUDE_CONFIG_DIR → isolates Claude CLI config/sessions/credentials
   * - HOME → isolates Cursor/Codex/Gemini (they all read $HOME)
   * - GIT_AUTHOR_NAME/EMAIL → isolates git commit identity
   *
   * @param {object} user - User object with id, data_dir, git_name, git_email
   * @returns {object} Environment variables object for spawn/pty.spawn
   */
  buildUserEnv(user) {
    const userDir = user.data_dir || path.join(USERS_BASE_DIR, String(user.id));
    return {
      ...process.env,
      // Claude CLI isolation (official env var)
      CLAUDE_CONFIG_DIR: path.join(userDir, '.claude'),
      // Other CLI tools isolation (Cursor/Codex/Gemini read $HOME)
      HOME: userDir,
      // Git identity isolation
      GIT_AUTHOR_NAME: user.git_name || user.username || '',
      GIT_AUTHOR_EMAIL: user.git_email || '',
      GIT_COMMITTER_NAME: user.git_name || user.username || '',
      GIT_COMMITTER_EMAIL: user.git_email || '',
      // Terminal settings
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '3',
    };
  },

  /**
   * Remove user data directory (called when admin deletes a user).
   */
  removeUserDataDir(userId) {
    const userDir = path.join(USERS_BASE_DIR, String(userId));
    if (fs.existsSync(userDir)) {
      fs.rmSync(userDir, { recursive: true, force: true });
    }
  },

  /**
   * Get the base directory path (for logging/config purposes).
   */
  getBaseDir() {
    return USERS_BASE_DIR;
  },
};

export default userEnvManager;
