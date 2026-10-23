# beadoo

beadoo shows the beads of a local [beads](https://github.com/steveyegge/beads) database in a web page. It has four views: the epic lanes, a table grouped by epic, the board of one epic, and a dependency graph. The detail panel claims, edits and releases a bead.

## Requirements

- Node.js 24 or later. The server runs its TypeScript files directly.
- bd 1.3.1 or later on the `PATH`. beadoo stops at start when `bd --version` gives an older version.
- Optional: the Orca CLI, `orca`, on the `PATH`. Without Orca, the page shows no spawn button.

## Start

```bash
pnpm install
pnpm build
pnpm start
```

The server listens on `http://127.0.0.1:4747`. The start line gives the link to the first database.

## Configuration

beadoo reads `$XDG_CONFIG_HOME/beadoo/config.json`. When `XDG_CONFIG_HOME` is not set, it reads `~/.config/beadoo/config.json`.

When the file does not exist, beadoo shows the `.beads` database of the folder where you start it.

```json
{
  "databases": [
    { "name": "shop", "path": "/home/me/shop" },
    {
      "name": "remote",
      "path": "/home/me/remote",
      "tunnel": { "start": ["ssh", "-fN", "-L", "3307:127.0.0.1:3307", "db-host"], "stop": ["pkill", "-f", "3307:127.0.0.1:3307"] }
    }
  ],
  "sessionCommand": "claude --permission-mode {mode} {prompt}"
}
```

- Each entry of `databases` gives a `name` for the page and the `path` of the folder that holds `.beads`.
- An optional `tunnel` gives the commands that start and stop the connection to a remote Dolt server. Write each command as a list of strings, with the program first.
- An optional `sessionCommand` is the command that a spawn sends to the new Orca terminal. beadoo puts the permission mode in `{mode}`, and the prompt, quoted for the shell, in `{prompt}`. The default is `claude --permission-mode {mode} {prompt}`.

## Spawn a session

When Orca is on the `PATH`, a bead that you can claim has a **Spawn** button. The button claims the bead, makes or chooses an Orca worktree, and starts the session command in a new terminal of that worktree.

## Claude Code plugin

The repo is also a Claude Code plugin. Its `beadoo` skill starts beadoo with `npx beadoo`, and opens the page in an Orca browser tab when `orca` is on the `PATH`.

```bash
claude plugin marketplace add damrem/beadoo
claude plugin install beadoo@beadoo
```

## Development

```bash
pnpm test
pnpm typecheck
```

## License

MIT. See [LICENSE](LICENSE).
