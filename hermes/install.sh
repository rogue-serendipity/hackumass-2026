#!/usr/bin/env bash
# Register the Shadow Agent Tribunal hooks with Hermes Agent.
#
#   bash hermes/install.sh              # sandbox (default): a separate Hermes home at ~/.tribunal-hermes,
#                                       # copied from ~/.hermes, so your normal Hermes setup is untouched
#   bash hermes/install.sh --user       # add the hooks to ~/.hermes/config.yaml itself (backed up first)
#   bash hermes/install.sh --uninstall  # remove the hooks block again (add --user for ~/.hermes)
#
# Re-running is safe: the previous Tribunal block is replaced, not duplicated.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$HERE/hooks/tribunal_hook.py"
SOURCE_HOME="$HOME/.hermes"
TARGET="${TRIBUNAL_HERMES_HOME:-$HOME/.tribunal-hermes}"
MODE=sandbox
UNINSTALL=0
for arg in "$@"; do
  case "$arg" in
    --user) MODE=user; TARGET="$SOURCE_HOME" ;;
    --uninstall) UNINSTALL=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

BEGIN="# >>> shadow-agent-tribunal hooks >>>"
END="# <<< shadow-agent-tribunal hooks <<<"
CONFIG="$TARGET/config.yaml"

strip_block() {  # remove a previous Tribunal block from $CONFIG
  [ -f "$CONFIG" ] || return 0
  awk -v b="$BEGIN" -v e="$END" '$0==b{skip=1;next} $0==e{skip=0;next} !skip' "$CONFIG" > "$CONFIG.tmp"
  mv "$CONFIG.tmp" "$CONFIG"
  chmod 600 "$CONFIG"
}

if [ "$UNINSTALL" = 1 ]; then
  strip_block
  echo "Removed the Tribunal hooks from $CONFIG"
  exit 0
fi

[ -f "$SOURCE_HOME/config.yaml" ] || { echo "No Hermes config at $SOURCE_HOME/config.yaml. Run 'hermes setup' first." >&2; exit 1; }
chmod +x "$HOOK"

if [ "$MODE" = sandbox ]; then
  mkdir -p "$TARGET"
  chmod 700 "$TARGET"
  # Model, provider and keys come from your normal Hermes setup. Copies stay private to you (chmod 600).
  cp "$SOURCE_HOME/config.yaml" "$CONFIG"
  [ -f "$SOURCE_HOME/.env" ] && cp "$SOURCE_HOME/.env" "$TARGET/.env" && chmod 600 "$TARGET/.env"
  chmod 600 "$CONFIG"
else
  cp "$CONFIG" "$CONFIG.bak.tribunal.$(date +%Y%m%d_%H%M%S)"
fi
strip_block

if grep -qE '^(hooks|hooks_auto_accept):' "$CONFIG"; then
  echo "$CONFIG already has its own 'hooks:' section. Merge these hooks into it by hand:" >&2
  echo "  pre_llm_call, post_tool_call, pre_tool_call -> $HOOK" >&2
  exit 1
fi

# Single-quoted YAML keeps the backslash that escapes spaces for Hermes's shlex.split().
CMD="${HOOK// /\\ }"
cat >> "$CONFIG" <<EOF

$BEGIN
hooks_auto_accept: true
hooks:
  pre_llm_call:
    - command: '$CMD'
      timeout: 10
  post_tool_call:
    - command: '$CMD'
      timeout: 10
  pre_tool_call:
    - command: '$CMD'
      matcher: '^(terminal|execute_code|write_file|patch|send_message|browser_type|browser_click)$'
      timeout: 60
$END
EOF

PREFIX=""
[ "$MODE" = sandbox ] && PREFIX="HERMES_HOME=$TARGET "
echo "Tribunal hooks installed in $CONFIG"
echo
echo "1. Start the guard:  cd hermes/guard && ../../backend/.venv/bin/uvicorn server:app --port 8100"
echo "2. Run Hermes:       ${PREFIX}hermes --accept-hooks -m minimax-m3.1-flash -t terminal,file -z \"<task>\""
echo "3. Check the hooks:  ${PREFIX}hermes hooks list"
