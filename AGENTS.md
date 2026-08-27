# Repository guidance

PRD2Play is a personal/activity project for the 2026 Tencent Rhino-Bird Hy3
practical task. It is not an official Tencent release.

## Non-negotiable rules

- Never commit API keys, managed endpoint credentials, or raw private game data.
- A natural-language PRD is not an oracle. Gold expectations live only in
  private oracle files and must not enter generation prompts.
- `jsdom` results are not evidence that a Canvas/WebGL game renders or plays.
  Browser certification must come from Playwright Chromium.
- Distinguish the first observable divergence from the predicted root cause.
- Continue a failing playthrough to the terminal state when safe so that
  lucky-pass and error-compensation cases remain detectable.
- Do not claim formal benchmark results from the tracked sample fixtures.

## Required verification

Run `pnpm run check` for schema, unit, and jsdom checks. Run
`pnpm run test:browser` after installing Chromium for the real-browser gate.
