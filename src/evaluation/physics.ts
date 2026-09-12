import type {
  Failure,
  PhysicsInvariant,
  TimelineSample
} from "../contracts/schemas";

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PlatformBox extends Box {
  id: string;
}

export interface PhysicsViolation {
  invariant_id: string;
  invariant_type: PhysicsInvariant["type"];
  kind: "violation" | "unverified";
  error_type: Failure["error_type"];
  action_index?: number;
  sample_index?: number;
  frame_index?: number;
  tick?: number;
  elapsed_ms?: number;
  path: string;
  expected: unknown;
  actual: unknown;
}

const errorTypeByInvariant: Record<
  PhysicsInvariant["type"],
  PhysicsViolation["error_type"]
> = {
  no_penetration: "physics_penetration",
  no_tunneling: "physics_tunneling",
  grounded_has_support: "physics_unsupported_grounding",
  jump_apex_reaches: "physics_jump_apex",
  eventually_supported: "physics_support_timeout",
  world_bounds: "physics_world_bounds"
};

function getPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current !== null && typeof current === "object" && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBox(value: unknown): Box | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const x = finiteNumber(record.x);
  const y = finiteNumber(record.y);
  const width = finiteNumber(record.width ?? record.w);
  const height = finiteNumber(record.height ?? record.h);
  if (x === null || y === null || width === null || height === null) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function readPlayer(sample: TimelineSample, path: string): Box | null {
  return readBox(getPath(sample.state, path));
}

function playerRecord(
  sample: TimelineSample,
  path: string
): Record<string, unknown> | null {
  const value = getPath(sample.state, path);
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readPlatforms(sample: TimelineSample, path: string): PlatformBox[] | null {
  const value = getPath(sample.state, path);
  if (!Array.isArray(value)) return null;
  const platforms: PlatformBox[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }
    const id = (item as Record<string, unknown>).id;
    const box = readBox(item);
    if (typeof id !== "string" || !box) return null;
    platforms.push({ id, ...box });
  }
  return platforms;
}

function selectedPlatforms(
  platforms: PlatformBox[],
  platformId: string | undefined
): PlatformBox[] {
  return platformId
    ? platforms.filter((platform) => platform.id === platformId)
    : platforms;
}

function right(box: Box): number {
  return box.x + box.width;
}

function bottom(box: Box): number {
  return box.y + box.height;
}

function horizontalOverlap(left: Box, rightBox: Box): number {
  return Math.min(right(left), right(rightBox)) - Math.max(left.x, rightBox.x);
}

function overlap(left: Box, rightBox: Box): { x: number; y: number } {
  return {
    x: horizontalOverlap(left, rightBox),
    y: Math.min(bottom(left), bottom(rightBox)) - Math.max(left.y, rightBox.y)
  };
}

function boxesEqual(left: Box, rightBox: Box, epsilon: number): boolean {
  return Math.abs(left.x - rightBox.x) <= epsilon &&
    Math.abs(left.y - rightBox.y) <= epsilon &&
    Math.abs(left.width - rightBox.width) <= epsilon &&
    Math.abs(left.height - rightBox.height) <= epsilon;
}

function samePlatformGeometry(
  previous: PlatformBox[],
  current: PlatformBox[],
  epsilon: number
): boolean {
  if (previous.length !== current.length) return false;
  return previous.every((platform) => {
    const currentPlatform = current.find((item) => item.id === platform.id);
    return Boolean(currentPlatform && boxesEqual(platform, currentPlatform, epsilon));
  });
}

