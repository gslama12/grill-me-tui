#!/usr/bin/env bun
// Adds or removes the grill Stop hook and CLAUDE_CODE_STOP_HOOK_BLOCK_CAP in a Claude Code
// settings.json, leaving every other key and hook as it was. Used by install.sh and uninstall.sh.
//
//   bun scripts/settings.ts install   <settings.json> <abs path to hook.sh>
//   bun scripts/settings.ts uninstall <settings.json>
//
// The file is rewritten (2-space indent, trailing newline) only when its content changes, after
// copying it to settings.json.bak.<timestamp>. Invalid JSON aborts with the file untouched.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const CAP_KEY = "CLAUDE_CODE_STOP_HOOK_BLOCK_CAP";
const CAP = 200;
const TIMEOUT = 3600;

type Json = Record<string, any>;

const [mode, file, hookPath] = process.argv.slice(2);
if (!file || (mode === "install" && !hookPath) || (mode !== "install" && mode !== "uninstall")) {
  console.error("usage: settings.ts install <settings.json> <hook.sh> | uninstall <settings.json>");
  process.exit(2);
}

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// A hook command is ours when the path it runs ends in /grill/hook.ts or /grill/hook.sh, quoted or not.
// This also matches the old "~/.claude/grill/hook.ts" entry, which install migrates.
function isOurs(hook: unknown): boolean {
  if (!isObject(hook) || typeof hook.command !== "string") return false;
  const command = hook.command.trim().replace(/^(['"])(.*)\1$/, "$2");
  return /\/grill\/hook\.(ts|sh)$/.test(command);
}

// Quotes the path for the shell Claude Code runs the command in, only when it needs it.
const shellQuote = (path: string) =>
  /^[A-Za-z0-9_./~+@%:,=-]+$/.test(path) ? path : `'${path.replaceAll("'", `'\\''`)}'`;

// Removes our hooks from every Stop group, drops groups left empty, and returns where the first
// removed hook's group was (so install can put the new entry back in the same place), or -1.
function removeOurs(settings: Json): number {
  const stop = settings.hooks?.Stop;
  if (!Array.isArray(stop)) return -1;
  let first = -1;
  const kept: unknown[] = [];
  for (const group of stop) {
    if (!isObject(group) || !Array.isArray(group.hooks) || !group.hooks.some(isOurs)) {
      kept.push(group);
      continue;
    }
    if (first < 0) first = kept.length;
    const rest = group.hooks.filter((hook: unknown) => !isOurs(hook));
    if (rest.length) kept.push({ ...group, hooks: rest });
  }
  settings.hooks.Stop = kept;
  return first;
}

const notes: string[] = [];
let original: string | null = null;
let settings: Json = {};

if (existsSync(file)) {
  original = readFileSync(file, "utf8");
  if (original.trim()) {
    try {
      settings = JSON.parse(original);
    } catch (error) {
      console.error(`error: ${file} is not valid JSON (${(error as Error).message}). Fix it and run again; nothing was changed.`);
      process.exit(1);
    }
    if (!isObject(settings)) {
      console.error(`error: ${file} does not hold a JSON object. Fix it and run again; nothing was changed.`);
      process.exit(1);
    }
  }
}
if (settings.hooks !== undefined && !isObject(settings.hooks)) {
  console.error(`error: "hooks" in ${file} is not an object. Fix it and run again; nothing was changed.`);
  process.exit(1);
}
if (settings.hooks?.Stop !== undefined && !Array.isArray(settings.hooks.Stop)) {
  console.error(`error: "hooks.Stop" in ${file} is not an array. Fix it and run again; nothing was changed.`);
  process.exit(1);
}
if (settings.env !== undefined && !isObject(settings.env)) {
  console.error(`error: "env" in ${file} is not an object. Fix it and run again; nothing was changed.`);
  process.exit(1);
}

const before = JSON.stringify(settings);

if (mode === "install") {
  settings.hooks ??= {};
  settings.hooks.Stop ??= [];
  const at = removeOurs(settings);
  const entry = { hooks: [{ type: "command", command: shellQuote(hookPath), timeout: TIMEOUT }] };
  if (at >= 0) settings.hooks.Stop.splice(at, 0, entry);
  else settings.hooks.Stop.push(entry);

  settings.env ??= {};
  const current = settings.env[CAP_KEY];
  const value = Number(current);
  if (current !== undefined && Number.isFinite(value) && value > CAP) {
    notes.push(`kept your ${CAP_KEY}=${current}, which is larger than ${CAP}`);
  } else {
    if (current !== undefined && String(current) !== String(CAP)) {
      notes.push(`changed ${CAP_KEY} from ${JSON.stringify(current)} to "${CAP}"`);
    }
    settings.env[CAP_KEY] = String(CAP);
  }
} else {
  removeOurs(settings);
  if (Array.isArray(settings.hooks?.Stop) && settings.hooks.Stop.length === 0) delete settings.hooks.Stop;
  if (isObject(settings.hooks) && Object.keys(settings.hooks).length === 0) delete settings.hooks;
  if (isObject(settings.env) && CAP_KEY in settings.env) {
    if (String(settings.env[CAP_KEY]) === String(CAP)) {
      delete settings.env[CAP_KEY];
      notes.push(`removed ${CAP_KEY}=${CAP}`);
      if (Object.keys(settings.env).length === 0) delete settings.env;
    } else {
      notes.push(`left ${CAP_KEY}=${settings.env[CAP_KEY]} in place (not the value grill sets)`);
    }
  }
}

// Compares content, not text, so a file that only differs in formatting is left alone.
const unchanged = original !== null ? JSON.stringify(settings) === before : mode === "uninstall";
if (unchanged) {
  console.log(`settings: ${file} already up to date`);
} else {
  if (original !== null) {
    const d = new Date();
    const two = (n: number) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
    let backup = `${file}.bak.${stamp}`;
    for (let i = 1; existsSync(backup); i++) backup = `${file}.bak.${stamp}-${i}`;
    copyFileSync(file, backup);
    notes.push(`backup: ${backup}`);
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(settings, null, 2) + "\n");
  console.log(`settings: ${original === null ? "created" : "updated"} ${file}`);
}
for (const note of notes) console.log(`  ${note}`);
