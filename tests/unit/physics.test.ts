import { describe, expect, it } from "vitest";
import {
  PhysicsInvariantSchema,
  TimelineSampleSchema,
  type PhysicsInvariant,
  type TimelineSample
} from "../../src/contracts/schemas";
import { evaluatePhysicsInvariants } from "../../src/evaluation/physics";

const platform = { id: "ledge", x: 100, y: 100, width: 100, height: 20 };
const world = { x: 0, y: 0, width: 240, height: 180 };

function sample(
  sampleIndex: number,
  player: Record<string, unknown>,
  overrides: Record<string, unknown> = {}
): TimelineSample {
  return TimelineSampleSchema.parse({
    sample_index: sampleIndex,
    elapsed_ms: sampleIndex * 16,
    tick: sampleIndex,
    status: "playing",
    state: { player, platforms: [platform], world, ...overrides },
    event_types: []
  });
}

function invariant(value: unknown): PhysicsInvariant {
  return PhysicsInvariantSchema.parse(value);
}

describe("evaluatePhysicsInvariants", () => {
  it("accepts a jump that reaches and settles on a platform", () => {
    const samples = [
      {
        ...sample(0, { x: 110, y: 40, width: 20, height: 20, grounded: false, support_id: null }),
        event_types: ["player_jumped"]
      },
      sample(1, { x: 120, y: 60, width: 20, height: 20, grounded: false, support_id: null }),
      sample(2, { x: 130, y: 80, width: 20, height: 20, grounded: true, support_id: "ledge" }),
      sample(3, { x: 130, y: 80, width: 20, height: 20, grounded: true, support_id: "ledge" })
    ];
    const invariants = [
      invariant({ id: "P1", type: "no_penetration", platform_id: "ledge" }),
      invariant({ id: "P2", type: "no_tunneling", platform_id: "ledge" }),
      invariant({ id: "P3", type: "grounded_has_support", platform_id: "ledge" }),
      invariant({ id: "P4", type: "jump_apex_reaches", platform_id: "ledge" }),
      invariant({
        id: "P5",
        type: "eventually_supported",
        platform_id: "ledge",
        min_consecutive_samples: 2
      }),
      invariant({ id: "P6", type: "world_bounds", bounds_path: "world" })
    ];

    expect(evaluatePhysicsInvariants(invariants, samples)).toEqual([]);
  });

  it("finds the first sampled penetration", () => {
    const samples = [
      sample(0, { x: 120, y: 70, width: 20, height: 20 }),
      sample(1, { x: 120, y: 90, width: 20, height: 20 })
    ];
    const [failure] = evaluatePhysicsInvariants([
      invariant({ id: "PEN", type: "no_penetration", platform_id: "ledge" })
    ], samples);

    expect(failure).toMatchObject({
      invariant_id: "PEN",
      error_type: "physics_penetration",
      sample_index: 1,
      elapsed_ms: 16
    });
    expect(failure?.actual).toMatchObject({ overlap_y: 10 });
  });

  it("detects crossing a platform between consecutive frames", () => {
    const samples = [
      sample(4, { x: 120, y: 74, width: 20, height: 20 }),
      sample(5, { x: 120, y: 86, width: 20, height: 20 })
    ];
    const [failure] = evaluatePhysicsInvariants([
      invariant({ id: "TUN", type: "no_tunneling", platform_id: "ledge" })
    ], samples);

    expect(failure).toMatchObject({
      error_type: "physics_tunneling",
      sample_index: 5,
      elapsed_ms: 80
    });
  });

  it("rejects a grounded flag without geometric support", () => {
    const [failure] = evaluatePhysicsInvariants([
      invariant({ id: "SUP", type: "grounded_has_support", platform_id: "ledge" })
    ], [sample(2, {
      x: 130,
      y: 70,
      width: 20,
      height: 20,
      grounded: true,
      support_id: "ledge"
    })]);

    expect(failure?.error_type).toBe("physics_unsupported_grounding");
  });

  it("reports an unreachable jump at window end and keeps the apex witness", () => {
    const [failure] = evaluatePhysicsInvariants([
      invariant({ id: "APEX", type: "jump_apex_reaches", platform_id: "ledge" })
    ], [
      {
        ...sample(3, { x: 20, y: 100, width: 20, height: 20 }),
        event_types: ["player_jumped"]
      },
      sample(4, { x: 30, y: 95, width: 20, height: 20 }),
      sample(5, { x: 40, y: 98, width: 20, height: 20 })
    ]);

    expect(failure).toMatchObject({
      error_type: "physics_jump_apex",
      sample_index: 5,
      actual: {
        witness: { sample_index: 4 }
      }
    });
  });

  it("reports when stable landing never occurs", () => {
    const [failure] = evaluatePhysicsInvariants([
      invariant({
        id: "LAND",
        type: "eventually_supported",
        platform_id: "ledge",
        min_consecutive_samples: 2
      })
    ], [
      sample(0, { x: 120, y: 80, width: 20, height: 20, grounded: true, support_id: "ledge" }),
      sample(1, { x: 130, y: 105, width: 20, height: 20, grounded: false, support_id: null })
    ]);

    expect(failure).toMatchObject({
      error_type: "physics_support_timeout",
      sample_index: 1,
      actual: { max_consecutive_samples: 1 }
    });
  });

  it("does not count duplicate snapshots of one tick as stable support", () => {
    const repeated = sample(9, {
      x: 120,
      y: 80,
      width: 20,
      height: 20,
      grounded: true,
      support_id: "ledge"
    });
    const [failure] = evaluatePhysicsInvariants([
      invariant({
        id: "LAND",
        type: "eventually_supported",
        platform_id: "ledge",
        min_consecutive_samples: 2
      })
    ], [repeated, { ...repeated, sample_index: 10, elapsed_ms: 160 }]);

    expect(failure).toMatchObject({
      error_type: "physics_support_timeout",
      actual: { max_consecutive_samples: 1 }
    });
  });

  it("supports w/h boxes and finds world-bound violations", () => {
    const [failure] = evaluatePhysicsInvariants([
      invariant({ id: "WORLD", type: "world_bounds", bounds_path: "world" })
    ], [sample(6, { x: 225, y: 10, w: 20, h: 20 })]);

    expect(failure).toMatchObject({
      error_type: "physics_world_bounds",
      sample_index: 6
    });
  });

  it("marks missing evidence as an artifact failure instead of a physics defect", () => {
    const [failure] = evaluatePhysicsInvariants([
      invariant({ id: "TUN", type: "no_tunneling" })
    ], []);

    expect(failure).toMatchObject({
      kind: "unverified",
      error_type: "artifact_failure",
      actual: { sample_count: 0 }
    });
    expect(failure?.sample_index).toBeUndefined();
  });

  it("does not combine horizontal and vertical motion from different times", () => {
    const result = evaluatePhysicsInvariants([
      invariant({ id: "TUN", type: "no_tunneling", platform_id: "ledge" })
    ], [
      sample(0, { x: 0, y: 0, width: 20, height: 20 }),
      sample(1, { x: 200, y: 300, width: 20, height: 20 })
    ]);

    expect(result).toEqual([]);
  });

  it("does not certify zero-area geometry", () => {
    const [failure] = evaluatePhysicsInvariants([
      invariant({ id: "PEN", type: "no_penetration" })
    ], [sample(0, { x: 10, y: 10, width: 0, height: 20 })]);

    expect(failure).toMatchObject({
      kind: "unverified",
      error_type: "artifact_failure"
    });
  });

  it("uses a stable priority when tunneling and penetration appear together", () => {
    const samples = [
      sample(0, { x: 120, y: 74, width: 20, height: 20 }),
      sample(1, { x: 120, y: 90, width: 20, height: 20 })
    ];
    const noPenetration = invariant({
      id: "PEN",
      type: "no_penetration",
      platform_id: "ledge"
    });
    const noTunneling = invariant({
      id: "TUN",
      type: "no_tunneling",
      platform_id: "ledge"
    });

    for (const invariants of [
      [noPenetration, noTunneling],
      [noTunneling, noPenetration]
    ]) {
      expect(evaluatePhysicsInvariants(invariants, samples)[0]).toMatchObject({
        invariant_id: "TUN",
        error_type: "physics_tunneling",
        sample_index: 1
      });
    }
  });

  it("does not treat a reset boundary as continuous motion", () => {
    const beforeReset = {
      ...sample(10, { x: 120, y: 74, width: 20, height: 20 }),
      tick: 10
    };
    const afterReset = {
      ...sample(11, { x: 120, y: 120, width: 20, height: 20 }),
      tick: 0,
      event_types: ["game_reset"]
    };
    const nextTick = {
      ...sample(12, { x: 120, y: 120, width: 20, height: 20 }),
      tick: 1
    };

    expect(evaluatePhysicsInvariants([
      invariant({ id: "TUN", type: "no_tunneling", platform_id: "ledge" })
    ], [beforeReset, afterReset, nextTick])).toEqual([]);
  });

  it("breaks continuity when a reset epoch has already advanced its tick", () => {
    const beforeReset = {
      ...sample(0, { x: 120, y: 70, width: 20, height: 20 }),
      tick: 0
    };
    const afterReset = {
      ...sample(1, { x: 120, y: 120, width: 20, height: 20 }),
      tick: 1,
      event_types: ["game_reset"]
    };

    expect(evaluatePhysicsInvariants([
      invariant({ id: "TUN", type: "no_tunneling", platform_id: "ledge" })
    ], [beforeReset, afterReset])).toEqual([]);
  });

  it("keeps a real violation that happened before reset", () => {
    const beforeReset = {
      ...sample(10, { x: 120, y: 90, width: 20, height: 20 }),
      tick: 10
    };
    const afterReset = {
      ...sample(11, { x: 10, y: 10, width: 20, height: 20 }),
      tick: 0,
      event_types: ["game_reset"]
    };

    expect(evaluatePhysicsInvariants([
      invariant({ id: "PEN", type: "no_penetration", platform_id: "ledge" })
    ], [beforeReset, afterReset])[0]).toMatchObject({
      error_type: "physics_penetration",
      sample_index: 10
    });
  });

  it("marks a tick rollback without reset evidence as an artifact", () => {
    const [failure] = evaluatePhysicsInvariants([
      invariant({ id: "WORLD", type: "world_bounds", bounds_path: "world" })
    ], [
      { ...sample(1, { x: 10, y: 10, width: 20, height: 20 }), tick: 4 },
      { ...sample(2, { x: 10, y: 10, width: 20, height: 20 }), tick: 0 }
    ]);

    expect(failure).toMatchObject({
      kind: "unverified",
      error_type: "artifact_failure",
      actual: "tick moved backwards without game_reset"
    });
  });

  it("does not ignore geometry teleporting within one tick", () => {
    const [failure] = evaluatePhysicsInvariants([
      invariant({ id: "TUN", type: "no_tunneling", platform_id: "ledge" })
    ], [
      { ...sample(1, { x: 120, y: 70, width: 20, height: 20 }), tick: 4 },
      { ...sample(2, { x: 120, y: 130, width: 20, height: 20 }), tick: 4 }
    ]);

    expect(failure).toMatchObject({
      kind: "unverified",
      error_type: "artifact_failure",
      expected: "unchanged geometry within one game tick"
    });
  });

  it("requires platform geometry in the transition baseline", () => {
    const [failure] = evaluatePhysicsInvariants([
      invariant({ id: "TUN", type: "no_tunneling", platform_id: "ledge" })
    ], [
      sample(1, { x: 120, y: 70, width: 20, height: 20 }, { platforms: [] }),
      sample(2, { x: 120, y: 90, width: 20, height: 20 })
    ]);

    expect(failure).toMatchObject({
      kind: "unverified",
      error_type: "artifact_failure"
    });
  });

  it.each([
    [
      { x: 60, y: 100, width: 20, height: 20 },
      { x: 210, y: 100, width: 20, height: 20 }
    ],
    [
      { x: 120, y: 140, width: 20, height: 20 },
      { x: 120, y: 60, width: 20, height: 20 }
    ]
  ])("detects side or upward platform tunneling", (before, after) => {
    const [failure] = evaluatePhysicsInvariants([
      invariant({ id: "TUN", type: "no_tunneling", platform_id: "ledge" })
    ], [sample(1, before), sample(2, after)]);

    expect(failure?.error_type).toBe("physics_tunneling");
  });

  it("checks each jump instead of letting an earlier success mask a bad jump", () => {
    const samples = [
      { ...sample(0, { x: 120, y: 40, width: 20, height: 20 }), event_types: ["player_jumped"] },
      sample(1, { x: 120, y: 80, width: 20, height: 20, grounded: true }),
      { ...sample(2, { x: 120, y: 100, width: 20, height: 20 }), event_types: ["player_jumped"] },
      sample(3, { x: 120, y: 95, width: 20, height: 20 }),
      sample(4, { x: 120, y: 98, width: 20, height: 20 })
    ];
    const [failure] = evaluatePhysicsInvariants([
      invariant({ id: "APEX", type: "jump_apex_reaches", platform_id: "ledge" })
    ], samples);

    expect(failure).toMatchObject({
      error_type: "physics_jump_apex",
      actual: { jump_number: 2 }
    });
  });

  it("does not certify multiple jump events collapsed into one sample", () => {
    const [failure] = evaluatePhysicsInvariants([
      invariant({ id: "APEX", type: "jump_apex_reaches", platform_id: "ledge" })
    ], [{
      ...sample(0, { x: 120, y: 40, width: 20, height: 20 }),
      event_types: ["player_jumped", "player_jumped"]
    }]);

    expect(failure).toMatchObject({
      kind: "unverified",
      error_type: "artifact_failure",
      expected: "at most one 'player_jumped' event per timeline sample",
      actual: { event_count: 2 }
    });
  });

  it("does not use post-reset motion to complete a jump arc", () => {
    const [failure] = evaluatePhysicsInvariants([
      invariant({ id: "APEX", type: "jump_apex_reaches", platform_id: "ledge" })
    ], [
      {
        ...sample(0, { x: 120, y: 100, width: 20, height: 20 }),
        tick: 0,
        event_types: ["player_jumped"]
      },
      {
        ...sample(1, { x: 120, y: 130, width: 20, height: 20 }),
        tick: 1,
        event_types: ["game_reset"]
      }
    ]);

    expect(failure).toMatchObject({
      kind: "unverified",
      error_type: "artifact_failure",
      expected: "a completed jump arc before judging its apex"
    });
  });

  it("does not call an unfinished upward arc a physics defect", () => {
    const [failure] = evaluatePhysicsInvariants([
      invariant({ id: "APEX", type: "jump_apex_reaches", platform_id: "ledge" })
    ], [
      { ...sample(0, { x: 120, y: 100, width: 20, height: 20 }), event_types: ["player_jumped"] },
      sample(1, { x: 120, y: 95, width: 20, height: 20 }),
      sample(2, { x: 120, y: 90, width: 20, height: 20 })
    ]);

    expect(failure).toMatchObject({
      kind: "unverified",
      error_type: "artifact_failure",
      expected: "a completed jump arc before judging its apex"
    });
  });

  it("does not call sparse support samples consecutive", () => {
    const supported = {
      x: 120,
      y: 80,
      width: 20,
      height: 20,
      grounded: true,
      support_id: "ledge"
    };
    const [failure] = evaluatePhysicsInvariants([
      invariant({
        id: "LAND",
        type: "eventually_supported",
        platform_id: "ledge",
        min_consecutive_samples: 2
      })
    ], [
      { ...sample(1, supported), tick: 1 },
      { ...sample(2, supported), tick: 100 }
    ]);

    expect(failure).toMatchObject({
      error_type: "physics_support_timeout",
      actual: { max_consecutive_samples: 1 }
    });
  });

  it("marks skipped ticks as insufficient tunneling evidence", () => {
    const [failure] = evaluatePhysicsInvariants([
      invariant({ id: "TUN", type: "no_tunneling", platform_id: "ledge" })
    ], [
      { ...sample(0, { x: 120, y: 74, width: 20, height: 20 }), tick: 1 },
      { ...sample(1, { x: 120, y: 86, width: 20, height: 20 }), tick: 3 }
    ]);

    expect(failure).toMatchObject({
      kind: "unverified",
      error_type: "artifact_failure",
      actual: { previous_tick: 1, current_tick: 3 }
    });
  });

  it("does not certify jump reachability without observing a jump", () => {
    const [failure] = evaluatePhysicsInvariants([
      invariant({ id: "APEX", type: "jump_apex_reaches", platform_id: "ledge" })
    ], [sample(0, { x: 120, y: 40, width: 20, height: 20 })]);

    expect(failure).toMatchObject({
      error_type: "physics_jump_apex",
      expected: "event 'player_jumped' before apex measurement",
      actual: "missing"
    });
  });

  it("marks a non-monotonic timeline as bad evidence", () => {
    const [failure] = evaluatePhysicsInvariants([
      invariant({ id: "WORLD", type: "world_bounds", bounds_path: "world" })
    ], [
      sample(2, { x: 10, y: 10, width: 20, height: 20 }),
      sample(1, { x: 10, y: 10, width: 20, height: 20 })
    ]);

    expect(failure).toMatchObject({
      kind: "unverified",
      error_type: "artifact_failure",
      expected: "a monotonic scenario timeline"
    });
  });
});