function sweptBoxEntry(
  previous: Box,
  current: Box,
  platform: Box,
  epsilon: number
): number | null {
  if (
    Math.abs(previous.width - current.width) > epsilon ||
    Math.abs(previous.height - current.height) > epsilon
  ) return null;
  const dx = current.x - previous.x;
  const dy = current.y - previous.y;
  if (Math.abs(dx) <= epsilon && Math.abs(dy) <= epsilon) return null;

  // Move the player's top-left point through the platform expanded by the
  // player size. Shrinking the interval by epsilon excludes legal edge contact.
  const minX = platform.x - previous.width + epsilon;
  const maxX = right(platform) - epsilon;
  const minY = platform.y - previous.height + epsilon;
  const maxY = bottom(platform) - epsilon;

  const axisInterval = (
    start: number,
    delta: number,
    minimum: number,
    maximum: number
  ): { entry: number; exit: number } | null => {
    if (minimum > maximum) return null;
    if (Math.abs(delta) <= Number.EPSILON) {
      return start > minimum && start < maximum
        ? { entry: Number.NEGATIVE_INFINITY, exit: Number.POSITIVE_INFINITY }
        : null;
    }
    const first = (minimum - start) / delta;
    const second = (maximum - start) / delta;
    return { entry: Math.min(first, second), exit: Math.max(first, second) };
  };

  const xInterval = axisInterval(previous.x, dx, minX, maxX);
  const yInterval = axisInterval(previous.y, dy, minY, maxY);
  if (!xInterval || !yInterval) return null;
  const entry = Math.max(xInterval.entry, yInterval.entry);
  const exit = Math.min(xInterval.exit, yInterval.exit);
  return entry <= exit && exit >= 0 && entry < 1 ? Math.max(0, entry) : null;
}

function location(samples: TimelineSample[], preferred?: TimelineSample) {
  const sample = preferred ?? samples[0];
  if (!sample) return {};
  return {
    action_index: sample.action_index,
    sample_index: sample.sample_index,
    ...(sample.frame_index === undefined
      ? {}
      : { frame_index: sample.frame_index }),
    tick: sample.tick,
    elapsed_ms: sample.elapsed_ms
  };
}

function violation(
  invariant: PhysicsInvariant,
  samples: TimelineSample[],
  options: {
    sample?: TimelineSample | undefined;
    expected: unknown;
    actual: unknown;
    kind?: "violation" | "unverified";
  }
): PhysicsViolation {
  return {
    invariant_id: invariant.id,
    invariant_type: invariant.type,
    kind: options.kind ?? "violation",
    error_type: options.kind === "unverified"
      ? "artifact_failure"
      : errorTypeByInvariant[invariant.type],
    ...location(samples, options.sample),
    path: `physics.${invariant.id}`,
    expected: options.expected,
    actual: options.actual
  };
}

function missingGeometry(
  invariant: PhysicsInvariant,
  samples: TimelineSample[],
  sample: TimelineSample | undefined,
  detail: string
): PhysicsViolation {
  return violation(invariant, samples, {
    sample,
    expected: "valid player and platform geometry",
    actual: detail,
    kind: "unverified"
  });
}

function evaluateNoPenetration(
  invariant: Extract<PhysicsInvariant, { type: "no_penetration" }>,
  samples: TimelineSample[]
): PhysicsViolation | null {
  for (const sample of samples) {
    const player = readPlayer(sample, invariant.player_path);
    const platforms = readPlatforms(sample, invariant.platforms_path);
    if (!player || !platforms) {
      return missingGeometry(invariant, samples, sample, "missing or invalid geometry");
    }
    const selected = selectedPlatforms(platforms, invariant.platform_id);
    if (invariant.platform_id && selected.length === 0) {
      return missingGeometry(
        invariant,
        samples,
        sample,
        `platform '${invariant.platform_id}' is missing`
      );
    }
    for (const platform of selected) {
      const amount = overlap(player, platform);
      if (amount.x > invariant.epsilon && amount.y > invariant.epsilon) {
        return violation(invariant, samples, {
          sample,
          expected: { overlap_x_max: invariant.epsilon, overlap_y_max: invariant.epsilon },
          actual: { platform_id: platform.id, overlap_x: amount.x, overlap_y: amount.y }
        });
      }
    }
  }
  return null;
}

