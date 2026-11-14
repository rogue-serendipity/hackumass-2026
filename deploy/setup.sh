#!/usr/bin/env bash
# One-shot setup of a fresh Ubuntu 24.04 server: backend, frontend, and Caddy in front.
# Run as root on the server, after copying backend/.env to /root/tribunal.env:
#
#   scp backend/.env root@<ip>:/root/tribunal.env
#   ssh root@<ip> 'bash -s' < deploy/setup.sh
#
# Optional env vars:  DEMO_PASSWORD=...  (password-protect the site, user "demo")
#                     SITE=":80"         (plain HTTP instead of HTTPS via sslip.io)
set -euo pipefail

REPO_URL="https://github.com/rogue-serendipity/hackumass-2026.git"
APP=/opt/tribunal
RUN_USER=tribunal

[[ -f /root/tribunal.env ]] || { echo "Copy backend/.env to /root/tribunal.env first (see top of this file)." >&2; exit 1; }

echo "==> Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q git curl python3-venv python3-pip debian-keyring debian-archive-keyring apt-transport-https gnupg
if ! command -v node >/dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -y -q caddy
fi

echo "==> App user and code"
id "$RUN_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$RUN_USER"
if [[ -d $APP/.git ]]; then git -C "$APP" pull --ff-only; else git clone "$REPO_URL" "$APP"; fi
install -m 600 -o "$RUN_USER" /root/tribunal.env "$APP/backend/.env"
chown -R "$RUN_USER:$RUN_USER" "$APP"

echo "==> Backend"
sudo -u "$RUN_USER" python3 -m venv "$APP/backend/.venv"
sudo -u "$RUN_USER" "$APP/backend/.venv/bin/pip" install -q -r "$APP/backend/requirements.txt"

echo "==> Frontend (build)"
sudo -u "$RUN_USER" bash -c "cd $APP/frontend && npm ci --no-audit --no-fund && NEXT_PUBLIC_API_BASE=/api npm run build"

echo "==> Services"
cat > /etc/systemd/system/tribunal-backend.service <<EOF
[Unit]
Description=Shadow Tribunal API
After=network.target

[Service]
User=$RUN_USER
WorkingDirectory=$APP/backend
ExecStart=$APP/backend/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/tribunal-frontend.service <<EOF
[Unit]
Description=Shadow Tribunal UI
After=network.target

[Service]
User=$RUN_USER
WorkingDirectory=$APP/frontend
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start -- --hostname 127.0.0.1 --port 3000
Restart=always

[Install]
WantedBy=multi-user.target
EOF

echo "==> Caddy"
IP=$(curl -fsS -4 https://ifconfig.me)
SITE="${SITE:-$IP.sslip.io}"
install -m 644 "$APP/deploy/Caddyfile" /etc/caddy/Caddyfile
mkdir -p /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironment=SITE=%s\n' "$SITE" > /etc/systemd/system/caddy.service.d/site.conf
: > /etc/caddy/auth.caddy   # empty unless a password is set
if [[ -n "${DEMO_PASSWORD:-}" ]]; then
  printf 'basic_auth {\n\tdemo %s\n}\n' "$(caddy hash-password --plaintext "$DEMO_PASSWORD")" > /etc/caddy/auth.caddy
fi

if command -v ufw >/dev/null; then ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; fi

systemctl daemon-reload
systemctl enable --now tribunal-backend tribunal-frontend
systemctl restart tribunal-backend tribunal-frontend caddy

echo "==> Checking"
for i in $(seq 30); do curl -fsS http://127.0.0.1:8000/scenarios >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:8000/scenarios >/dev/null && echo "API: ok" || echo "API: NOT responding (journalctl -u tribunal-backend)"
for i in $(seq 30); do curl -fsS http://127.0.0.1:3000 >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:3000 >/dev/null && echo "UI:  ok" || echo "UI:  NOT responding (journalctl -u tribunal-frontend)"
case "$SITE" in
  :*) echo "Live at http://$IP" ;;
  *)  echo "Live at https://$SITE  (the certificate can take a minute on first visit)" ;;
esac
