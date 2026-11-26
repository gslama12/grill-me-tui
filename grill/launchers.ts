// Terminal launchers: each opens the grill TUI in a split below Claude's pane, focused, and
// tells the TUI how to give focus back to Claude's pane when it exits. The first launcher whose
// terminal is detected and whose CLI works is used; one that fails returns false, so the hook
// can fall back to the markdown format. Adding a terminal is one more entry in `launchers`.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { SOCKET_DIR } from "./shared.ts";

export type Launcher = {
  name: string;
  detect(): boolean;
  // Opens `tui` (an argv) in a split below Claude's pane. Appends the `--return-focus` it needs.
  open(tui: string[]): boolean;
};

const env = process.env;

// Runs a command, true if it exited 0. A missing binary is a failure, not an exception.
function run(cmd: string, args: string[]): boolean {
  return spawnSync(cmd, args, { stdio: "ignore" }).status === 0;
}

function output(cmd: string, args: string[]): string | null {
  const result = spawnSync(cmd, args);
  return result.status === 0 ? result.stdout.toString() : null;
}

// Quotes an argv for sh.
export const shellQuote = (argv: string[]) =>
  argv.map((arg) => `'${arg.replaceAll("'", `'\\''`)}'`).join(" ");

// The TUI runs this argv when it exits, to focus Claude's pane again.
const returnFocus = (argv: string[]) => ["--return-focus", JSON.stringify(argv)];

// AppleScript finding iTerm2's session with the unique id in `item 1 of argv`.
const ITERM_FIND = `
on findSession(wanted)
  tell application "iTerm2"
    repeat with w in windows
      repeat with t in tabs of w
        repeat with s in sessions of t
          if unique id of s is wanted then return {t, s}
        end repeat
      end repeat
    end repeat
  end tell
  return missing value
end findSession`;

export const launchers: Launcher[] = [
  {
    name: "herdr",
    detect: () => env.HERDR_ENV === "1",
    open(tui) {
      // herdr exports its own path, which a hook's minimal PATH may lack.
      const herdr = env.HERDR_BIN_PATH || "herdr";
      const split = output(herdr, ["pane", "split", "--current", "--direction", "down", "--focus"]);
      let id: string | undefined;
      try {
        id = JSON.parse(split || "{}")?.result?.pane?.pane_id;
      } catch {}
      if (!id) return false;
      // herdr focuses a pane by direction: the one above the TUI's pane is Claude's.
      const back = returnFocus([herdr, "pane", "focus", "--pane", id, "--direction", "up"]);
      return run(herdr, ["pane", "run", id, "exec " + shellQuote([...tui, ...back])]);
    },
  },
  {
    name: "tmux",
    detect: () => !!env.TMUX && !!env.TMUX_PANE,
    open(tui) {
      const pane = env.TMUX_PANE!;
      const back = returnFocus(["tmux", "select-pane", "-t", pane]);
      // Several command arguments are run directly, without sh -c.
      return run("tmux", ["split-window", "-v", "-l", "50%", "-t", pane, "-c", process.cwd(), ...tui, ...back]);
    },
  },
  {
    name: "zellij",
    detect: () => !!env.ZELLIJ,
    open(tui) {
      // focus-pane-id needs a recent Zellij; older ones fall back to moving focus up.
      const pane = env.ZELLIJ_PANE_ID;
      const focus = pane
        ? `zellij action focus-pane-id ${shellQuote([pane])} 2>/dev/null || zellij action move-focus up`
        : "zellij action move-focus up";
      const back = returnFocus(["sh", "-c", focus]);
      return run("zellij", ["run", "--direction", "down", "--close-on-exit", "--", ...tui, ...back]);
    },
  },
  {
    name: "wezterm",
    detect: () => !!env.WEZTERM_PANE,
    open(tui) {
      const pane = env.WEZTERM_PANE!;
      const wezterm = env.WEZTERM_EXECUTABLE_DIR ? `${env.WEZTERM_EXECUTABLE_DIR}/wezterm` : "wezterm";
      const args = ["cli", "split-pane", "--pane-id", pane, "--bottom", "--percent", "50", "--"];
      const back = returnFocus([wezterm, "cli", "activate-pane", "--pane-id", pane]);
      return run(wezterm, [...args, ...tui, ...back]);
    },
  },
  {
    name: "kitty",
    // Only when remote control works (allow_remote_control in kitty.conf).
    detect: () => !!env.KITTY_WINDOW_ID && run("kitty", ["@", "ls"]),
    open(tui) {
      const window = env.KITTY_WINDOW_ID!;
      const back = returnFocus(["kitty", "@", "focus-window", "--match", `id:${window}`]);
      // hsplit (one window above the other) applies in the splits layout; others place it their way.
      return run("kitty", ["@", "launch", "--type=window", "--location=hsplit", "--cwd=current", ...tui, ...back]);
    },
  },
  {
    name: "iTerm2",
    detect: () => process.platform === "darwin" && env.TERM_PROGRAM === "iTerm.app",
    open(tui) {
      // ITERM_SESSION_ID is "w0t0p0:<unique id>".
      const id = env.ITERM_SESSION_ID?.split(":").at(-1) ?? "";
      const back = returnFocus([
        "/usr/bin/osascript",
        "-e", `${ITERM_FIND}
on run argv
  set found to findSession(item 1 of argv)
  if found is missing value then return
  tell application "iTerm2"
    select item 1 of found
    select item 2 of found
  end tell
end run`,
        id,
      ]);
      // iTerm2 runs the command without a shell or the user's environment, and splits it on
      // spaces: a script file holds the quoted argv, so paths with spaces still work.
      mkdirSync(SOCKET_DIR, { recursive: true });
      const script = `${SOCKET_DIR}/launch-${process.pid}.sh`;
      writeFileSync(script, `rm -f ${shellQuote([script])}\nexec ${shellQuote([...tui, ...back])}\n`);
      return run("/usr/bin/osascript", [
        "-e", `${ITERM_FIND}
on run argv
  set found to findSession(item 1 of argv)
  tell application "iTerm2"
    if found is missing value then
      set claude to current session of current window
    else
      set claude to item 2 of found
    end if
    tell claude to set tui to (split horizontally with default profile command (item 2 of argv))
    select tui
  end tell
end run`,
        id,
        `/bin/sh ${script}`,
      ]);
    },
  },
];

// Opens the TUI with the first detected terminal that manages to.
export function launch(tui: string[]): boolean {
  return launchers.some((launcher) => launcher.detect() && launcher.open(tui));
}
