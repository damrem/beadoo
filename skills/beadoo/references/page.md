# Open beadoo

Start the beadoo server on `127.0.0.1:4747`, open the page, and give the user
the URL. Each step runs in Bash.

## Steps

### 1. Check the requirements

```bash
node --version && bd --version
```

beadoo needs Node.js 24 or later and bd 1.3.1 or later on the `PATH`. When one
is missing or older, tell the user, and stop. The step is done when both
versions are high enough.

### 2. Ask the port

```bash
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4747/api/databases
```

- `200` — beadoo runs already. The URL is `http://127.0.0.1:4747/`. Go to
  step 4.
- `000` — the port is free. Go to step 3.
- Each other code — another process holds port 4747. Tell the user, and stop.

### 3. Start the server

With no config file, beadoo shows the `.beads` database of the folder where it
starts. In that case, start it in the folder of the repo that the user wants.

Start the server with `run_in_background`:

```bash
npx --yes beadoo
```

Read its output before you go to step 4:

- `beadoo: <url>` — the server listens. Keep `<url>`.
- `No beads database: …` — the server listens, with no database. Give the
  user that line.
- `Port 4747 is busy: …` — the server stopped. Tell the user, and stop.

### 4. Open the page

When `command -v orca` succeeds, open the page in an Orca browser tab:

```bash
orca tab create --url "<url>"
```

Then print `<url>`, also when Orca opened the tab.

To give the user one bead, print its page:
`http://127.0.0.1:4747/bead?db=<database>&id=<bead id>`. That page shows the
bead alone, and a reload shows the same bead.

## Configuration

beadoo reads `$XDG_CONFIG_HOME/beadoo/config.json`, else
`~/.config/beadoo/config.json`. To show another database, add an entry
`{ "name": "<name>", "path": "<path of the repo>" }` to its `databases` list.
The page refuses a path under `/mnt/`, because the `/mnt/c` clone of a WSL
repo has a store that diverged.

The optional `sessionCommand` is the command that a spawn starts in the new
Orca terminal. beadoo puts the permission mode in `{mode}` and the quoted
prompt in `{prompt}`. The default is
`claude --permission-mode {mode} {prompt}`.

## A database on a Dolt server

A database whose `.beads/metadata.json` gives `"dolt_mode": "server"` reads
its beads from a Dolt server. To let the page open the tunnel to that server,
add a `tunnel` to its entry:

```json
{
  "name": "team",
  "path": "/home/me/team-repo",
  "tunnel": {
    "start": ["ssh", "-fN", "-o", "ExitOnForwardFailure=yes", "-L", "3307:127.0.0.1:3307", "db-host"],
    "stop": ["pkill", "-f", "3307:127.0.0.1:3307 db-host"]
  }
}
```

- Each command is a list: the program, then its arguments. The server runs it
  with no shell, and only from this file.
- The `start` command must return when the tunnel is open, as `ssh -f` does.
  The server stops it after 30 s.
- When the server does not answer, the page shows the database as unreachable,
  with a **Start the tunnel** button.
- The server runs `stop` for each tunnel that it started when it exits.
- The page does not export the beads after a write on a server database.

## Start a session on a bead

When Orca is on the `PATH`, the detail panel and each card of a bead that
nobody holds show a **Spawn** button. Its window has these fields:

- **Worktree kind**: a new worktree, a child of a worktree, an existing
  worktree, or no worktree. "No worktree" is red, and the user must confirm it.
- **Parent worktree** or **Target worktree**: the Orca worktrees of the repo.
  A worktree shows "held by <id>" when another in_progress bead names it.
- **Branch of the session**: for a new worktree or a child only.
- **Session location**: the selected worktree, its parent, or the epic
  worktree.
- **Permission mode**: plan, default, acceptEdits or bypassPermissions.
  bypassPermissions is red, and the user must confirm it.

**Claim and spawn** claims the bead, makes or chooses the Orca worktree, starts
the `sessionCommand` in a new terminal there, and appends one `started` note:

```
started 2026-10-18 09:05 kind=child worktree=/path/child branch=feat/x parent=/path/parent location=worktree mode=plan
```

- Orca must know the repo of the database. Otherwise the panel shows the
  `orca repo add --path <path>` command, and the bead is open again.
- When Orca fails after the worktree exists, the server releases the claim,
  appends a `released` note, and names the worktree that stays.
- The page never removes a worktree. An unclaim or a close changes the bead
  only, and the panel names the worktree of the last `started` note.
