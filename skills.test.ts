import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

/**
 * Guard tests for the installable skills: the skill text is agent-facing
 * instructions, so the security-relevant contracts — approval-gated CLI
 * installation and tokens never entering agent context — are asserted here.
 * The skills are plain Markdown; these tests keep the contract from regressing
 * while the text evolves.
 */

const SKILLS = join(import.meta.dir, "skills");

async function skill(name: string): Promise<string> {
  return readFile(join(SKILLS, name, "SKILL.md"), "utf8");
}

function frontmatter(text: string): Record<string, string> {
  const match = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!match) throw new Error("missing frontmatter");
  return Object.fromEntries(
    match[1]!.split("\n").map(line => {
      const index = line.indexOf(":");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
  );
}

describe("handoff-setup skill", () => {
  test("declares its name and trigger description", async () => {
    const meta = frontmatter(await skill("handoff-setup"));
    expect(meta.name).toBe("handoff-setup");
    expect(meta.description).toContain("/barge:handoff-setup");
  });

  test("installs the CLI only after explicit user approval", async () => {
    const text = await skill("handoff-setup");
    expect(text).toContain("command -v barge");
    expect(text).toContain("releases/latest/download/release.json");
    expect(text).toContain("raw.githubusercontent.com/getbarge/barge/main/install.sh");
    expect(text).toContain("ask for approval before downloading anything");
    expect(text).toContain("never replace a working installation without asking");
    expect(text).toContain("`dev` is a source build and counts as current");
  });

  test("covers the installer's failure paths specifically", async () => {
    const text = await skill("handoff-setup");
    expect(text).toContain("no release has been published yet");
    expect(text).toContain("windows-x64.exe");
    expect(text).toContain("checksum mismatch");
    expect(text).toContain("The user declines");
  });

  test("validates without ever handling the token", async () => {
    const text = await skill("handoff-setup");
    expect(text).toContain("`barge list` succeeds without a 401");
    expect(text).not.toMatch(/BARGE_TOKEN=\$?\{?<?token/);
    expect(text).not.toMatch(/BARGE_TOKEN=<token>/);
    expect(text).toContain("Do not read `~/.config/barge/config` into the conversation");
  });

  test("surfaces slash-command arguments to the agent", async () => {
    const meta = frontmatter(await skill("handoff-setup"));
    expect(meta["argument-hint"]).toBeTruthy();
    const text = await skill("handoff-setup");
    expect(text).toContain("$ARGUMENTS");
  });
});

describe("handoff skill", () => {
  test("declares its name and trigger description", async () => {
    const meta = frontmatter(await skill("handoff"));
    expect(meta.name).toBe("handoff");
    expect(meta.description).toContain("$barge:handoff");
  });

  test("never instructs the agent to read the config or export the token", async () => {
    const text = await skill("handoff");
    expect(text).not.toMatch(/read `~\.config\/barge\/config`[\s\S]*export its/);
    expect(text).not.toContain("export its `url`/`token` fields");
    expect(text).toContain("never set, export, or read the token into the conversation");
    expect(text).toContain("run `/barge:handoff-setup` instead of guessing at credentials");
  });

  test("keeps the secret-handling rule for packaging", async () => {
    const text = await skill("handoff");
    expect(text).toContain("never pass `--allow-secrets` automatically");
  });

  test("surfaces slash-command arguments to the agent", async () => {
    const meta = frontmatter(await skill("handoff"));
    expect(meta["argument-hint"]).toBeTruthy();
    const text = await skill("handoff");
    expect(text).toContain("$ARGUMENTS");
  });
});
