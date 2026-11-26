#!/bin/sh
# Removes what ./install.sh added: the symlinks that point into this clone, the grill Stop hook
# and CLAUDE_CODE_STOP_HOOK_BLOCK_CAP (only if it is still "200"). Safe to run again.
set -eu

repo=$(cd "$(dirname "$0")" && pwd -P)
config=${CLAUDE_CONFIG_DIR:-$HOME/.claude}
if [ -d "$config" ]; then config=$(cd "$config" && pwd); fi

# unlink <target>: removes <target> if it is a symlink into this clone.
unlink_ours() {
  if [ -L "$1" ]; then
    case "$(readlink "$1")" in
      "$repo"/*)
        rm "$1"
        echo "removed  $1"
        return
        ;;
    esac
    echo "kept     $1 (points to $(readlink "$1"), not into $repo)"
  elif [ -e "$1" ]; then
    echo "kept     $1 (not a symlink)"
  fi
}

unlink_ours "$config/grill"
unlink_ours "$config/skills/grill"
unlink_ours "$HOME/.local/bin/grill"

if command -v bun >/dev/null 2>&1; then
  bun "$repo/scripts/settings.ts" uninstall "$config/settings.json"
else
  echo "warning: bun is not installed, so $config/settings.json was not changed. Remove the Stop hook"
  echo "that runs .../grill/hook.sh and, if you like, env.CLAUDE_CODE_STOP_HOOK_BLOCK_CAP by hand."
fi

echo
echo "grill is uninstalled. Restart Claude Code to unload the hook."
echo "The grilling skill was left in place; to remove it too: npx skills remove grilling -g -a claude-code -y"
