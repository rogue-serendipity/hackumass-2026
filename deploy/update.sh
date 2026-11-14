#!/usr/bin/env bash
# Pull the latest main onto the server, rebuild, and restart. Run as root on the server:
#   ssh root@<ip> 'bash -s' < deploy/update.sh
set -euo pipefail
APP=/opt/tribunal
RUN_USER=tribunal

sudo -u "$RUN_USER" git -C "$APP" pull --ff-only
sudo -u "$RUN_USER" "$APP/backend/.venv/bin/pip" install -q -r "$APP/backend/requirements.txt"
sudo -u "$RUN_USER" bash -c "cd $APP/frontend && npm ci --no-audit --no-fund && NEXT_PUBLIC_API_BASE=/api npm run build"
install -m 644 "$APP/deploy/Caddyfile" /etc/caddy/Caddyfile
systemctl restart tribunal-backend tribunal-frontend caddy
echo "Updated to $(git -C "$APP" log --oneline -1)"
