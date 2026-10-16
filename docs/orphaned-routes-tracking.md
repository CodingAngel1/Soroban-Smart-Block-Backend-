# Router Registry Status

Router counts are intentionally not copied into this document. The validator
is the source of truth and prints the current mounted, pending-schema, orphaned,
and conflicting route counts:

```bash
npm run validate-routes
```

The strict zero-orphan budget command is:

```bash
npm run validate-routes:ci
```

The allowed orphan count is set by the `validate-routes:ci` script in
`package.json` and `ORPHANED_ROUTER_BUDGET` in
`scripts/validate-routes.ts`. This command also fails on exact route conflicts
and stale pending-schema allowlist entries. If validation fails, use its
reported file and route lists to resolve the current issues; do not update
hand-maintained counts here.

The README's architecture and CI sections link to the commands that produce
live counts. `npm run docs:check` guards those sections against reintroducing
stale, hard-coded counts.
