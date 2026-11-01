import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { installFixtureAsset, installFixtureBinary, installFixtureVersion } from "./install-fixture.ts";

const INSTALLER = join(import.meta.dir, "..", "install.sh");

interface FixtureOptions {
  noRelease?: boolean;
  corrupt?: boolean;
  missingAsset?: boolean;
}

function startFixture(options: FixtureOptions = {}): { base: string; close: () => void } {
  const binaryBytes = new TextEncoder().encode(installFixtureBinary);
  const corruptBytes = new TextEncoder().encode("#!/bin/sh\necho 9.9.9\n");
  const digest = createHash("sha256").update(binaryBytes).digest("hex");
  const sums = `${digest}  ${installFixtureAsset}\n`;
  const releaseJson = JSON.stringify({
    version: installFixtureVersion,
    assets: [{ name: installFixtureAsset, sha256: digest }],
  });
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (options.noRelease) return new Response("not found", { status: 404 });
      if (path === "/latest/download/release.json") return new Response(releaseJson);
      if (path === `/download/v${installFixtureVersion}/SHA256SUMS`) return new Response(sums);
      if (path === `/download/v${installFixtureVersion}/${installFixtureAsset}`) {
        if (options.missingAsset) return new Response("not found", { status: 404 });
        return new Response(options.corrupt ? corruptBytes : binaryBytes);
      }
      return new Response("not found", { status: 404 });
    },
  });
  return { base: `http://127.0.0.1:${server.port}`, close: () => server.stop(true) };
}

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runInstaller(options: {
  base: string;
  dir: string;
  args?: string[];
  env?: Record<string, string>;
}): Promise<RunResult> {
  const proc = Bun.spawn(
    ["sh", INSTALLER, "--base-url", options.base, "--dir", options.dir, ...(options.args ?? [])],
    {
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: options.dir, ...options.env },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

let testRoot = "";

beforeEach(async () => {
  testRoot = await mkdtemp(join(tmpdir(), "barge-install-"));
});

afterEach(async () => {
  if (testRoot) await rm(testRoot, { recursive: true, force: true });
});

describe("install.sh", () => {
  test("installs the latest release and the installed binary runs", async () => {
    const fixture = startFixture();
    try {
      const dir = join(testRoot, "bin");
      const result = await runInstaller({ base: fixture.base, dir });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`installed barge ${installFixtureVersion}`);
      const installed = join(dir, "barge");
      expect(await readFile(installed, "utf8")).toBe(installFixtureBinary);
      expect(((await stat(installed)).mode & 0o111)).not.toBe(0);
      const check = Bun.spawn([installed, "version"], { stdout: "pipe" });
      const [output, code] = await Promise.all([new Response(check.stdout).text(), check.exited]);
      expect(code).toBe(0);
      expect(output.trim()).toBe(installFixtureVersion);
    } finally {
      fixture.close();
    }
  });

  test("installs an explicitly requested version", async () => {
    const fixture = startFixture();
    try {
      const dir = join(testRoot, "bin");
      const result = await runInstaller({ base: fixture.base, dir, args: ["--version", installFixtureVersion] });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`installed barge ${installFixtureVersion}`);
    } finally {
      fixture.close();
    }
  });

  test("a corrupt download is refused and the existing binary is preserved", async () => {
    const fixture = startFixture({ corrupt: true });
    try {
      const dir = join(testRoot, "bin");
      await mkdir(dir, { recursive: true });
      const existing = join(dir, "barge");
      await writeFile(existing, "PRE-EXISTING");
      const result = await runInstaller({ base: fixture.base, dir });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("checksum mismatch");
      expect(await readFile(existing, "utf8")).toBe("PRE-EXISTING");
      // No staged temp file may leak into the install directory.
      expect(await readdir(dir)).toEqual(["barge"]);
    } finally {
      fixture.close();
    }
  });

  test("reports when no release has been published yet", async () => {
    const fixture = startFixture({ noRelease: true });
    try {
      const result = await runInstaller({ base: fixture.base, dir: join(testRoot, "bin") });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("no release has been published");
    } finally {
      fixture.close();
    }
  });

  test("reports a missing asset for an unknown --version", async () => {
    const fixture = startFixture();
    try {
      const result = await runInstaller({
        base: fixture.base,
        dir: join(testRoot, "bin"),
        args: ["--version", "9.9.9"],
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("could not download");
    } finally {
      fixture.close();
    }
  });

  test("rejects a --version with characters outside a release identifier", async () => {
    const fixture = startFixture();
    try {
      const result = await runInstaller({
        base: fixture.base,
        dir: join(testRoot, "bin"),
        args: ["--version", "1.2.3/../../etc"],
      });
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("invalid version");
    } finally {
      fixture.close();
    }
  });

  test("rejects unsupported platforms without downloading", async () => {
    const fixture = startFixture();
    try {
      const result = await runInstaller({
        base: fixture.base,
        dir: join(testRoot, "bin"),
        env: { BARGE_INSTALL_OS: "Plan9" },
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("Linux and macOS");
    } finally {
      fixture.close();
    }
  });

  test("prints actionable PATH guidance when the install dir is not on PATH", async () => {
    const fixture = startFixture();
    try {
      const dir = join(testRoot, "bin");
      const result = await runInstaller({
        base: fixture.base,
        dir,
        env: { PATH: "/usr/bin:/bin" },
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`export PATH="${dir}:$PATH"`);
    } finally {
      fixture.close();
    }
  });
});
