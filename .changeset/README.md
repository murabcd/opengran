# Changesets

Use `bun changeset` after making a user-facing change that should affect a release version.

For this repo, prefer:

- `patch` for small fixes and incremental desktop updates
- `minor` for meaningful new features
- `major` only when you intentionally want breaking change semantics

When you are ready to release, run `bun run release:prepare`, commit the generated version changes directly to `main`, and then push a matching `v*` tag for the desktop release workflow.
