# 多用户支持实施计划

## Context

CloudCLI UI 当前是一个**单用户系统**——注册接口只允许创建一个用户，所有 CLI 进程在宿主机直接执行，会话数据写入宿主机 `~/.claude/projects` 等固定路径。要支持多人使用同一个部署实例，需要从数据库、认证、用户隔离、API、前端全链路改造。

### 核心设计决策

1. **管理员创建用户**——第一个注册用户自动成为管理员，后续用户由管理员在用户管理界面中创建，用户使用用户名+密码登录（密码 bcrypt 加密存储）
2. **环境变量隔离**——通过 `CLAUDE_CONFIG_DIR`、`HOME` 等环境变量为每个用户指定独立的数据目录，无需 Docker 或沙盒，改动量最小
3. **每用户独立工作目录**——每个用户有自己的 HOME 目录（`/data/cloudcli/users/{userId}/`），所有项目文件**只能在用户工作目录内创建**，CLI 工具的会话、配置、凭证天然隔离
4. **每用户独立 Claude 认证**——每个用户需在自己的终端中通过 `claude login`（OAuth）或配置 `ANTHROPIC_API_KEY`（API Key）完成 Claude CLI 认证，凭证存储在各自的 `CLAUDE_CONFIG_DIR` 中，互不干扰
5. **Git 身份通过环境变量注入**——每次 spawn 进程时设置 `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL` 等，确保 commit 身份正确
6. **角色从数据库实时读取**（非仅 JWT）——确保角色变更即时生效

### 当前架构关键信息

| 组件 | 当前实现 |
|------|----------|
| Claude | 通过 `@anthropic-ai/claude-agent-sdk` SDK 直接调用（非 CLI）|
| Cursor/Codex/Gemini | 通过 `child_process.spawn()` 启动 CLI 进程 |
| Shell/终端 | 通过 `node-pty` 的 `pty.spawn()` 创建 PTY 会话 |
| 会话路径 | 硬编码为 `os.homedir()` 下的固定目录，不可配置 |
| Git 操作 | `spawn('git', args)` 直接执行，使用全局 `git config` |

### 隔离原理

Claude CLI 官方支持 `CLAUDE_CONFIG_DIR` 环境变量，设置后所有数据重定向到指定目录：
- `settings.json`、`.credentials.json`、`sessions/`、`projects/` 全部隔离
- Cursor/Codex/Gemini 等 CLI 工具依赖 `$HOME`，设置不同 `HOME` 即可隔离

### Claude CLI 认证方式

每个用户需要独立完成 Claude CLI 认证，支持两种方式：

| 方式 | 操作 | 凭证存储位置 | 适用场景 |
|------|------|-------------|----------|
| **OAuth 登录** | 用户在终端执行 `claude login`，浏览器授权 | `$CLAUDE_CONFIG_DIR/.credentials.json` | 使用 Pro/Max/Teams/Enterprise 订阅 |
| **API Key** | 用户在终端执行 `export ANTHROPIC_API_KEY=sk-ant-xxx` 或管理员在用户配置中注入 | 环境变量（不落盘）或 `$CLAUDE_CONFIG_DIR/settings.json` | 使用 API 按量计费 |

认证优先级：`ANTHROPIC_API_KEY` 环境变量 > `settings.json` 中的 env 配置 > `.credentials.json` OAuth 令牌

**用户首次使用流程：**
```
1. 管理员创建用户 → 系统初始化用户目录
2. 用户登录 Web UI → 打开终端
3. 用户在终端中执行 claude login 或 export ANTHROPIC_API_KEY=xxx
4. 认证完成后即可正常使用 Claude CLI
5. 凭证保存在用户专属的 CLAUDE_CONFIG_DIR 中，后续自动生效
```

### 用户目录布局

