# Records docs/demo.gif. Run from the repo root: vhs docs/demo.tape
# Needs vhs, tmux and bun. The top pane is scripted; the TUI below it is the real one.
Output docs/demo.gif

Set Shell "bash"
Set FontSize 16
Set Width 1200
Set Height 980
Set Padding 20
Set Framerate 20
Set TypingSpeed 60ms
Set Theme { "name": "demo", "background": "#1a1a1a", "foreground": "#e6e6e6", "cursor": "#e6e6e6", "cursorAccent": "#1a1a1a", "selection": "#444444", "black": "#1a1a1a", "red": "#ff6b80", "green": "#4eba65", "yellow": "#ffc107", "blue": "#7aa2f7", "magenta": "#bb9af7", "cyan": "#7dcfff", "white": "#c0c0c0", "brightBlack": "#6c6c6c", "brightRed": "#ff6b80", "brightGreen": "#4eba65", "brightYellow": "#ffc107", "brightBlue": "#7aa2f7", "brightMagenta": "#bb9af7", "brightCyan": "#7dcfff", "brightWhite": "#ffffff" }

Hide
# The TUI opens in tmux, so drop what would make the hook pick the recorder's own terminal.
Type "clear && env -u HERDR_ENV -u HERDR_PANE_ID -u HERDR_BIN_PATH -u WEZTERM_PANE -u WEZTERM_UNIX_SOCKET -u ZELLIJ -u TMUX -u TMUX_PANE -u TERM_PROGRAM tmux -L grill-demo -f docs/demo/tmux.conf new-session 'bun docs/demo/session.ts'"
Enter
Sleep 300ms
Show

# Question 1: accept the recommendation.
Sleep 6s
Enter
# Question 2: replace it with your own answer.
Sleep 1500ms
Backspace
Sleep 400ms
Type "30s, but 5 min for the product catalog"
Sleep 900ms
Enter
# Question 3: go back to check question 2, then forward again.
Sleep 1200ms
Left
Sleep 1200ms
Right
Sleep 900ms
Enter
# Anything else?
Sleep 1100ms
Enter
# Summary: send it.
Sleep 2200ms
Enter
Sleep 4500ms

Hide
Ctrl+C
Sleep 500ms
