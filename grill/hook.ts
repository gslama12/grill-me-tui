#!/usr/bin/env bun
// Stop hook for /grill. When Claude's last message ends a round with a grill block, it sends
// the round to the grill TUI (opening one in a terminal split if none is running, see launchers.ts),
// waits for the answers and hands them back to Claude so it can write the next round.
// Without a grill block it closes the session's TUI, if there is one, and lets Claude stop.
import { connect, type Socket } from "node:net";
import { existsSync, unlinkSync } from "node:fs";
import { launch } from "./launchers.ts";
import { socketPath, type Round } from "./shared.ts";

const input = await Bun.stdin.json();
const session = String(input.session_id ?? "").replace(/[^A-Za-z0-9-]/g, "");
const message = String(input.last_assistant_message ?? "");
const source = [...message.matchAll(/```grill[ \t]*\n([\s\S]*?)\n```/g)].at(-1)?.[1];

// Makes Claude continue, with `reason` as what it reads next.
function keepGoing(reason: string): never {
  console.log(JSON.stringify({ decision: "block", reason }));
  process.exit(0);
}

function tryConnect(path: string): Promise<Socket | null> {
  return new Promise((resolve) => {
    if (!existsSync(path)) return resolve(null);
    const socket = connect(path);
    socket.once("connect", () => resolve(socket));
    socket.once("error", () => {
      try {
        unlinkSync(path); // left behind by a TUI that crashed
      } catch {}
      resolve(null);
    });
  });
}

function readReply(socket: Socket): Promise<{ type: string; text?: string } | null> {
  return new Promise((resolve) => {
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk;
      const end = buffer.indexOf("\n");
      if (end >= 0) resolve(JSON.parse(buffer.slice(0, end)));
    });
    socket.on("close", () => resolve(null));
    socket.on("error", () => resolve(null));
  });
}

async function waitForTui(path: string): Promise<Socket | null> {
  for (let i = 0; i < 50; i++) {
    const socket = await tryConnect(path);
    if (socket) return socket;
    await Bun.sleep(100);
  }
  return null;
}

if (!session) process.exit(0);

if (!source) {
  const socket = await tryConnect(socketPath(session));
  socket?.end(JSON.stringify({ type: "close" }) + "\n");
  process.exit(0);
}

// Only a session the user started with /grill gets the TUI. Claude Code records "/grill" at the
// start of a message as a command tag, and later in a message as a skill_mention attachment.
const transcript = await Bun.file(String(input.transcript_path ?? "")).text().catch(() => "");
const typed = transcript.split("\n").some((line) => {
  try {
    const entry = JSON.parse(line);
    if (entry.type === "attachment") return entry.attachment?.type === "skill_mention" && entry.attachment.skillName === "grill";
    return entry.type === "user" && typeof entry.message?.content === "string" &&
      entry.message.content.includes("<command-name>/grill</command-name>");
  } catch {
    return false;
  }
});
if (!typed) {
  keepGoing(
    "The user didn't type /grill in this session, so the grill TUI stays closed. Ask this round again " +
      "in the grilling skill's markdown format, and don't write grill blocks in this session.",
  );
}

let round: Round;
try {
  round = JSON.parse(source);
} catch (error) {
  keepGoing(`The grill block is not valid JSON (${(error as Error).message}). Write the round again.`);
}
if (!round.questions?.length) {
  keepGoing('The grill block needs a non-empty "questions" array. Write the round again.');
}

const socket =
  (await tryConnect(socketPath(session))) ??
  (await tryConnect(socketPath("any"))) ??
  (launch([process.execPath, `${import.meta.dir}/tui.ts`, "--session", session]) ? await waitForTui(socketPath(session)) : null);
if (!socket) {
  keepGoing(
    "No grill TUI could open (it opens in a split in herdr, tmux, Zellij, WezTerm, kitty or iTerm2, " +
      "and no `grill` is running in another terminal). " +
      "Ask this round again in the grilling skill's markdown format, and keep that format for the rest of the session.",
  );
}

socket.write(JSON.stringify({ type: "round", ...round }) + "\n");
const reply = await readReply(socket);
socket.destroy();
// No reply (the TUI was closed) or "chat": let Claude stop so the user can type in chat.
if (reply?.type === "answers" && reply.text) keepGoing(reply.text);
process.exit(0);
