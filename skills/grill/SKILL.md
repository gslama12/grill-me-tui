---
name: grill
description: A relentless interview to sharpen a plan or design, answered one question at a time in the grill TUI. Use only when the user types exactly /grill, at the start of the message or anywhere in it. Never for /grill-me, /grill-with-docs or "grill me": those use the grilling skill.
---

Call the Skill tool with "grilling". Follow it, except for how a round is written: the user answers in a terminal UI, which a Stop hook opens when your message ends with a grill block.

Write each round as a one-line heading ("Round 2 · 5 questions"), then a single fenced block tagged `grill`, and nothing after it:

```grill
{"round": 2, "questions": [
  {"title": "Storage", "body": "Where should session state live?", "recommendation": "Postgres table", "reason": "It survives restarts without adding a service; Redis would be a new dependency for one table's worth of data.", "alternatives": ["Redis", "In-memory"]}
]}
```

- Ask the whole frontier in one round, however many questions it holds, and don't repeat the questions in markdown.
- `title`: a few words. `body`: the full question, readable on its own, since the UI shows only the block. Don't list the choices in the body: they go in `recommendation` and `alternatives`.
- `recommendation`: your recommended answer, short. The UI lists it as option A and fills it in. `reason`: why you recommend it, a sentence or two. `alternatives`: the other real choices, or `[]` for an open question. Ignore the grilling skill's rule about wording questions for "yes": the user accepts with Enter.

The answers come back as Stop hook feedback starting with "Grill answers": treat it as the user's reply. Quoted text is the user's own words and outranks the options. Ask unanswered questions again next round. A note under "Anything else" is new input: it can settle, reopen or add branches of the design tree.

When the frontier is empty, the TUI's part is over: write no more grill blocks, which closes it. Write the shared understanding in chat as a brief: start with why, group the decisions under short bold headings by topic (not in the order they were asked), name any defaults you assumed for things not discussed, and end with numbered next steps. Then ask there whether it's reached.

If the feedback says no grill TUI could open, use the grilling skill's markdown format for the rest of the session.
