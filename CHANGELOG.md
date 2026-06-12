# Changelog

## 0.2.0 - 2026-06-12

Changes since `0.1.0`.

### Added

- Add Cloudflare Vitest Worker integration coverage for `gait.step`,
  `gait.sleep`, `gait.event`, custom emitter bindings, and workflow error
  cases.
- Add complete README coverage for the current API, event model, durable event
  wait wrapper, typed emitter, custom binding usage, and development commands.

### Changed

- Simplify emitted gait event contexts and keep automatic numeric
  `timestamp` injection inside gait helpers.
- Keep `gait.event` lifecycle emissions inside a durable Workflow step wrapper
  while delegating the actual wait to native `step.waitForEvent`.
- Scope `gait.event` wrapper step names by logical wait name
  (`gait:event/<name>`) so repeated waits report counts per event name.

### Fixed

- Preserve gait semantics for event waits across Workflow replay/restart
  boundaries.
- Preserve logical event wait counts when a workflow waits for multiple event
  names in the same run.
