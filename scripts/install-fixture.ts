/**
 * Shared fixture constants for install.sh's deterministic tests: the installer
 * detects the host platform, so the fixture serves an asset named for whatever
 * platform the test process runs on.
 */
import { createHash } from "node:crypto";

export const installFixtureVersion = "1.2.3";

/** A stand-in "binary": a runnable script whose `version` command prints the fixture version. */
export const installFixtureBinary = "#!/bin/sh\necho 1.2.3\n";

const fixtureOs = process.platform === "darwin" ? "darwin" : "linux";
const fixtureArch = process.arch === "arm64" ? "arm64" : "x64";

export const installFixtureAsset = `barge-${installFixtureVersion}-${fixtureOs}-${fixtureArch}`;

export const installFixtureDigest = createHash("sha256").update(installFixtureBinary).digest("hex");
