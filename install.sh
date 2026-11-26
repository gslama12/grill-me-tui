#!/bin/sh
# Installs /grill from this clone: symlinks the hook, TUI and skill into the Claude Code config
# dir (${CLAUDE_CONFIG_DIR:-~/.claude}) and adds the Stop hook to its settings.json.
# Safe to run again, e.g. after moving the clone. Undo with ./uninstall.sh.
set -eu

repo=$(cd "$(dirname "$0")" && pwd -P)
config=${CLAUDE_CONFIG_DIR:-$HOME/.claude}
bin=$HOME/.local/bin
stamp=$(date +%Y%m%d-%H%M%S)

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is not installed (grill runs on Bun). Install it, then run ./install.sh again:" >&2
  echo "  brew install oven-sh/bun/bun" >&2
  echo "  or: curl -fsSL https://bun.sh/install | bash" >&2
  echo "  (see https://bun.sh)" >&2
  exit 1
fi
mkdir -p "$config"
config=$(cd "$config" && pwd)

# link <target> <source>: makes <target> a symlink to <source>, moving anything else there aside.
link() {
  if [ -L "$1" ] && [ "$(readlink "$1")" = "$2" ]; then
    echo "ok       $1"
    return
  fi
  mkdir -p "$(dirname "$1")"
  if [ -e "$1" ] || [ -L "$1" ]; then
    mv "$1" "$1.bak.$stamp"
    echo "moved    $1 -> $1.bak.$stamp"
  fi
  ln -s "$2" "$1"
  echo "linked   $1 -> $2"
}

# Settings first: if settings.json is invalid JSON, nothing else is touched.
bun "$repo/scripts/settings.ts" install "$config/settings.json" "$config/grill/hook.sh"
link "$config/grill" "$repo/grill"
link "$config/skills/grill" "$repo/skills/grill"
link "$bin/grill" "$repo/grill/tui.ts"

warned=
if [ ! -f "$config/skills/grilling/SKILL.md" ] && [ ! -f "$HOME/.agents/skills/grilling/SKILL.md" ]; then
  echo
  echo "warning: the grilling skill, which /grill builds on, is not installed. Install it with:"
  echo "  npx skills add mattpocock/skills --skill grilling -g -a claude-code -y"
  warned=1
fi
case ":$PATH:" in
  *":$bin:"*) ;;
  *)
    echo
    echo "warning: $bin is not on your PATH, so the 'grill' command won't be found. Add this line"
    echo "to your shell profile (~/.zshrc, ~/.bashrc, ...) and open a new terminal:"
    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    warned=1
    ;;
esac

echo
echo "grill is installed${warned:+ (see the warnings above)}. Next steps:"
echo "  1. Restart Claude Code, or start a new session, so it loads the hook and the skill."
echo "  2. Type /grill followed by the plan or design you want to be grilled on."
