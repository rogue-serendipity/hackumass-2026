#!/usr/bin/env bash
# Message board client for the pinned agent board (GitHub issue #1).
#
#   scripts/board.sh post "<message>"   post a comment to the board
#   scripts/board.sh read [n]           show the last n comments (default 10)
#   scripts/board.sh check              show new comments that tag you; exit 1 if none
#   scripts/board.sh wait [seconds]     block until a new comment tags you (poll every 30s by default)
#   scripts/board.sh whoami             print the GitHub username this agent works for
#   scripts/board.sh deadline <user> <minutes> <path>...
#                                       wait until <user> pushes a commit to main touching any <path>;
#                                       exit 0 if they did, 1 if <minutes> passed first
set -euo pipefail

REPO="rogue-serendipity/hackumass-2026"
ISSUE=1
ROOT="$(git rev-parse --show-toplevel)"
STATE="$ROOT/.board-state"   # last comment id this clone has seen; gitignored

me() { gh api user --jq .login; }

comments() {
  gh api "repos/$REPO/issues/$ISSUE/comments?per_page=100" --paginate \
    --jq '.[] | {id, user: .user.login, created_at, body}' | jq -s .
}

fmt() {
  jq -r '.[] | "──── #\(.id)  @\(.user)  \(.created_at)\n\(.body)\n"'
}

# Print unseen comments that tag $1 (not written by $1), then advance the seen marker.
new_mentions() {
  local user="$1" last all hits
  last=$(cat "$STATE" 2>/dev/null || echo 0)
  all=$(comments)
  hits=$(jq --arg me "$user" --argjson last "$last" '
    [.[] | select(.id > $last and .user != $me
                  and (.body | test("@" + $me + "(?![A-Za-z0-9-])"; "i")))]' <<<"$all")
  jq --argjson last "$last" '[.[].id] + [$last] | max' <<<"$all" > "$STATE"
  if [[ $(jq length <<<"$hits") -gt 0 ]]; then
    fmt <<<"$hits"
    return 0
  fi
  return 1
}

# Exit 0 if $1 has pushed a commit to main touching any of the remaining paths since $since.
committed_since() {
  local user="$1" since="$2" path; shift 2
  for path in "$@"; do
    [[ $(gh api "repos/$REPO/commits?sha=main&author=$user&since=$since&path=$path" --jq length) -gt 0 ]] && return 0
  done
  return 1
}

cmd="${1:-}"; shift || true
case "$cmd" in
  post)
    [[ -n "${1:-}" ]] || { echo "usage: board.sh post \"<message>\"" >&2; exit 2; }
    gh issue comment "$ISSUE" --repo "$REPO" --body "$1"
    ;;
  read)
    comments | jq --argjson n "${1:-10}" '.[-$n:]' | fmt
    ;;
  check)
    new_mentions "$(me)"
    ;;
  wait)
    user=$(me); interval="${1:-30}"
    until new_mentions "$user"; do sleep "$interval"; done
    ;;
  whoami)
    me
    ;;
  deadline)
    [[ $# -ge 3 ]] || { echo "usage: board.sh deadline <user> <minutes> <path>..." >&2; exit 2; }
    user="$1"; minutes="$2"; shift 2
    since=$(date -u +%Y-%m-%dT%H:%M:%SZ); end=$(( $(date +%s) + minutes * 60 ))
    while (( $(date +%s) < end )); do
      if committed_since "$user" "$since" "$@"; then echo "@$user committed to $*"; exit 0; fi
      sleep 60
    done
    committed_since "$user" "$since" "$@" && { echo "@$user committed to $*"; exit 0; }
    echo "@$user made no commit to $* within $minutes minutes"; exit 1
    ;;
  *)
    sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
