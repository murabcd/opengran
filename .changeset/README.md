# Changesets

Use `bun changeset` after making a user-facing change that should affect a release version.

For this repo, prefer:

- `patch` for small fixes and incremental desktop updates
- `minor` for meaningful new features
- `major` only when you intentionally want breaking change semantics

The version workflow will open or update a release PR from merged changesets on `main`.
