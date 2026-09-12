import { isDeepStrictEqual } from "node:util";
import type {
  CaseEvaluation,
  Failure,
  Layer,
  Observation,
  PrivateOracle,
  PublicCase
} from "../contracts/schemas";
import { evaluatePhysicsInvariants } from "./physics";

const missingEvidence = Object.freeze({
  kind: "missing"
});

function reportableActual(value: unknown): unknown {
  return value === undefined ? missingEvidence : value;
}

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
  if (
    channel === "runtime" &&
    (path === "checkpoint" || path.startsWith("observation."))
  ) return "artifact_failure";
  if (channel === "runtime") return "runtime_error";
  if (channel === "ui") return "state_ui_inconsistency";
  if (channel === "event") return "missing_event";
  if (channel === "physics") return "invariant_violation";
  if (path === "status") return "terminal_condition_error";
  if (path === "score" || path === "lives" || path.includes("count")) {
    return "state_effect_error";
  }
  return "state_transition_error";
}

function checkpointFailures(
  oracle: PrivateOracle["checkpoints"][number],
  observation: Observation | undefined,
  options: {
    includePhysics?: boolean;
    includeRuntime?: boolean;
  } = {}
): Failure[] {
  const includePhysics = options.includePhysics ?? true;
  const includeRuntime = options.includeRuntime ?? true;
  const runtimeDiffs: Failure["diffs"] = [];
  const evidenceDiffs: Failure["diffs"] = [];
  const physicsViolations = observation && includePhysics
    ? evaluatePhysicsInvariants(oracle.expected.physics, observation.samples)
    : [];

  if (!observation) {
    return [{
      action_index: oracle.action_index,
      checkpoint_id: oracle.id,
      layer: "L1",
      requirement_ids: oracle.requirement_ids,
      error_type: "artifact_failure",
      diffs: [{
        channel: "runtime",
        path: "checkpoint",
        expected: oracle.id,
        actual: "missing"
      }]
    }];
  }

  if (includeRuntime && observation.action_index !== oracle.action_index) {
    runtimeDiffs.push({
      channel: "runtime",
      path: "observation.action_index",
      expected: oracle.action_index,
      actual: observation.action_index
    });
  }
  for (const [path, expected] of Object.entries(oracle.expected.state)) {
    const actual = getPath(observation.state, path);
    const tolerance = oracle.expected.state_tolerances?.[path];
    const matches = tolerance === undefined ? isDeepStrictEqual(actual, expected)
      : typeof actual === "number" && Number.isFinite(actual) && typeof expected === "number" &&
        Math.abs(actual - expected) <= tolerance + Number.EPSILON * Math.max(1, Math.abs(actual), Math.abs(expected)) * 4;
    if (!matches) {
      evidenceDiffs.push({
        channel: "state",
        path,
        expected: tolerance === undefined ? expected : { value: expected, absolute_tolerance: tolerance },
        actual: reportableActual(actual)
      });
    }
  }
  for (const [path, rule] of Object.entries(oracle.expected.ui_text ?? {})) {
    const actual = getPath(observation.ui, path);
    const normalize = (text: string) => text.trim().replace(/\s+/g, " ");
    const matches = typeof actual === "string" && (rule.mode === "nonempty"
      ? normalize(actual).length > 0
      : rule.ignore_case
        ? normalize(actual).toLowerCase() === normalize(rule.value).toLowerCase()
        : normalize(actual) === normalize(rule.value));
    if (!matches) evidenceDiffs.push({ channel: "ui", path, expected: rule, actual: reportableActual(actual) });
  }
  for (const [path, expected] of Object.entries(oracle.expected.ui)) {
    const actual = getPath(observation.ui, path);
    if (!isDeepStrictEqual(actual, expected)) {
      evidenceDiffs.push({
        channel: "ui",
        path,
        expected,
        actual: reportableActual(actual)
      });
    }
  }
  for (const eventType of oracle.expected.event_types) {
    const types = oracle.expected.event_scope === "since_previous_checkpoint"
      ? observation.event_types_since_checkpoint ?? [] : observation.event_types;
    if (!types.includes(eventType)) {
      evidenceDiffs.push({
        channel: "event",
        path: eventType,
        expected: "present",
        actual: "missing"
      });
    }
  }
  if (includeRuntime) {
    if (observation.runtime_error_evidence.length > 0) {
      for (const error of observation.runtime_error_evidence) {
        runtimeDiffs.push({
          channel: "runtime",
          path: "browser",
          expected: "no error",
          actual: error.message
        });
      }
    } else for (const error of observation.runtime_errors) {
      runtimeDiffs.push({
        channel: "runtime",
        path: "browser",
        expected: "no error",
        actual: error
      });
    }
  }

  const failures: Failure[] = [];
  if (runtimeDiffs.length > 0) {
    const firstRuntime = [...observation.runtime_error_evidence]
      .sort((left, right) => left.elapsed_ms - right.elapsed_ms)[0];
    failures.push({
      action_index: firstRuntime?.action_index ?? oracle.action_index,
      ...(firstRuntime?.frame_index === null ||
        firstRuntime?.frame_index === undefined
        ? {}
        : { frame_index: firstRuntime.frame_index }),
      ...(firstRuntime ? { elapsed_ms: firstRuntime.elapsed_ms } : {}),
      checkpoint_id: oracle.id,
      layer: "L1",
      requirement_ids: oracle.requirement_ids,
      error_type: classifyFailure("runtime", runtimeDiffs[0]?.path ?? "browser"),
      diffs: runtimeDiffs
    });
  }
  for (const physics of physicsViolations) {
    failures.push({
      action_index: physics.action_index ?? oracle.action_index,
      ...(physics.sample_index === undefined
        ? {}
        : { sample_index: physics.sample_index }),
      ...(physics.frame_index === undefined
        ? {}
        : { frame_index: physics.frame_index }),
      ...(physics.tick === undefined ? {} : { tick: physics.tick }),
      ...(physics.elapsed_ms === undefined
        ? {}
        : { elapsed_ms: physics.elapsed_ms }),
      checkpoint_id: oracle.id,
      layer: physics.kind === "unverified" ? "L1" : oracle.layer,
      requirement_ids: oracle.requirement_ids,
      error_type: physics.error_type,
      diffs: [{
        channel: "physics",
        path: physics.path,
        expected: physics.expected,
        actual: physics.actual
      }]
    });
  }
  if (evidenceDiffs.length > 0) {
    const first = evidenceDiffs[0];
    if (first) {
      failures.push({
        action_index: oracle.action_index,
        checkpoint_id: oracle.id,
        layer: oracle.layer,
        requirement_ids: oracle.requirement_ids,
        error_type: classifyFailure(first.channel, first.path),
        diffs: evidenceDiffs
      });
    }
  }
  return failures;
}