```
/data/cloudcli/users/
├── 1/                              ← 用户 1 (admin) 的 HOME
│   ├── .claude/                    ← CLAUDE_CONFIG_DIR 指向此处
│   │   ├── .credentials.json      ← 该用户的 OAuth 令牌（claude login 生成）
│   │   ├── settings.json          ← 该用户的 Claude 配置（可含 ANTHROPIC_API_KEY）
│   │   ├── projects/              ← Claude 会话数据
│   │   └── sessions/              ← Claude 会话历史
│   ├── .cursor/chats/             ← Cursor 会话
│   ├── .codex/sessions/           ← Codex 会话
│   ├── .gemini/                   ← Gemini 会话
│   ├── .gitconfig                 ← 独立的 git 配置
│   └── workspace/                 ← 项目代码工作目录（所有项目必须在此目录内）
│       ├── project-a/
│       └── project-b/
├── 2/                              ← 用户 2 的 HOME
│   ├── .claude/
│   │   ├── .credentials.json      ← 用户 2 自己的凭证
│   │   └── ...
│   └── workspace/
│       └── my-project/
└── ...
```

### 工作目录限制

**所有用户的项目文件只能在各自的 `workspace/` 目录内创建和操作。** 具体约束：

- 用户的工作目录为 `/data/cloudcli/users/{userId}/workspace/`
- CLI 工具的 `cwd`（工作目录）必须在 workspace 内，服务端需做路径校验
- 文件浏览器只展示用户 workspace 目录下的内容
- Git 操作的项目路径必须在 workspace 内
- 防止用户通过路径遍历访问其他用户的目录或系统文件

```javascript
// 路径校验工具函数
function validateUserWorkspacePath(userDataDir, requestedPath) {
  const workspacePath = path.join(userDataDir, 'workspace');
  const resolvedPath = path.resolve(requestedPath);
  if (!resolvedPath.startsWith(workspacePath)) {
    throw new Error('Access denied: path outside user workspace');
  }
  return resolvedPath;
}
```

---

## Phase 1: 数据库 Schema 变更

**文件: `server/database/init.sql` + `server/database/db.js`**

### 1.1 users 表添加字段
```sql
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN data_dir TEXT;  -- 用户数据目录（如 /data/cloudcli/users/1）
```
- 迁移时将第一个用户（最小 id）设为 `role = 'admin'`
- `data_dir` 在管理员创建用户时自动生成

### 1.2 session_names 表添加 user_id
```sql
ALTER TABLE session_names ADD COLUMN user_id INTEGER REFERENCES users(id);
```
- 迁移时将现有行的 user_id 设为 admin 用户 id
- 唯一约束从 `UNIQUE(session_id, provider)` 改为 `UNIQUE(session_id, provider, user_id)`

### 1.3 db.js 新增方法
- `userDb`:
  - `getAllUsers()` — 列出所有用户（管理员用）
  - `createUserByAdmin(username, passwordHash, role, gitName, gitEmail)` — 管理员创建用户
  - `getUserRole(userId)` — 获取角色
  - `setUserRole(userId, role)` — 设置角色
  - `deactivateUser(userId)` — 停用用户（设 is_active = 0）
  - `deleteUser(userId)` — 删除用户
  - `updateUserDataDir(userId, dataDir)` — 设置数据目录
- `sessionNamesDb` 所有方法增加 `userId` 参数

---

## Phase 2: 用户环境管理层

**新文件: `server/services/user-env-manager.js`**

核心职责：为每个用户初始化数据目录、构建 spawn 环境变量、校验工作目录权限。

