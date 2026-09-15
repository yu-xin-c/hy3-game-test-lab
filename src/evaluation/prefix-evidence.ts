/** Keep the original prefix and only the observations needed by its claims. */
export function isolatePrefixEvidence(packet: any) {
  if (packet.steps.length !== 1) return structuredClone(packet);
  if (packet.id === "target-rush-prefix-1") return {
    id: packet.id, steps: structuredClone(packet.steps),
    scope: "仅核验步骤1 verification：真实点击 #start-btn 后 status 为 playing，且事件中存在 game_started。不评价 implementation 或任何未给出的步骤。",
    repetitions: packet.repetitions.map((r: any) => ({ repeat: r.repeat, trials: r.trials.map((t: any) => ({ trial: t.trial,
      start: { observation: { status: t.start.observation.status }, events: structuredClone(t.start.events) }
    })) }))
  };
  if (packet.id === "platform-rescue-prefix-1") {
    const project = (s: any) => { const p = s.observation.state.player; return {
      player: { x: p.x, y: p.y, vx: p.vx, vy: p.vy }, latest_event_seq: s.observation.latest_event_seq
    }; };
    return { id: packet.id, steps: structuredClone(packet.steps),
      scope: "仅核验步骤1 verification：相同 seed、真实输入时间表和虚拟时间下，比较 player.x/y/vx/vy 与 latest_event_seq 的重放一致性。只判断提供的这些试验，不推断其他条件。不评价 implementation 或任何未给出的步骤。",
      reset_seed: 42,
      input_schedule: [{ elapsed_ms: 0, inputs: ["Start click", "ArrowRight down", "Space press"] }, { elapsed_ms: 320, inputs: ["Space press"] }, { elapsed_ms: 640, inputs: ["Space press"] }, { elapsed_ms: 3200, inputs: ["ArrowRight up"] }],
      repetitions: packet.repetitions.map((r: any) => ({ repeat: r.repeat, trials: r.trials.map((t: any) => ({ trial: t.trial,
        samples: [{ elapsed_ms: 0, value: project(t.start) }, ...t.inputs.map((a: any, index: number) => ({ elapsed_ms: index * 320, value: project(a.before) })), { elapsed_ms: t.elapsed_ms, value: project(t.final) }]
      })) }))
    };
  }
  throw new Error("Unsupported single-step prefix");
}
