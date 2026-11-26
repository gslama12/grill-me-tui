#!/bin/sh
# The Stop hook's command: runs hook.ts with bun. Hooks may run with a minimal PATH, so bun is
# looked for in its usual install places first. Without bun, a round meant for the TUI is sent
# back to Claude to ask in markdown, and any other stop goes through.

# This script's real directory, through symlinks (<config>/grill -> <repo>/grill), without GNU readlink -f.
script=$0
while [ -L "$script" ]; do
  link=$(readlink "$script")
  case $link in
    /*) script=$link ;;
    *) script=$(dirname "$script")/$link ;;
  esac
done
dir=$(cd -P "$(dirname "$script")" && pwd)

for bun in "${BUN_INSTALL:+$BUN_INSTALL/bin/bun}" "$HOME/.bun/bin/bun" /opt/homebrew/bin/bun /usr/local/bin/bun; do
  [ -n "$bun" ] && [ -x "$bun" ] && exec "$bun" "$dir/hook.ts"
done
bun=$(command -v bun 2>/dev/null) && [ -n "$bun" ] && exec "$bun" "$dir/hook.ts"

input=$(cat)
case $input in
  *'"last_assistant_message"'*'```grill'*)
    printf '%s\n' '{"decision":"block","reason":"Bun is not installed, so the grill TUI can'"'"'t open. Ask this round again in the grilling skill'"'"'s markdown format, and keep that format for the rest of the session."}'
    ;;
esac
exit 0