function evaluateNoTunneling(
  invariant: Extract<PhysicsInvariant, { type: "no_tunneling" }>,
  samples: TimelineSample[]
): PhysicsViolation | null {
  if (samples.length < 2) {
    return violation(invariant, samples, {
      expected: "at least two consecutive timeline samples",
      actual: { sample_count: samples.length },
      kind: "unverified"
    });
  }
  for (let index = 1; index < samples.length; index += 1) {
    const previousSample = samples[index - 1];
    const sample = samples[index];
    if (!previousSample || !sample) continue;
    if (sample.event_types.includes("game_reset")) continue;

    const previousPlayer = readPlayer(previousSample, invariant.player_path);
    const player = readPlayer(sample, invariant.player_path);
    const previousPlatforms = readPlatforms(
      previousSample,
      invariant.platforms_path
    );
    const platforms = readPlatforms(sample, invariant.platforms_path);
    if (!previousPlayer || !player || !previousPlatforms || !platforms) {
      return missingGeometry(invariant, samples, sample, "missing or invalid geometry");
    }
    const selectedPrevious = selectedPlatforms(
      previousPlatforms,
      invariant.platform_id
    );
    const selected = selectedPlatforms(platforms, invariant.platform_id);
    if (
      invariant.platform_id &&
      (selectedPrevious.length === 0 || selected.length === 0)
    ) {
      return missingGeometry(
        invariant,
        samples,
        sample,
        `platform '${invariant.platform_id}' is missing`
      );
    }
    if (!samePlatformGeometry(selectedPrevious, selected, invariant.epsilon)) {
      return violation(invariant, samples, {
        sample,
        expected: "stable platform geometry during the sampled transition",
        actual: "platform geometry changed or could not be paired",
        kind: "unverified"
      });
    }

    if (sample.tick === previousSample.tick) {
      if (!boxesEqual(previousPlayer, player, invariant.epsilon)) {
        return violation(invariant, samples, {
          sample,
          expected: "unchanged geometry within one game tick",
          actual: { previous_player: previousPlayer, current_player: player },
          kind: "unverified"
        });
      }
      continue;
    }
    if (sample.tick !== previousSample.tick + 1) {
      return violation(invariant, samples, {
        sample,
        expected: "consecutive game ticks for continuous collision checking",
        actual: {
          previous_tick: previousSample.tick,
          current_tick: sample.tick
        },
        kind: "unverified"
      });
    }
    for (const platform of selected) {
      const crossingRatio = sweptBoxEntry(
        previousPlayer,
        player,
        platform,
        invariant.epsilon
      );
      if (crossingRatio !== null) {
        return violation(invariant, samples, {
          sample,
          expected: `collision before crossing platform '${platform.id}'`,
          actual: {
            platform_id: platform.id,
            crossing_ratio: crossingRatio,
            previous_player: previousPlayer,
            current_player: player
          }
        });
      }
    }
  }
  return null;
}

function evaluateGroundedHasSupport(
  invariant: Extract<PhysicsInvariant, { type: "grounded_has_support" }>,
  samples: TimelineSample[]
): PhysicsViolation | null {
  for (const sample of samples) {
    const playerValue = playerRecord(sample, invariant.player_path);
    const player = readPlayer(sample, invariant.player_path);
    const platforms = readPlatforms(sample, invariant.platforms_path);
    if (!playerValue || !player || !platforms) {
      return missingGeometry(invariant, samples, sample, "missing or invalid geometry");
    }
    if (playerValue.grounded !== true) continue;
    const supportId = typeof playerValue.support_id === "string"
      ? playerValue.support_id
      : null;
    const candidates = selectedPlatforms(platforms, invariant.platform_id);
    const support = candidates.find((platform) =>
      (supportId === null || supportId === platform.id) &&
      horizontalOverlap(player, platform) > invariant.epsilon &&
      Math.abs(bottom(player) - platform.y) <= invariant.epsilon
    );
    if (!support) {
      return violation(invariant, samples, {
        sample,
        expected: invariant.platform_id
          ? `grounded on '${invariant.platform_id}'`
          : "grounded with geometric support",
        actual: {
          grounded: true,
          support_id: supportId,
          player_bottom: bottom(player)
        }
      });
    }
  }
  return null;
}