function gateStatus(
  layer: Layer,
  failures: Failure[],
  oracle: PrivateOracle
): CaseEvaluation["gates"][Layer] {
  if (failures.some((failure) => failure.layer === layer)) return "fail";
  const hasAssertions = oracle.checkpoints.some((item) => item.layer === layer);
  if (!hasAssertions) return "unverified";
  return "pass";
}

function terminalMatches(
  oracle: PrivateOracle,
  observations: Observation[]
): boolean {
  const terminal = [...oracle.checkpoints].reverse().find((item) => item.terminal);
  if (!terminal) return false;
  const observation = observations.find(
    (item) => item.checkpoint_id === terminal.id
  );
  if (!observation || observation.action_index !== terminal.action_index) {
    return false;
  }
  return checkpointFailures(
    terminal,
    observation,
    { includePhysics: false, includeRuntime: false }
  ).length === 0;
}

export function evaluateCase(
  publicCase: PublicCase,
  oracle: PrivateOracle,
  observations: Observation[]
): CaseEvaluation {
  const failures = oracle.checkpoints
    .flatMap((checkpoint) =>
      checkpointFailures(
        checkpoint,
        observations.find((item) => item.checkpoint_id === checkpoint.id)
      )
    )
    .sort((a, b) =>
      a.action_index - b.action_index ||
      (a.elapsed_ms ?? Number.POSITIVE_INFINITY) -
        (b.elapsed_ms ?? Number.POSITIVE_INFINITY) ||
      Number(a.layer !== "L1") - Number(b.layer !== "L1")
    );

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
    schema_version: "gametestlab.evaluation.v2",
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
