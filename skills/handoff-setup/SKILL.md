---
name: handoff-setup
description: Configure this machine for Barge by opening the dashboard, signing in, and writing local URL/token config. Use when the user says /barge:handoff-setup, wants to set up Barge locally, or a $barge:handoff/`/barge:handoff` run fails because BARGE_URL or BARGE_TOKEN are missing or invalid.
---

# Barge Setup

1. Resolve the control plane URL: an explicitly requested URL, otherwise `BARGE_URL` if already exported, otherwise ask the user for the dashboard URL (the hosted control plane is `https://getbarge.dev`). A `*.fly.dev` app hostname such as `cloud-handoff-control.fly.dev` is a legacy alias that stops resolving once the renamed Fly apps replace the old ones — when the control plane advertises a canonical URL (`barge setup` and `barge check` both surface it; `https://getbarge.dev` on the hosted deployment), prefer that advertised URL over a hardcoded guess.
2. Run `barge setup --url <url>` (omit `--url` if `BARGE_URL` is already exported). It opens the dashboard in a browser, waits for the operator to sign in and approve, then writes `~/.config/barge/config` with a freshly minted CLI token and prints `export` lines for the current shell. When the control plane advertises a canonical URL that differs from the one given, the written config and export lines already carry the canonical URL — passing a legacy alias is enough to migrate it.
3. Validate the result as three separate checks — report each individually rather than a single pass/fail:
   - **`barge` on PATH:** `command -v barge`.
   - **URL reachable:** the control plane's `/healthz` responds.
   - **Token authenticates:** `BARGE_URL=<url> BARGE_TOKEN=<token> barge list` succeeds without a 401.
4. Report which checks passed and which failed. On failure, name the specific missing piece (PATH, URL, or token) instead of a generic error.
5. Never print the token anywhere beyond this local session's own output, and never place it in a URL query string.
