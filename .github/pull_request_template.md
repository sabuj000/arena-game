## What

<!-- What changed, and why. -->

## API change checklist

Skip this section if the PR does not touch `openapi/arena.json`, the sandbox, or the SDK.

- [ ] The change was made in `sabuj000/arena-docs` first, and that PR is merged
- [ ] `openapi/arena.json` is copied from arena-docs `main` (`npm run check:spec-drift` passes)
- [ ] `npm run gen:sdk` was run and the generated files are committed
- [ ] The sandbox matches the spec, with a contract test scenario for any new error code
- [ ] The docs in arena-docs describe the change

## Checks

- [ ] `npm test` and `npm run typecheck` pass
- [ ] Not tried in a browser or on a phone? Say so under "Not verified"

## Not verified

<!-- What you could not check. -->