```javascript
import path from 'path';
import fs from 'fs';

// 可通过环境变量配置基础路径，默认 /data/cloudcli/users
const USERS_BASE_DIR = process.env.CLOUDCLI_USERS_DIR || '/data/cloudcli/users';

const userEnvManager = {

  // 管理员创建用户时调用：初始化目录结构
  initUserDataDir(userId) {
    const userDir = path.join(USERS_BASE_DIR, String(userId));
    const dirs = [
      userDir,
      path.join(userDir, '.claude'),
      path.join(userDir, 'workspace'),
    ];
    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return userDir;
  },

  // 获取用户数据目录
  getUserDataDir(userId) {
    return path.join(USERS_BASE_DIR, String(userId));
  },

  // 获取用户工作目录
  getUserWorkspaceDir(userId) {
    return path.join(USERS_BASE_DIR, String(userId), 'workspace');
  },

  // 校验路径是否在用户工作目录内（防止路径遍历）
  validateWorkspacePath(userId, requestedPath) {
    const workspacePath = this.getUserWorkspaceDir(userId);
    const resolvedPath = path.resolve(requestedPath);
    if (!resolvedPath.startsWith(workspacePath + path.sep) && resolvedPath !== workspacePath) {
      throw new Error('Access denied: path outside user workspace');
    }
    return resolvedPath;
  },

  // 核心方法：构建用户专属的环境变量
  buildUserEnv(user) {
    const userDir = path.join(USERS_BASE_DIR, String(user.id));
    return {
      ...process.env,
      // Claude CLI 隔离 —— 官方支持的环境变量
      CLAUDE_CONFIG_DIR: path.join(userDir, '.claude'),
      // 其他 CLI 工具隔离（Cursor/Codex/Gemini 均读 $HOME）
      HOME: userDir,
      // Git 身份隔离
      GIT_AUTHOR_NAME: user.gitName,
      GIT_AUTHOR_EMAIL: user.gitEmail,
      GIT_COMMITTER_NAME: user.gitName,
      GIT_COMMITTER_EMAIL: user.gitEmail,
      // 终端设置
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '3',
    };
  },

  // 删除用户时清理数据目录（可选，管理员确认后调用）
  removeUserDataDir(userId) {
    const userDir = path.join(USERS_BASE_DIR, String(userId));
    fs.rmSync(userDir, { recursive: true, force: true });
  },
};

export default userEnvManager;
```

### 2.1 关键改造：所有 spawn 调用注入用户环境变量

**文件: `server/index.js` — `handleShellConnection()`**

```javascript
// ===== 改造前 =====
shellProcess = pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols: termCols, rows: termRows,
    cwd: resolvedProjectPath,
    env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '3'
    }
});

// ===== 改造后 =====
// 1. 校验工作目录在用户 workspace 内
userEnvManager.validateWorkspacePath(req.user.id, resolvedProjectPath);
// 2. 注入用户环境变量
const userEnv = userEnvManager.buildUserEnv(req.user);
shellProcess = pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols: termCols, rows: termRows,
    cwd: resolvedProjectPath,
    env: userEnv
});
```

**文件: `server/cursor-cli.js`**
```javascript
// 改造前: spawn('cursor-agent', args, { cwd, env: { ...process.env } })
// 改造后: spawn('cursor-agent', args, { cwd, env: userEnvManager.buildUserEnv(user) })
```

**文件: `server/gemini-cli.js`** — 同上模式

**文件: `server/claude-sdk.js`** — 特殊处理：
- 当前使用 SDK 直接调用，需确认 SDK 是否尊重 `CLAUDE_CONFIG_DIR`
- **方案 A**：如果 SDK 支持通过 `process.env` 或 options 设置 config dir，则在调用前设置环境变量
- **方案 B**：改为通过 PTY spawn `claude` CLI（与其他 provider 统一模式），CLI 天然支持 `CLAUDE_CONFIG_DIR`
- 推荐**方案 B**——统一所有 provider 的执行模式，降低维护复杂度，且每个用户使用各自的 Claude 凭证

**文件: `server/routes/git.js`**
```javascript
// 改造前: spawn('git', args, { cwd: projectPath })
// 改造后:
// 1. 校验 projectPath 在用户 workspace 内
userEnvManager.validateWorkspacePath(user.id, projectPath);
// 2. 注入用户环境变量（含 GIT_AUTHOR_NAME/EMAIL）
spawn('git', args, { cwd: projectPath, env: userEnvManager.buildUserEnv(user) })
```

