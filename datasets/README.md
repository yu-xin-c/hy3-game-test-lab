# Pilot dataset

The tracked dataset is a project-authored smoke corpus, not a formal benchmark
result. It exists so that a fresh clone can validate schemas, run a real-browser
playthrough, reproduce first-failure localization, and inspect the result format
without an API key.

Each case contains:

- `case.json`: public PRD, controls, requirements, difficulty rationale, and
  scenario. It may be shown to Hy3.
- `oracle.private.json`: hidden checkpoints, expected state/UI evidence, and
  fault ground truth. It must not enter generation prompts.

The five pilot cases cover:

1. a clean control for false-positive measurement;
2. a simple score fault with a wrong terminal result;
3. an error-compensation case whose final result is correct;
4. a logic-correct but stale-HUD failure;
5. a cross-layer case where the UI hides an intermediate logic error.

Formal experiments should add independently reviewed games, more game families,
native Hy3 failures, and an immutable run manifest. See
`docs/dataset-card.md`.

