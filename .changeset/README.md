# Changesets

Use `bun changeset` after making a user-facing change that should affect a release version.

For this repo, prefer:

- `patch` for small fixes and incremental desktop updates
- `minor` for meaningful new features
- `major` only when you intentionally want breaking change semantics

When you are ready to release, run `bun run release:prepare` and commit the generated version changes to `main`.

Once that commit lands on `main`, GitHub Actions will:

- run CI for `check`, `typecheck`, and `test`
- create the matching `v*` tag from `apps/desktop/package.json`
- build and publish the macOS release from that tag

The release workflow also verifies that the tag matches the desktop package version.

By default, releases can still publish without Apple signing and notarization secrets. If you later want to enforce fully signed public releases, set the GitHub Actions variable `REQUIRE_MACOS_SIGNING=true`.