---

## Phase 3: 认证 & 中间件

**文件: `server/middleware/auth.js`**

### 3.1 新增 `requireAdmin` 中间件
```javascript
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};
```

### 3.2 `authenticateToken()` 附加 role 和用户完整信息
- 验证用户后从 DB 读取 role、gitName、gitEmail、data_dir
- 挂到 `req.user` 上，供后续 handler 使用

### 3.3 WebSocket 认证返回完整用户信息

**文件: `server/routes/auth.js`**

### 3.4 修改注册逻辑
- 无用户时：创建 admin 用户（保持现有 setup 流程）
- **移除**普通用户自行注册的能力——所有用户由管理员创建

### 3.5 更新 `/api/auth/status`
- 已有用户时不再返回注册入口，只返回登录入口

---

## Phase 4: 管理员 API

**新文件: `server/routes/admin.js`**

### 4.1 用户管理

| 端点 | 方法 | 描述 |
|------|------|------|
| `GET /api/admin/users` | GET | 列出所有用户（含 data_dir、角色、状态、Claude 认证状态） |
| `POST /api/admin/users` | POST | 创建新用户（username, password, role, gitName, gitEmail） |
| `PUT /api/admin/users/:id` | PUT | 编辑用户信息（gitName, gitEmail 等） |
| `PUT /api/admin/users/:id/role` | PUT | 更改用户角色（禁止移除最后一个 admin） |
| `PUT /api/admin/users/:id/deactivate` | PUT | 停用用户 |
| `PUT /api/admin/users/:id/password` | PUT | 重置用户密码 |
| `DELETE /api/admin/users/:id` | DELETE | 删除用户（同时清理数据目录） |

所有端点使用 `authenticateToken` + `requireAdmin` 中间件。

### 4.2 管理员创建用户的完整流程
```
1. POST /api/admin/users
   → 验证 username 唯一性
   → bcrypt 加密密码
   → 插入 users 表（role, git_name, git_email）
   → 调用 userEnvManager.initUserDataDir(userId) 创建目录结构：
     /data/cloudcli/users/{userId}/
     ├── .claude/          ← CLAUDE_CONFIG_DIR
     └── workspace/        ← 用户工作目录
   → 更新 users.data_dir
   → 返回用户信息

2. 用户使用 username + password 登录 Web UI
3. 用户打开终端，执行 Claude CLI 认证：
   - 方式 A（OAuth）: claude login → 浏览器授权 → 凭证存入 CLAUDE_CONFIG_DIR
   - 方式 B（API Key）: export ANTHROPIC_API_KEY=sk-ant-xxx
4. 认证完成后即可正常使用
5. 所有 spawn 调用自动注入该用户的环境变量
6. CLI 工具的会话数据写入用户专属目录，天然隔离
7. 所有项目操作限制在 workspace/ 目录内
```

---

## Phase 5: 现有 API 路由适配

**文件: `server/index.js`**

- 会话重命名传入 `req.user.id`
- `applyCustomSessionNames()` 接收 userId 参数
- WebSocket 广播改为按用户过滤——每个用户只收到自己目录下的会话变更
- 所有涉及文件路径的操作增加 `validateWorkspacePath()` 校验

**文件: `server/projects.js`**

- `getProjects()` 改为扫描用户专属目录而非 `os.homedir()`
- 核心改动：将所有 `os.homedir()` 替换为从 `req.user.data_dir` 获取
```javascript
// 改造前
const claudeProjectsPath = path.join(os.homedir(), '.claude', 'projects');
const cursorChatsPath = path.join(os.homedir(), '.cursor', 'chats');

// 改造后
const claudeProjectsPath = path.join(user.dataDir, '.claude', 'projects');
const cursorChatsPath = path.join(user.dataDir, '.cursor', 'chats');
```

