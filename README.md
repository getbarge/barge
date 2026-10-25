# Barge

Hand active coding work to a disposable cloud worker and keep working after your laptop disconnects. Barge packages your repository state (or starts from a GitHub ref), runs your coding agent in the cloud, and returns a draft pull request with a live session dashboard.

This repository distributes the installable agent skills and the `barge` CLI. The application itself is developed in the private Barge repository; the skills here are synced from it automatically.

## Install

### 1. Install the plugin (skills)

**Claude Code**

```sh
claude plugin marketplace add getbarge/barge
claude plugin install barge@getbarge
```

**Codex**

```sh
codex plugin marketplace add getbarge/barge
codex plugin add barge@getbarge/barge
```

If Codex resolved the marketplace under a different name, `codex plugin marketplace list` shows the configured names.

### 2. Install the CLI

Linux or macOS:

```sh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/getbarge/barge/main/install.sh)"
```

The installer downloads the release for your platform, verifies its SHA-256 against the release's `SHA256SUMS`, and installs it atomically into `~/.local/bin` — no Bun, no root, no shell-profile edits (it prints the `export PATH=` line when needed). Pin a version with `--version X.Y.Z`; re-run with a newer version to update. Windows: download `barge-<version>-windows-x64.exe` from [Releases](https://github.com/getbarge/barge/releases) manually.

Verify with `barge version`.

### 3. Connect your account

Run the setup skill from your agent — `/barge:handoff-setup`. It opens [getbarge.dev](https://getbarge.dev) in your browser; sign in and approve, and the CLI is bound to your account (your credential acts for you, not for the whole service).

Barge is in an invite-only beta: request admission at [getbarge.io](https://getbarge.io). Setup authenticates an existing admitted account; it does not create or provision a backend.

### 4. Start your first handoff

- `/barge:handoff BSH-123` — start a Linear issue fresh in the cloud
- `/barge:handoff` — hand off your current local work; your laptop can disconnect immediately

Both return a session URL you can watch from any browser.

## Compatibility

- Plugin version 0.1.1. Requires the `barge` CLI 0.1.0 or newer.
- Supported agents: Claude Code and Codex. Other harnesses are untested and not claimed.
- Supported CLI platforms: linux-x64, linux-arm64, darwin-x64, darwin-arm64, windows-x64 (per-platform runtime smoke runs before each release publishes).

## License

[MIT](LICENSE)
