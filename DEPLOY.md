# Deployment Guide

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- **Git**
- **ssh-keygen** (for auto SSH key generation, usually pre-installed on Linux/macOS)
- **Claude CLI** installed globally (`npm install -g @anthropic-ai/claude-code`)

## Quick Start

```bash
# 1. Clone the repository
git clone git@github.com:renguanggh/claudecodeui.git
cd claudecodeui

# 2. Install dependencies
npm install

# 3. Build the frontend
npm run build

# 4. Start the server (production mode)
npm run server
```

The server starts at `http://0.0.0.0:3001` by default.

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| **Server** | | |
| `SERVER_PORT` | `3001` | Backend API server port |
| `VITE_PORT` | `5173` | Frontend dev server port (dev mode only) |
| `HOST` | `0.0.0.0` | Bind address (`127.0.0.1` for localhost only) |
| `NODE_ENV` | — | Set to `production` for production deployments |
| **Database** | | |
| `DATABASE_PATH` | `~/.cloudcli/auth.db` | SQLite database file path |
| **Multi-user** | | |
| `CLOUDCLI_USERS_DIR` | `/data/cloudcli/users` | Multi-user data directory root |
| `WORKSPACES_ROOT` | `$HOME` | Fallback workspace root (single-user mode) |
| **Claude** | | |
| `CLAUDE_CLI_PATH` | `claude` | Custom Claude CLI binary path |
| `CONTEXT_WINDOW` | `160000` | Claude Code context window size |
| `ANTHROPIC_API_KEY` | — | Anthropic API key (global fallback, per-user config preferred) |
| `CLAUDE_TOOL_APPROVAL_TIMEOUT_MS` | `55000` | Timeout for tool approval prompts (ms) |
| **Other AI Providers** | | |
| `OPENAI_API_KEY` | — | OpenAI API key (for Codex provider) |
| `GEMINI_API_KEY` | — | Google Gemini API key |
| `GEMINI_PATH` | `gemini` | Custom Gemini CLI binary path |
| **Security** | | |
| `JWT_SECRET` | auto-generated | JWT signing secret (auto-created on first run) |
| `API_KEY` | — | Optional API key for programmatic access |

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run server` | Start production server (serves built frontend) |
| `npm run dev` | Start dev mode (backend + Vite HMR frontend) |
| `npm run build` | Build frontend for production |
| `npm start` | Build + start server |
| `npm run client` | Start Vite dev server only |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint on frontend code |

## Multi-User Setup

### Directory Structure

When multi-user mode is active, each user gets an isolated directory:

```
/data/cloudcli/users/
├── 1/                          # User 1 (admin)
│   ├── .claude/                # Claude CLI config & sessions
│   ├── .ssh/                   # SSH keys (auto-generated)
│   │   ├── id_ed25519          # Private key
│   │   └── id_ed25519.pub      # Public key
│   ├── projects/               # Project source code
│   └── workspace/              # CLI workspace
├── 2/                          # User 2
│   ├── .claude/
│   ├── .ssh/
│   ├── projects/
│   └── workspace/
└── ...
```

### First-Time Setup

1. Start the server and visit `http://<host>:3001`
2. Register the first user — this account becomes the **admin**
3. Admin can create additional users via **Settings > Users**
4. Each user logs in and configures Claude CLI authentication:
   - Open the terminal in the UI
   - Run `claude login` (OAuth) or `export ANTHROPIC_API_KEY=sk-ant-xxx` (API Key)

### SSH Key Management

- SSH keys are auto-generated (ed25519) when a user is created
- Users can view and copy their public key in **Settings > Git**
- Add the public key to GitHub/GitLab to enable SSH clone/push/pull
- `StrictHostKeyChecking=accept-new` is set automatically — first-time connections are accepted without manual confirmation

### User Isolation

- Each user's projects are stored in their own `projects/` directory
- Users cannot access other users' files or sessions
- Git identity (`GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`) is injected per-user
- Claude CLI config (`CLAUDE_CONFIG_DIR`) is isolated per-user

## Production Deployment

### Using systemd

Create `/etc/systemd/system/claudecodeui.service`:

```ini
[Unit]
Description=Claude Code UI
After=network.target

[Service]
Type=simple
User=cloudcli
WorkingDirectory=/opt/claudecodeui
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=SERVER_PORT=3001
Environment=DATABASE_PATH=/data/cloudcli/auth.db
Environment=CLOUDCLI_USERS_DIR=/data/cloudcli/users

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable claudecodeui
sudo systemctl start claudecodeui
sudo journalctl -u claudecodeui -f   # View logs
```

### Using PM2

```bash
npm install -g pm2

# Start
pm2 start server/index.js --name claudecodeui

# Auto-start on reboot
pm2 startup
pm2 save

# View logs
pm2 logs claudecodeui
```

### Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;  # WebSocket long connections
    }
}
```

## Troubleshooting

### Common Issues

**Port already in use:**
```bash
lsof -i :3001          # Find process using the port
kill -9 <PID>          # Kill it
```

**Database locked:**
The SQLite database only supports one writer at a time. Ensure no other instance is running.

**Permission denied on user data directory:**
```bash
sudo mkdir -p /data/cloudcli/users
sudo chown -R $(whoami) /data/cloudcli
```

**SSH clone fails:**
- Verify the user's SSH public key is added to the Git hosting provider
- Check key permissions: private key should be `600`, `.ssh` directory should be `700`