- PROVIDER_WATCH_PATHS 改为动态生成（每个用户一组 watch path）
- 或：改为按需扫描（用户请求时读取），不再全局 watch
- 项目列表只展示 workspace 内的项目

**文件: `server/routes/user.js`**

- git config 存入 users 表的 git_name/git_email 字段（已有）
- 移除 `git config --global` 调用——改为通过环境变量注入，无需写文件

**文件: `server/routes/settings.js`**

- 已正确按 `req.user.id` 过滤，无需改动

**文件: `server/routes/cli-auth.js`**

- `checkClaudeCredentials()` 改为读取用户专属的 `CLAUDE_CONFIG_DIR` 目录：
```javascript
// 改造前
const credPath = path.join(os.homedir(), '.claude', '.credentials.json');

// 改造后
const credPath = path.join(user.dataDir, '.claude', '.credentials.json');
```
- 管理员 users 列表可显示每个用户的 Claude 认证状态（已认证/未认证）

---

## Phase 6: 前端变更

### 6.1 类型 & Context
- `src/components/auth/types.ts`: AuthUser 添加 `role: 'admin' | 'user'`
- `src/components/auth/context/AuthContext.tsx`: 透传 role，供组件条件渲染

### 6.2 登录流程
- `src/components/auth/view/SetupForm.tsx`: 保持不变（首个 admin 注册）
- `src/components/auth/view/LoginForm.tsx`: 移除 "注册" 入口（用户由管理员创建）
- 用户首次登录后若 Claude 未认证，终端区域显示引导提示：
  ```
  ⚠️ Claude CLI 尚未认证。请在终端中执行以下命令之一：
  • claude login          （使用 Claude 账号 OAuth 登录）
  • export ANTHROPIC_API_KEY=your-key  （使用 API Key）
  ```

### 6.3 API Client
- `src/utils/api.js`: 新增 `api.admin.*` 系列方法

### 6.4 管理员 UI
- **新文件: `src/components/settings/view/tabs/UserManagementTab.tsx`**
  - 用户列表表格：用户名、角色、Git 身份、Claude 认证状态、最后登录
  - 创建用户对话框：用户名、密码、角色、Git Name、Git Email
  - 操作按钮：编辑、重置密码、停用、删除（带确认）
- Settings 侧栏/Tab 仅在 `role === 'admin'` 时显示 "用户管理" Tab

### 6.5 用户个人设置
- 允许用户修改自己的密码
- 允许用户查看自己的 Git Name/Email（由管理员设定）
- 显示当前 Claude CLI 认证状态和方式（OAuth / API Key / 未认证）

---

## Phase 7: 实施顺序

```
1. 数据库迁移              → init.sql + db.js migration code（role, data_dir 字段）
2. 用户环境管理服务         → server/services/user-env-manager.js（含路径校验）
3. 认证中间件              → requireAdmin + role 附加 + 完整用户信息
4. 管理员 API              → server/routes/admin.js（用户 CRUD）
5. CLI 执行层改造          → 所有 spawn/pty.spawn 注入 userEnv + 路径校验
6. 会话发现改造            → projects.js 按用户目录扫描
7. CLI 认证状态检查         → cli-auth.js 按用户目录读取凭证
8. session_names 用户隔离   → 所有查询加 userId
9. 前端认证更新            → 类型、context、登录流程、认证引导
10. 前端管理员 UI           → UserManagementTab
11. 端到端测试
```

---

## 已知挑战

