# grill-me-tui

A terminal UI for Claude Code that lets you answer the questions of Matt Pocock's `grill-me` interview one at a time, in a split pane below your session.

![grill-me-tui demo](docs/demo.gif)

## Install and use

You need [Claude Code](https://claude.com/claude-code), [Bun](https://bun.sh) and the `grilling` skill:

```sh
npx skills add mattpocock/skills --skill grilling -g -a claude-code -y
git clone https://github.com/gslama12/grill-me-tui ~/.local/share/grill-me-tui   # or any permanent place
~/.local/share/grill-me-tui/install.sh
```

Start a new Claude Code session and type `/grill <topic>`, at the start of a message or anywhere in it (`/grill-me` stays the chat version).

Keys: **Enter** confirm · **←/→** move · **Esc** back to chat

Uninstall: `~/.local/share/grill-me-tui/uninstall.sh`

## Environments

| Terminal | Status |
| --- | --- |
| herdr | Tested (macOS) |
| tmux | Tested (macOS) |
| WezTerm | Tested (macOS) |
| Zellij | Untested |
| kitty (needs `allow_remote_control`) | Untested |
| iTerm2 (macOS) | Untested |
| Ghostty and others | Not supported |

## How it works

- `/grill` is a skill that runs `grilling`, but has Claude end each round with a JSON block of questions.
- A Stop hook, added to your Claude Code `settings.json` by `install.sh`, reads that block when Claude finishes its message.
- The hook opens the TUI (a Bun script) in a split below Claude's pane, or uses a `grill` you already started in another terminal.
- Hook and TUI talk over a Unix socket in `/tmp/claude-grill`: questions go in, your answers come back.
- The hook returns the answers to Claude, which writes the next round; when there are no more questions, the TUI closes and Claude sums up in chat.
