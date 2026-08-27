import { isDeepStrictEqual } from "node:util";
import type {
  CaseEvaluation,
  Failure,
  Layer,
  Observation,
  PrivateOracle,
  PublicCase
} from "../contracts/schemas";

function getPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (
      current !== null &&
      typeof current === "object" &&
      segment in current
    ) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, value);
}

function classifyFailure(
  channel: Failure["diffs"][number]["channel"],
  path: string
): Failure["error_type"] {
  if (channel === "runtime" && path === "checkpoint") return "artifact_failure";
  if (channel === "runtime") return "runtime_error";
  if (channel === "ui") return "state_ui_inconsistency";
  if (channel === "event") return "missing_event";
  if (path === "status") return "terminal_condition_error";
  if (path === "score" || path === "lives" || path.includes("count")) {
    return "state_effect_error";
  }
  return "state_transition_error";
}

function checkpointFailure(
  oracle: PrivateOracle["checkpoints"][number],
  observation: Observation | undefined
): Failure | null {
  const diffs: Failure["diffs"] = [];

  if (!observation) {
    diffs.push({
      channel: "runtime",
      path: "checkpoint",
      expected: oracle.id,
      actual: "missing"
    });
  } else {
    for (const [path, expected] of Object.entries(oracle.expected.state)) {
      const actual = getPath(observation.state, path);
      if (!isDeepStrictEqual(actual, expected)) {
        diffs.push({ channel: "state", path, expected, actual });
      }
    }
    for (const [path, expected] of Object.entries(oracle.expected.ui)) {
      const actual = getPath(observation.ui, path);
      if (!isDeepStrictEqual(actual, expected)) {
        diffs.push({ channel: "ui", path, expected, actual });
      }
    }
    for (const eventType of oracle.expected.event_types) {
      if (!observation.event_types.includes(eventType)) {
        diffs.push({
          channel: "event",
          path: eventType,
          expected: "present",
          actual: "missing"
        });
      }
    }
    for (const error of observation.runtime_errors) {
      diffs.push({
        channel: "runtime",
        path: "browser",
        expected: "no error",
        actual: error
      });
    }
  }

  if (diffs.length === 0) return null;
  const first = diffs[0];
  if (!first) return null;
  return {
    action_index: oracle.action_index,
    checkpoint_id: oracle.id,
    layer: diffs.some((diff) => diff.channel === "runtime")
      ? "L1"
      : oracle.layer,
    requirement_ids: oracle.requirement_ids,
    error_type: classifyFailure(first.channel, first.path),
    diffs
  };
}

function gateStatus(
  layer: Layer,
  failures: Failure[],
  oracle: PrivateOracle
): CaseEvaluation["gates"][Layer] {
  const hasAssertions = oracle.checkpoints.some((item) => item.layer === layer);
  if (!hasAssertions) return "unverified";
  return failures.some((failure) => failure.layer === layer) ? "fail" : "pass";
}

function terminalMatches(
  oracle: PrivateOracle,
  observations: Observation[]
): boolean {
  const terminal = [...oracle.checkpoints].reverse().find((item) => item.terminal);
  if (!terminal) return false;
  return checkpointFailure(
    terminal,
    observations.find((item) => item.checkpoint_id === terminal.id)
  ) === null;
}

export function evaluateCase(
  publicCase: PublicCase,
  oracle: PrivateOracle,
  observations: Observation[]
): CaseEvaluation {
  const failures = oracle.checkpoints
    .map((checkpoint) =>
      checkpointFailure(
        checkpoint,
        observations.find((item) => item.checkpoint_id === checkpoint.id)
      )
    )
    .filter((value): value is Failure => value !== null)
    .sort((a, b) => a.action_index - b.action_index);

  const rawL1 = gateStatus("L1", failures, oracle);
  const rawL2 = gateStatus("L2", failures, oracle);
  const rawL3 = gateStatus("L3", failures, oracle);
  const L2 = rawL1 === "pass" ? rawL2 : "blocked";
  const L3 =
    rawL1 !== "pass"
      ? "blocked"
      : rawL2 === "fail" && rawL3 === "pass"
        ? "observed_not_certified"
        : rawL3;

  const highestCertifiedLevel =
    rawL1 !== "pass"
      ? "none"
      : rawL2 !== "pass"
        ? "L1"
        : rawL3 !== "pass"
          ? "L2"
          : "L3";

  const finalOutcomeCorrect = terminalMatches(oracle, observations);
  const processCorrect = failures.length === 0;

  return {
    schema_version: "prd2play.evaluation.v1",
    case_id: publicCase.id,
    difficulty: publicCase.difficulty.level,
    final_outcome_correct: finalOutcomeCorrect,
    process_correct: processCorrect,
    lucky_pass_detected: finalOutcomeCorrect && !processCorrect,
    gates: { L1: rawL1, L2, L3 },
    highest_certified_level: highestCertifiedLevel,
    first_failure: failures[0] ?? null,
    all_failures: failures
  };
}