| 问题 | 方案 |
|------|------|
| 现有 session_names 数据迁移 | 迁移时赋值给 admin 用户 |
| admin 用户自身的 session 迁移 | 首次升级时将 `os.homedir()/.claude` 下的数据复制或软链接到 admin 的 data_dir |
| Claude SDK vs CLI | 推荐改为统一使用 CLI 模式（`claude` 命令），每个用户使用各自的凭证 |
| WebSocket 广播改为用户级 | 维护 userId → WebSocket 连接的映射，广播时按用户过滤 |
| 文件 watcher 改造 | 从全局单一 watcher 改为 per-user watcher（或按需扫描） |
| git config 不再写 global | 全部通过 `GIT_AUTHOR_NAME` 等环境变量注入，spawn 时自动携带 |
| Token refresh 需包含最新 role | refresh 时从 DB 读取当前 role |
| 用户数据目录权限 | 服务端进程需要对 `/data/cloudcli/users/` 有读写权限 |
| 用户 Claude 认证 | 每个用户独立认证（claude login 或 API Key），凭证存在各自 CLAUDE_CONFIG_DIR |
| 路径遍历攻击 | 所有文件/项目操作需经过 validateWorkspacePath 校验 |
| 无安全隔离 | 此方案为功能隔离（非安全隔离），适用于可信团队。如需安全隔离可升级为 bwrap 或 Docker |

---

## 涉及文件变更清单

```
server/
├── services/
│   └── user-env-manager.js         # 新增：用户环境变量构建 + 目录初始化 + 路径校验
├── routes/
│   └── admin.js                    # 新增：管理员 API（用户 CRUD）
├── database/
│   ├── init.sql                    # 修改：users 加 role/data_dir，session_names 加 user_id
│   └── db.js                       # 修改：新增 userDb 方法、sessionNamesDb 加 userId
├── middleware/
│   └── auth.js                     # 修改：requireAdmin + 附加完整用户信息
├── index.js                        # 修改：spawn 注入 userEnv + 路径校验，WebSocket 按用户过滤
├── cursor-cli.js                   # 修改：spawn env 改为 userEnv
├── gemini-cli.js                   # 修改：spawn env 改为 userEnv
├── claude-sdk.js                   # 修改：改为 CLI 模式 或 注入 CLAUDE_CONFIG_DIR
├── projects.js                     # 修改：os.homedir() → user.dataDir，项目限制在 workspace 内
└── routes/
    ├── auth.js                     # 修改：移除用户自注册
    ├── user.js                     # 修改：移除 git config --global
    ├── git.js                      # 修改：spawn env 改为 userEnv + 路径校验
    └── cli-auth.js                 # 修改：按用户目录读取 Claude 凭证状态

src/
├── components/
│   ├── auth/types.ts               # 修改：AuthUser + role
│   ├── auth/context/AuthContext.tsx # 修改：透传 role
│   ├── auth/view/LoginForm.tsx     # 修改：移除注册入口
│   └── settings/view/tabs/
│       └── UserManagementTab.tsx   # 新增：管理员用户管理 UI
└── utils/api.js                    # 修改：新增 api.admin.* 方法
```

---

## 验证方式

1. 启动应用，第一个注册用户自动成为 admin
2. Admin 在用户管理界面创建用户 B（设置用户名、密码、Git 身份）
3. 验证 `/data/cloudcli/users/{userId}/` 目录结构已创建（含 .claude/ 和 workspace/）
4. 用户 B 使用用户名 + 密码登录
5. 用户 B 看到 Claude 未认证的引导提示
6. 用户 B 在终端执行 `claude login`，完成认证
7. 验证凭证写入 `/data/cloudcli/users/{userId}/.claude/.credentials.json`
8. 用户 B 打开终端，执行 `echo $HOME` 和 `echo $CLAUDE_CONFIG_DIR`，确认指向专属目录
9. 用户 B 在 workspace 内创建项目，验证数据写入正确目录
10. 用户 B 尝试访问 workspace 外的路径，验证被拒绝
11. 用户 B 创建 Claude session，验证 session 数据在专属目录中
12. Admin 登录，确认看不到用户 B 的 session（隔离验证）
13. 用户 B 执行 `git commit`，验证 author 为管理员设定的 Git 身份
14. Admin 停用用户 B，用户 B 无法登录
15. 非 admin 用户访问 `/api/admin/*` 端点返回 403
