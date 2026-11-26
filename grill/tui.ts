#!/usr/bin/env bun
// The grill TUI: shows a round one question at a time and sends the answers back to the Stop
// hook. Opened by the hook with --session for one Claude session, it closes when grilling ends.
// Started by hand as `grill`, it serves every session and keeps running.
import { createServer, type Socket } from "node:net";
import { mkdirSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { SOCKET_DIR, socketPath, type Round } from "./shared.ts";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const session = arg("session");
const manual = !session;
const path = socketPath(session ?? "any");

type Item = {
  title: string;
  body: string;
  options: string[];
  reason?: string;
  prefill: string;
  kind: "question" | "extra";
};

let mode: "waiting" | "question" | "summary" = "waiting";
let items: Item[] = [];
let answers: string[] = [];
let index = 0;
let roundNo = 0;
let client: Socket | null = null;
let frame = 0;

const letter = (i: number) => String.fromCharCode(65 + i);
const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[39m`;
// Colors of Claude Code's dark theme: its orange, and greys from light to dark.
const orange = (s: string) => `\x1b[38;2;215;119;87m${s}\x1b[39m`;
const light = (s: string) => `\x1b[38;5;248m${s}\x1b[39m`;
const darker = (s: string) => `\x1b[38;5;242m${s}\x1b[39m`;
const darkest = (s: string) => `\x1b[38;5;238m${s}\x1b[39m`;

// What an answer means: one option letter picks that option, anything else is the user's words.
function resolve(item: Item, raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const i = /^[a-z]$/i.test(text) ? text.toUpperCase().charCodeAt(0) - 65 : -1;
  if (i >= 0 && i < item.options.length) {
    return `${letter(i)}: ${item.options[i]}${i === 0 ? " (recommended)" : ""}`;
  }
  return `"${text}"`;
}

function startRound(round: Round) {
  roundNo = round.round ?? roundNo + 1;
  items = (round.questions ?? []).map((q) => ({
    title: q.title,
    body: q.body,
    options: [q.recommendation, ...(q.alternatives ?? [])],
    reason: q.reason,
    prefill: "A",
    kind: "question" as const,
  }));
  items.push({
    title: "Anything else?",
    body: "Anything else for this round that I haven't asked about?",
    options: [],
    prefill: "no",
    kind: "extra",
  });
  answers = items.map((item) => item.prefill);
  index = 0;
  mode = "question";
  render();
}

function answerText(): string {
  const lines = items.map((item, i) => {
    const answer = resolve(item, answers[i]);
    if (item.kind === "extra") {
      return `Anything else: ${!answer || /^"no"$/i.test(answer) ? "nothing" : answer}`;
    }
    return `Q${i + 1} ${item.title}: ${answer ?? "unanswered"}`;
  });
  return [
    `Grill answers for round ${roundNo} (A is your recommendation; quoted text is the user's own words):`,
    ...lines,
  ].join("\n");
}

function submit() {
  client?.end(JSON.stringify({ type: "answers", text: answerText() }) + "\n");
  client = null;
  mode = "waiting";
  render();
}

// Esc: the user wants to talk in chat, so Claude's turn ends and the TUI steps aside.
function toChat() {
  client?.end(JSON.stringify({ type: "chat" }) + "\n");
  client = null;
  if (!manual) return quit();
  roundNo = 0;
  mode = "waiting";
  render();
}

const PAD = "  ";
const width = () => Math.max(20, Math.min((process.stdout.columns || 80) - 4, 100));

// Word-wraps text to the content width, keeping its own line breaks.
function wrap(text: string, max = width()): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && line.length + 1 + word.length > max) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    lines.push(line);
  }
  return lines;
}

// A shaded bar across the pane with the text centered and, during a round, a progress bar.
function header(text: string, progress?: number): string[] {
  const columns = process.stdout.columns || 80;
  const center = (length: number) => " ".repeat(Math.max(0, Math.floor((columns - length) / 2)));
  const row = (s: string, length = s.length) =>
    `\x1b[48;5;236m${s}${" ".repeat(Math.max(0, columns - length))}\x1b[49m`;
  const rows = ["", row(""), row(center(text.length) + text)];
  if (progress !== undefined) {
    const size = Math.min(40, columns - 4);
    const done = Math.round(progress * size);
    const bar = `\x1b[38;2;215;119;87m${"━".repeat(done)}\x1b[38;5;240m${"━".repeat(size - done)}\x1b[39m`;
    rows.push(row(center(size) + bar, center(size).length + size));
  }
  return [...rows, row(""), ""];
}

const separator = () => PAD + darkest("─".repeat(width()));
const SAVE = "\x1b7";
const RESTORE = "\x1b8";

function render() {
  const out: string[] = [];
  const write = (s: string) => process.stdout.write("\x1b[2J\x1b[H" + s);

  if (mode === "waiting") {
    const spinner = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"[frame % 10];
    const what = roundNo ? `Claude is preparing round ${roundNo + 1}…` : "Waiting for a grilling session…";
    out.push(...header("grill"), `${PAD}${orange(spinner)} ${light(what)}`);
    return write("\x1b[?25l" + out.join("\n"));
  }

  if (mode === "summary") {
    out.push(...header(`grill · round ${roundNo} · summary`, 1));
    items.forEach((item, i) => {
      const answer = resolve(item, answers[i]);
      out.push(PAD + bold(item.title), `${PAD}  ${answer ?? yellow("unanswered")}`, "");
    });
    out.push(separator(), PAD + darker("⏎ send to Claude · ← back · esc talk in chat"));
    return write("\x1b[?25l" + out.join("\n"));
  }

  const item = items[index];
  const chosen = answers[index].trim().toUpperCase();
  out.push(...header(`grill · round ${roundNo} · ${index + 1}/${items.length}`, (index + 1) / items.length));
  out.push(PAD + bold(orange(item.title)), "");
  for (const line of wrap(item.body)) out.push(PAD + line);
  out.push("");
  item.options.forEach((option, i) => {
    // The option the input picks is marked and drawn in orange, all of its lines.
    const picked = chosen === letter(i);
    const paint = (s: string) => (picked ? bold(orange(s)) : s);
    const [first, ...rest] = wrap(option, width() - 7);
    out.push(PAD + paint(`${picked ? "›" : " "} ${letter(i)}  ${first}`));
    for (const line of rest) out.push(PAD + paint(`     ${line}`));
  });
  if (item.options.length) out.push("");
  if (item.reason) {
    for (const line of wrap(`Suggestion: ${item.reason}`)) out.push(PAD + light(line));
    out.push("");
  }
  out.push(separator());
  // The cursor is parked at the end of the input line while the help is drawn below it.
  const help = [separator(), PAD + darker("⏎ confirm · ← → previous/next · esc talk in chat")];
  write(out.join("\n") + `\n${PAD}› ${answers[index]}${SAVE}\n${help.join("\n")}${RESTORE}\x1b[?25h`);
}

function onKey(key: string) {
  if (key === "\x03") return mode === "waiting" ? quit() : toChat();
  if (key === "\x1b") return mode === "waiting" ? (manual ? undefined : quit()) : toChat();
  if (mode === "waiting") return;
  if (key === "\x1b[D" || key === "\x1bOD") {
    if (mode === "summary") mode = "question";
    else if (index > 0) index--;
  } else if (key === "\x1b[C" || key === "\x1bOC" || key === "\r") {
    if (mode === "summary") return key === "\r" ? submit() : undefined;
    if (index < items.length - 1) index++;
    else mode = "summary";
  } else if (mode === "question" && !key.startsWith("\x1b")) {
    // Typed or pasted text, a character at a time: pasted line breaks become spaces.
    for (const char of key.replace(/\r\n/g, " ")) {
      if (char === "\x7f" || char === "\b") answers[index] = answers[index].slice(0, -1);
      else if (char === "\r" || char === "\n") answers[index] += " ";
      else if (char >= " ") answers[index] += char;
    }
  }
  render();
}

function quit(): never {
  process.stdout.write("\x1b[?25h\x1b[2J\x1b[H");
  try {
    unlinkSync(path);
  } catch {}
  // The launcher's command to focus Claude's pane again, a JSON argv.
  try {
    const [cmd, ...args] = JSON.parse(arg("return-focus") ?? "[]");
    if (cmd) spawnSync(cmd, args, { stdio: "ignore" });
  } catch {}
  process.exit(0);
}

mkdirSync(SOCKET_DIR, { recursive: true });
try {
  unlinkSync(path);
} catch {}

createServer((socket) => {
  if (client) return socket.destroy(); // busy with another session's round
  client = socket;
  let buffer = "";
  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      if (message.type === "round") startRound(message);
      if (message.type === "close") {
        if (!manual) quit();
        roundNo = 0;
      }
    }
  });
  socket.on("close", () => {
    if (client !== socket) return;
    client = null;
    // The hook went away mid-round: Claude was interrupted or the hook timed out.
    if (mode !== "waiting") {
      if (!manual) quit();
      mode = "waiting";
      render();
    }
  });
  socket.on("error", () => {});
}).listen(path);

process.stdin.setRawMode(true);
process.stdin.setEncoding("utf8");
process.stdin.on("data", onKey);
process.stdout.on("resize", render);
setInterval(() => {
  frame++;
  if (mode === "waiting") render();
}, 100);
render();
