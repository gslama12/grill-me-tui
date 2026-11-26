// Plays the Claude side of the demo recording (docs/demo.tape): prints a scripted exchange and
// runs the real Stop hook (grill/hook.sh) on a fake transcript, so the real TUI opens.
const root = `${import.meta.dir}/../..`;

const orange = (s: string) => `\x1b[38;2;215;119;87m${s}\x1b[39m`;
const grey = (s: string) => `\x1b[38;5;244m${s}\x1b[39m`;
const print = (s = "") => process.stdout.write(s + "\n");

async function stop(message: string): Promise<string> {
  const hook = Bun.spawn([`${root}/grill/hook.sh`], {
    stdin: new Blob([
      JSON.stringify({
        session_id: "grill-demo",
        transcript_path: `${import.meta.dir}/transcript.jsonl`,
        last_assistant_message: message,
      }),
    ]),
    stdout: "pipe",
  });
  const out = await new Response(hook.stdout).text();
  return out ? JSON.parse(out).reason : "";
}

const round = {
  round: 1,
  questions: [
    {
      title: "Cache store",
      body: "Where should cached API responses live?",
      recommendation: "Redis",
      reason: "All API instances share one cache, and expiry is built in.",
      alternatives: ["In-process memory", "Postgres table"],
    },
    {
      title: "Expiry",
      body: "How long may a cached response be served before it is fetched again?",
      recommendation: "60 seconds",
      reason: "Short enough that stale data rarely matters, long enough to absorb bursts.",
      alternatives: ["5 minutes", "Until a write invalidates it"],
    },
    {
      title: "Outages",
      body: "What should a request do when the cache is unreachable?",
      recommendation: "Skip the cache and query the database",
      reason: "A cache failure should slow the API down, not take it down.",
      alternatives: ["Return an error"],
    },
  ],
};

process.stdout.write("\x1b[?25l\x1b[2J\x1b[H");
print(grey("scripted demo session"));
print();
process.stdout.write(orange("❯ "));
await Bun.sleep(400);
for (const char of "/grill plan the caching layer for our API") {
  process.stdout.write(char);
  await Bun.sleep(30);
}
print("\n");
await Bun.sleep(600);
print(`${orange("●")} Round 1 · 3 questions`);
await Bun.sleep(900);

const answers = await stop(`Round 1 · 3 questions\n\n\`\`\`grill\n${JSON.stringify(round)}\n\`\`\``);

print();
answers.split("\n").slice(1).forEach((line, i) => print(grey(`  ${i ? " " : "⎿"} ${line}`)));
print();
await Bun.sleep(1200);
print(`${orange("●")} All settled. Here is the plan we agreed on.`);
await Bun.sleep(800);
await stop("All settled.");
await Bun.sleep(60_000);
