// What the Stop hook (hook.ts) and the grill TUI (tui.ts) send each other over a Unix socket,
// one JSON object per line.
//   hook -> TUI: {type: "round", ...Round} or {type: "close"}
//   TUI -> hook: {type: "answers", text} or {type: "chat"} (the user wants to talk in chat)

export type Question = {
  title: string;
  body: string;
  recommendation: string;
  reason?: string; // why Claude recommends it
  alternatives?: string[];
};

// What Claude writes in its grill block.
export type Round = { round?: number; questions?: Question[] };

export const SOCKET_DIR = "/tmp/claude-grill";

// A TUI opened for one session listens on <session>.sock. One the user starts with plain
// `grill` listens on any.sock and serves every session.
export const socketPath = (session: string) => `${SOCKET_DIR}/${session}.sock`;
