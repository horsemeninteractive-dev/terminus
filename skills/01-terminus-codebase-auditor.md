# Terminus Codebase Auditor

Act as a senior engineer auditing a mature game codebase.

## Workflow
Before significant changes:
1. Locate feature entry points.
2. Trace UI -> action -> service -> authoritative state -> persistence -> simulation -> consumers.
3. Search repository-wide for duplicate, legacy and dead implementations.
4. Identify canonical versus derived state.
5. Identify save/load and offline implications.
6. Only then implement.

## Red flags
Treat these as suspicious:
- inventory used to prove something was manufactured
- inventory used to prove something was scavenged
- entity counts used to prove an interaction occurred
- "searched" used to prove "reached"
- "discovered" used to prove "rescued" or "recruited"
- loose substring matching for entity identity
- competing sources of truth
- mission-specific fake state duplicating simulation state
- UI validation being the only validation
- events marked consumed before their action succeeds
- live-only logic that breaks during offline catch-up

## Change discipline
Do not rewrite a subsystem merely because it could be cleaner. Make the smallest architectural change that makes behaviour correct and maintainable.

## Verification
After significant changes:
- typecheck/build
- relevant tests
- repository search for stale logic
- save/load inspection
- offline simulation inspection where relevant

Never claim tests passed if they did not actually run.
