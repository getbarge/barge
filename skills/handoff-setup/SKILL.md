---
name: handoff-setup
description: Configure this machine for Barge by installing the CLI if needed, opening the dashboard, signing in, and connecting the user's own Barge account. Use when the user says /barge:handoff-setup, wants to set up Barge locally, or a $barge:handoff/`/barge:handoff` run fails because the barge CLI or its credentials are missing or invalid.
argument-hint: "[control-plane-url]"
---

# Barge Setup

The user's request: $ARGUMENTS

1. Resolve the control plane URL: an explicitly requested URL, otherwise `BARGE_URL` if already exported, otherwise ask the user for the dashboard URL (the hosted control plane is `https://getbarge.dev`). A `*.fly.dev` app hostname such as `cloud-handoff-control.fly.dev` is a legacy alias that stops resolving once the renamed Fly apps replace the old ones — when the control plane advertises a canonical URL (`barge setup` and `barge check` both surface it; `https://getbarge.dev` on the hosted deployment), prefer that advertised URL over a hardcoded guess.
2. Ensure the `barge` CLI is installed, with the user's explicit approval for any download:
   - If `command -v barge` succeeds, check `barge version`. The plugin needs 0.1.0 or newer; `dev` is a source build and counts as current. On an older version, offer the same installer upgrade (same approval) — never replace a working installation without asking, and if the user declines, continue with the existing version and note it.
   - If it is missing, resolve the latest release version from the public distribution repo's machine-readable manifest (`https://github.com/getbarge/barge/releases/latest/download/release.json`), then explain what will happen — install `barge <version>` into `~/.local/bin` (no root, no Bun, no shell-profile edits; it prints the `export PATH=` line when the directory is not on `PATH`) — and ask for approval before downloading anything. On approval run the public installer:
     `sh -c "$(curl -fsSL https://raw.githubusercontent.com/getbarge/barge/main/install.sh)" -- --version <version>`
     then verify with `barge version`.
   - Recovery paths, reported specifically rather than guessed: the manifest or installer 404s → no release has been published yet; say so and let the user decide (wait, or build from the Barge source repository with Bun — operators only). The platform is not Linux/macOS → on Windows, direct the user to download `barge-<version>-windows-x64.exe` from the releases page manually. The user declines → stop and print the manual install instructions; do not proceed to sign-in. The installer reports a checksum mismatch or a binary that will not run → report it verbatim; the user's existing installation is untouched.
3. Run `barge setup --url <url>` (omit `--url` if `BARGE_URL` is already exported). It opens the dashboard in a browser, waits for the user to sign in and approve, then writes `~/.config/barge/config` with a freshly minted CLI token owned by the approving account, and reports the saved config path and connected URL without printing the token. The CLI reads that config automatically; no credential exports are needed. When the control plane advertises a canonical URL that differs from the one given, the written config and connection confirmation already carry the canonical URL — passing a legacy alias is enough to migrate it. If the browser approval expires or is declined, re-run `barge setup`; if sign-in is refused for lack of admission, direct the user to request access at `https://getbarge.io`.
4. Validate the result as three separate checks — report each individually rather than a single pass/fail. The CLI reads the stored config itself, so none of these checks needs the token:
   - **`barge` on PATH and its version:** `command -v barge && barge version`.
   - **URL reachable:** the control plane's `/healthz` responds.
   - **Credentials authenticate:** `barge list` succeeds without a 401.
5. Report which checks passed and which failed. On failure, name the specific missing piece (PATH, URL, or credentials) instead of a generic error.
6. Never print, export, or copy the token anywhere in the conversation, logs, or validation commands; `barge setup` stores it without printing it. Never place it in a URL query string. Do not read `~/.config/barge/config` into the conversation.
