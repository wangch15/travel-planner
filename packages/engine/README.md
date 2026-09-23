# Shared trip engine

`@travel-planner/engine` belongs to the public template. Existing trip repositories keep their content under `trips/` and use the existing root CLI commands.

The package owns schema checks, static CommonJS data interpretation, snapshots, pure document rendering and single-day source edits. It has no Electron, account, GitHub or deployment credentials.

## Interfaces

- `parseLiteralModule(source)` interprets only allowlisted literal AST nodes. It supports const references, plain data and the exact browser/CommonJS export guard. It never executes imported JavaScript.
- `readTripSnapshot(directory, {slug, includePhotoBytes})` reads fixed data filenames and selected photos, validates the assembled trip, and returns a digest plus the same bytes used to build the snapshot. Private `docs/`, profile, Git and auth data are excluded.
- `createRenderer(trustedAssetsRoot)` from `@travel-planner/engine/render` creates an HTML renderer. The application supplies its own trusted `src/` path; imported project scripts are not used. Existing CLI build passes its legacy-loaded data to the same renderer.
- `replaceDay(source, dayId, replacementDay)` from `day-edit.cjs` preserves source outside one day AST range. IDs/dates and unrelated exports remain unchanged. Full trip validation and human confirmation belong to the desktop controller.

The old `scripts/lib/schema.js` remains a compatibility export. The CLI's existing `loadTrip()` still executes trusted local JS as before; the desktop must use the static snapshot reader instead.

## Limits and evidence

Text limits: 4 MiB per file, 16 MiB total. Photos: 16 MiB each, 128 MiB total. The parser bounds nesting and AST size. Links, unsafe filenames, prototype keys and executable expressions are refused.

Directory identity/canonical checks reject persistent path replacements before accepting a snapshot. They are not an OS sandbox or a guarantee against a same-UID process precisely swapping paths between every check. The desktop uses a bounded worker for parsing and an isolated preview renderer.

`npm test --workspaces --workspace=@travel-planner/engine` runs the package tests. Fixtures use `_example` and temporary fake projects; no real private repository belongs in this package or its tests.
