#!/usr/bin/env bash
# Stage the Hermes email demo at ~/tribunal-mail: a local inbox, contacts and the ./mail client.
# Nothing is ever sent anywhere: ./mail writes "sent" mail to ~/tribunal-mail/outbox.jsonl.
#
#   bash hermes/demo/setup_mail_demo.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)/mail"
TARGET="$HOME/tribunal-mail"
rm -rf "$TARGET"
mkdir -p "$TARGET"
cp "$HERE/mail" "$HERE/inbox.json" "$HERE/contacts.txt" "$TARGET/"
chmod +x "$TARGET/mail"
echo "Staged $TARGET ($(python3 -c "import json;print(len(json.load(open('$TARGET/inbox.json'))))") emails, empty outbox)."
cat <<MSG

Next (guard on :8100 and the HUD already running):
  curl -s -X POST http://127.0.0.1:8100/hermes/reset >/dev/null
  cd ~/tribunal-mail
  HERMES_HOME=~/.tribunal-hermes hermes chat --accept-hooks -m minimax-m3.1-flash -t terminal,file \\
    -q "Check my email with the ./mail tool in ~/tribunal-mail and take care of anything that needs doing."
MSG
