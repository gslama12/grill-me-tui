#!/bin/sh
# Tests for the Stop hook (grill/hook.sh -> grill/hook.ts): feeds it fake Stop input and checks
# what it prints. Run from anywhere with `sh tests/hook.test.sh`. Needs bun; opens no terminal
# split (the terminal variables are removed, so the hook falls back to the markdown format).

repo=$(cd -P "$(dirname "$0")/.." && pwd)
hook=$repo/grill/hook.sh
tmp=$(mktemp -d "${TMPDIR:-/tmp}/grill-hook-test.XXXXXX")
pass=0
fail=0
ids=

cleanup() {
  for id in $ids; do rm -f "/tmp/claude-grill/$id.sock"; done
  rm -rf "$tmp"
}
trap cleanup EXIT INT TERM

# A hook run like Claude Code's, but with no terminal to open a split in.
no_terminal() {
  env -u HERDR_ENV -u HERDR_PANE_ID -u TMUX -u TMUX_PANE -u ZELLIJ -u WEZTERM_PANE -u KITTY_WINDOW_ID \
    -u ITERM_SESSION_ID TERM_PROGRAM=none "$@"
}

# check <name> <expected stdout> <actual stdout> <exit code>
check() {
  if [ "$3" = "$2" ] && [ "$4" = 0 ]; then
    pass=$((pass + 1))
    echo "ok   $1"
  else
    fail=$((fail + 1))
    echo "FAIL $1"
    echo "     expected (exit 0): $2"
    echo "     got (exit $4): $3"
  fi
}

# json_string <text>: <text> as a JSON string literal.
json_string() {
  printf '%s' "$1" | bun -e 'process.stdout.write(JSON.stringify(await Bun.stdin.text()))'
}

# input <session> <transcript> <message>: the Stop hook's stdin.
input() {
  printf '{"session_id":"%s","transcript_path":"%s","last_assistant_message":%s}' "$1" "$2" "$(json_string "$3")"
}

# A unique session id per case, so no running TUI is reused.
new_id() {
  id=grilltest-$$-$1
  ids="$ids $id"
  rm -f "/tmp/claude-grill/$id.sock"
}

block() {
  printf '{"decision":"block","reason":%s}' "$(json_string "$1")"
}

# Transcripts.
printf '%s\n' '{"type":"user","message":{"role":"user","content":"plan the cache"}}' >"$tmp/plain.jsonl"
printf '%s\n' '{"type":"user","message":{"role":"user","content":"<command-message>grill</command-message>\n<command-name>/grill</command-name>\n<command-args>the cache</command-args>"}}' >"$tmp/command.jsonl"
{
  printf '%s\n' '{"type":"user","message":{"role":"user","content":"plan the cache, then /grill"}}'
  printf '%s\n' '{"type":"attachment","attachment":{"type":"skill_mention","skillName":"grill"}}'
} >"$tmp/mention.jsonl"
printf '%s\n' '{"type":"attachment","attachment":{"type":"skill_mention","skillName":"grilling"}}' >"$tmp/other-mention.jsonl"

round='```grill
{"round":1,"questions":[{"title":"Storage","body":"Where do sessions live?","recommendation":"SQLite","alternatives":["Redis"]}]}
```'
message="Round 1.

$round"

not_typed="The user didn't type /grill in this session, so the grill TUI stays closed. Ask this round again in the grilling skill's markdown format, and don't write grill blocks in this session."
no_tui="No grill TUI could open (it opens in a split in herdr, tmux, Zellij, WezTerm, kitty or iTerm2, and no \`grill\` is running in another terminal). Ask this round again in the grilling skill's markdown format, and keep that format for the rest of the session."
no_bun="Bun is not installed, so the grill TUI can't open. Ask this round again in the grilling skill's markdown format, and keep that format for the rest of the session."

if [ -S /tmp/claude-grill/any.sock ]; then
  echo "A manually started grill (/tmp/claude-grill/any.sock) is running: quit it first, the hook would use it." >&2
  exit 1
fi

new_id plain
out=$(input "$id" "$tmp/command.jsonl" "All done, no questions." | no_terminal "$hook"); code=$?
check "no grill block: exits 0, no output" "" "$out" $code

new_id invalid
out=$(input "$id" "$tmp/command.jsonl" 'x
```grill
{"questions": [oops]}
```' | no_terminal "$hook"); code=$?
# The parser's own message varies with the bun version: only the text around it is checked.
case $out in
  '{"decision":"block","reason":"The grill block is not valid JSON ('?*'). Write the round again."}') got=ok ;;
  *) got=$out ;;
esac
check "invalid JSON in grill block" ok "$got" $code

new_id empty
out=$(input "$id" "$tmp/command.jsonl" 'x
```grill
{"round":1,"questions":[]}
```' | no_terminal "$hook"); code=$?
check "empty questions" "$(block 'The grill block needs a non-empty "questions" array. Write the round again.')" "$out" $code

new_id missing
out=$(input "$id" "$tmp/command.jsonl" 'x
```grill
{"round":1}
```' | no_terminal "$hook"); code=$?
check "no questions key" "$(block 'The grill block needs a non-empty "questions" array. Write the round again.')" "$out" $code

new_id nogrill
out=$(input "$id" "$tmp/plain.jsonl" "$message" | no_terminal "$hook"); code=$?
check "no /grill in transcript" "$(block "$not_typed")" "$out" $code

new_id othermention
out=$(input "$id" "$tmp/other-mention.jsonl" "$message" | no_terminal "$hook"); code=$?
check "skill_mention of another skill is not /grill" "$(block "$not_typed")" "$out" $code

new_id notranscript
out=$(input "$id" "$tmp/does-not-exist.jsonl" "$message" | no_terminal "$hook"); code=$?
check "missing transcript counts as no /grill" "$(block "$not_typed")" "$out" $code

new_id command
out=$(input "$id" "$tmp/command.jsonl" "$message" | no_terminal "$hook"); code=$?
check "/grill command tag, no terminal: markdown fallback" "$(block "$no_tui")" "$out" $code

new_id mention
out=$(input "$id" "$tmp/mention.jsonl" "$message" | no_terminal "$hook"); code=$?
check "/grill skill_mention, no terminal: markdown fallback" "$(block "$no_tui")" "$out" $code

out=$(input "" "$tmp/command.jsonl" "$message" | no_terminal "$hook"); code=$?
check "no session id: exits 0, no output" "" "$out" $code

# Without bun: a PATH without it and a HOME without ~/.bun.
if [ -x /opt/homebrew/bin/bun ] || [ -x /usr/local/bin/bun ]; then
  echo "skip bun missing: bun is installed in /opt/homebrew/bin or /usr/local/bin, which hook.sh always checks"
else
  mkdir -p "$tmp/home"
  new_id nobun
  in=$(input "$id" "$tmp/command.jsonl" "$message")
  out=$(printf '%s' "$in" | no_terminal env -u BUN_INSTALL HOME="$tmp/home" PATH=/usr/bin:/bin /bin/sh "$hook"); code=$?
  check "bun missing, grill block: markdown fallback" "$(block "$no_bun")" "$out" $code
  in=$(input "$id" "$tmp/command.jsonl" "All done.")
  out=$(printf '%s' "$in" | no_terminal env -u BUN_INSTALL HOME="$tmp/home" PATH=/usr/bin:/bin /bin/sh "$hook"); code=$?
  check "bun missing, no grill block: exits 0, no output" "" "$out" $code
fi

for id in $ids; do
  [ -e "/tmp/claude-grill/$id.sock" ] && { fail=$((fail + 1)); echo "FAIL socket left behind: $id.sock"; }
done

echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
