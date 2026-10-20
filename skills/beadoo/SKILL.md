---
name: beadoo
description: Show the beads of a local beads database in beadoo, a web page. `page` starts beadoo on 127.0.0.1:4747 with `npx beadoo`, and opens it in an Orca browser tab when Orca is installed. The page has three views (epic lanes, a table grouped by epic, the board of one epic) and a detail panel that claims and edits a bead. Use it when the user asks "open beadoo", "open the beads page", "show my beads in the browser", "ouvre beadoo", "ouvre la page des beads", "montre mes beads dans le navigateur".
argument-hint: "page"
---

# beadoo

beadoo is the npm package `beadoo`: a `node:http` server and a React page. The
server reads each database through `bd --readonly --json`. It writes a claim or
an edit through one serial queue, and runs `bd export` after each write when
the repo tracks `.beads/issues.jsonl`.

## Choose the action

Take the action from the first word of `$ARGUMENTS`, or from the request. Read
the file of the action, and do all its steps.

| Action | When | File |
|---|---|---|
| `page` | The user wants to see the beads in the browser | [`references/page.md`](references/page.md) |

When the request matches no action, do the `page` action.