function evaluateJumpApex(
  invariant: Extract<PhysicsInvariant, { type: "jump_apex_reaches" }>,
  samples: TimelineSample[]
): PhysicsViolation | null {
  for (const sample of samples) {
    const jumpEventCount = sample.event_types.filter(
      (eventType) => eventType === invariant.jump_event
    ).length;
    if (jumpEventCount > 1) {
      return violation(invariant, samples, {
        sample,
        expected: `at most one '${invariant.jump_event}' event per timeline sample`,
        actual: { event_count: jumpEventCount },
        kind: "unverified"
      });
    }
  }
  const jumpStarts = samples.flatMap((sample, index) =>
    sample.event_types.includes(invariant.jump_event) ? [index] : []
  );
  if (jumpStarts.length === 0) {
    return violation(invariant, samples, {
      sample: samples.at(-1),
      expected: `event '${invariant.jump_event}' before apex measurement`,
      actual: "missing"
    });
  }
  for (const [jumpNumber, jumpStart] of jumpStarts.entries()) {
    const nextJump = jumpStarts[jumpNumber + 1] ?? samples.length;
    let end = nextJump;
    for (let index = jumpStart + 1; index < nextJump; index += 1) {
      const previous = samples[index - 1];
      const current = samples[index];
      if (
        previous &&
        current &&
        current.event_types.includes("game_reset")
      ) {
        end = index;
        break;
      }
    }
    const jumpSamples = samples.slice(jumpStart, end);
    let apex: { sample: TimelineSample; player: Box; platform: PlatformBox } | null = null;
    let apexIndex = -1;
    for (const [windowIndex, sample] of jumpSamples.entries()) {
      const player = readPlayer(sample, invariant.player_path);
      const platforms = readPlatforms(sample, invariant.platforms_path);
      const platform = platforms?.find((item) => item.id === invariant.platform_id);
      if (!player || !platforms || !platform) {
        return missingGeometry(
          invariant,
          samples,
          sample,
          `player or platform '${invariant.platform_id}' is missing`
        );
      }
      if (!apex || bottom(player) < bottom(apex.player)) {
        apex = { sample, player, platform };
        apexIndex = windowIndex;
      }
    }
    if (!apex) {
      return missingGeometry(invariant, samples, undefined, "jump window is empty");
    }
    if (bottom(apex.player) <= apex.platform.y + invariant.epsilon) continue;

    const completedArc = jumpSamples.slice(apexIndex + 1).some((sample) => {
      const player = readPlayer(sample, invariant.player_path);
      const record = playerRecord(sample, invariant.player_path);
      return Boolean(
        player &&
        (bottom(player) > bottom(apex!.player) + invariant.epsilon ||
          record?.grounded === true)
      );
    });
    if (!completedArc) {
      return violation(invariant, samples, {
        sample: jumpSamples.at(-1),
        expected: "a completed jump arc before judging its apex",
        actual: { jump_number: jumpNumber + 1, observed_samples: jumpSamples.length },
        kind: "unverified"
      });
    }
    return violation(invariant, samples, {
      sample: jumpSamples.at(-1),
      expected: { player_bottom_max: apex.platform.y + invariant.epsilon },
      actual: {
        jump_number: jumpNumber + 1,
        minimum_player_bottom: bottom(apex.player),
        witness: {
          action_index: apex.sample.action_index,
          sample_index: apex.sample.sample_index,
          frame_index: apex.sample.frame_index,
          elapsed_ms: apex.sample.elapsed_ms
        }
      }
    });
  }
  return null;
}

function evaluateEventuallySupported(
  invariant: Extract<PhysicsInvariant, { type: "eventually_supported" }>,
  samples: TimelineSample[]
): PhysicsViolation | null {
  let consecutive = 0;
  let maximum = 0;
  let lastSupportedTick: number | null = null;
  for (const sample of samples) {
    const playerValue = playerRecord(sample, invariant.player_path);
    const player = readPlayer(sample, invariant.player_path);
    const platforms = readPlatforms(sample, invariant.platforms_path);
    const platform = platforms?.find((item) => item.id === invariant.platform_id);
    if (!playerValue || !player || !platforms || !platform) {
      return missingGeometry(
        invariant,
        samples,
        sample,
        `player or platform '${invariant.platform_id}' is missing`
      );
    }
    const supported =
      playerValue.grounded === true &&
      playerValue.support_id === invariant.platform_id &&
      horizontalOverlap(player, platform) > invariant.epsilon &&
      Math.abs(bottom(player) - platform.y) <= invariant.epsilon;
    if (!supported) {
      consecutive = 0;
      lastSupportedTick = null;
    } else if (sample.tick !== lastSupportedTick) {
      consecutive = lastSupportedTick === null || sample.tick === lastSupportedTick + 1
        ? consecutive + 1
        : 1;
      lastSupportedTick = sample.tick;
    }
    maximum = Math.max(maximum, consecutive);
  }
  if (consecutive >= invariant.min_consecutive_samples) return null;
  return violation(invariant, samples, {
    sample: samples.at(-1),
    expected: {
      platform_id: invariant.platform_id,
      min_consecutive_samples: invariant.min_consecutive_samples
    },
    actual: { max_consecutive_samples: maximum }
  });
}

function evaluateWorldBounds(
  invariant: Extract<PhysicsInvariant, { type: "world_bounds" }>,
  samples: TimelineSample[]
): PhysicsViolation | null {
  for (const sample of samples) {
    const player = readPlayer(sample, invariant.player_path);
    const bounds = readBox(getPath(sample.state, invariant.bounds_path));
    if (!player || !bounds) {
      return missingGeometry(
        invariant,
        samples,
        sample,
        "missing or invalid player/world bounds geometry"
      );
    }
    const inside =
      player.x >= bounds.x - invariant.epsilon &&
      player.y >= bounds.y - invariant.epsilon &&
      right(player) <= right(bounds) + invariant.epsilon &&
      bottom(player) <= bottom(bounds) + invariant.epsilon;
    if (!inside) {
      return violation(invariant, samples, {
        sample,
        expected: { within: bounds, epsilon: invariant.epsilon },
        actual: { player }
      });
    }
  }
  return null;
}

function evaluateInvariant(
  invariant: PhysicsInvariant,
  samples: TimelineSample[]
): PhysicsViolation | null {
  switch (invariant.type) {
    case "no_penetration":
      return evaluateNoPenetration(invariant, samples);
    case "no_tunneling":
      return evaluateNoTunneling(invariant, samples);
    case "grounded_has_support":
      return evaluateGroundedHasSupport(invariant, samples);
    case "jump_apex_reaches":
      return evaluateJumpApex(invariant, samples);
    case "eventually_supported":
      return evaluateEventuallySupported(invariant, samples);
    case "world_bounds":
      return evaluateWorldBounds(invariant, samples);
  }
}

function invalidTimelineSample(samples: TimelineSample[]): {
  sample: TimelineSample;
  detail: string;
} | null {
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (!previous || !current) continue;
    if (current.sample_index <= previous.sample_index) {
      return { sample: current, detail: "sample_index is not strictly increasing" };
    }
    if (current.action_index < previous.action_index) {
      return { sample: current, detail: "action_index moved backwards" };
    }
    if (current.elapsed_ms < previous.elapsed_ms) {
      return { sample: current, detail: "elapsed_ms moved backwards" };
    }
    if (
      current.tick < previous.tick &&
      !current.event_types.includes("game_reset")
    ) {
      return { sample: current, detail: "tick moved backwards without game_reset" };
    }
  }
  return null;
}

export function evaluatePhysicsInvariants(
  invariants: PhysicsInvariant[],
  samples: TimelineSample[]
): PhysicsViolation[] {
  if (samples.length === 0) {
    return invariants.map((invariant) =>
      violation(invariant, samples, {
        expected: "at least one timeline sample",
        actual: { sample_count: 0 },
        kind: "unverified"
      })
    );
  }
  const timelineIssue = invalidTimelineSample(samples);
  if (timelineIssue) {
    return invariants.map((invariant) =>
      violation(invariant, samples, {
        sample: timelineIssue.sample,
        expected: "a monotonic scenario timeline",
        actual: timelineIssue.detail,
        kind: "unverified"
      })
    );
  }
  const typePriority: Record<PhysicsInvariant["type"], number> = {
    no_tunneling: 0,
    no_penetration: 1,
    grounded_has_support: 2,
    world_bounds: 3,
    jump_apex_reaches: 4,
    eventually_supported: 5
  };
  return invariants
    .map((invariant, order) => ({
      order,
      violation: evaluateInvariant(invariant, samples)
    }))
    .filter(
      (item): item is { order: number; violation: PhysicsViolation } =>
        item.violation !== null
    )
    .sort((left, rightItem) =>
      (left.violation.elapsed_ms ?? Number.POSITIVE_INFINITY) -
        (rightItem.violation.elapsed_ms ?? Number.POSITIVE_INFINITY) ||
      typePriority[left.violation.invariant_type] -
        typePriority[rightItem.violation.invariant_type] ||
      left.order - rightItem.order
    )
    .map((item) => item.violation);
}
