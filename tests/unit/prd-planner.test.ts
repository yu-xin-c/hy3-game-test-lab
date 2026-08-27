import { describe, expect, it } from "vitest";
import { PublicCaseSchema } from "../../src/contracts/schemas";
import { generateHy3TestPlan } from "../../src/agents/prd-planner";

const publicCase = PublicCaseSchema.parse({
  schema_version: "prd2play.case.v1",
  id: "planner-unit",
  title: "Planner unit fixture",
  difficulty: { level: "D1", rationale: "One action." },
  source: {
    type: "project_authored",
    description: "Unit fixture.",
    license: "MIT"
  },
  game: {
    entry_path: "/examples/unit.html",
    surface: "dom",
    viewport: { width: 800, height: 600 }
  },
  controls: [{ action_id: "START", device: "keyboard", code: "Enter" }],
  requirements: [
    {
      id: "RUN-01",
      layer: "L1",
      severity: "must",
      statement: "Starts.",
      observable: ["status"]
    }
  ],
  scenarios: [
    {
      id: "start",
      description: "Start.",
      seed: 1,
      steps: [{ action_id: "START", checkpoints: ["CP-START"] }]
    }
  ]
});

describe("generateHy3TestPlan", () => {
  it("validates structured output and sends no private oracle", async () => {
    let captured = "";
    const client = {
      async complete(system: string, user: string) {
        captured = `${system}\n${user}`;
        return JSON.stringify({
          schema_version: "prd2play.hy3-plan.v1",
          summary: "Start-path plan.",
          requirements: [
            {
              id: "RUN-01",
              layer: "L1",
              severity: "must",
              statement: "The game starts after START.",
              depends_on: [],
              observable: ["status"]
            }
          ],
          scenarios: [
            {
              id: "start",
              description: "Start once.",
              preconditions: [],
              steps: [
                {
                  action_id: "START",
                  reason: "Exercise startup.",
                  checkpoints: [
                    {
                      id: "CP-START",
                      layer: "L1",
                      requirement_ids: ["RUN-01"],
                      assertion_intent: "Observe the playing state.",
                      evidence_channels: ["bridge.status"]
                    }
                  ]
                }
              ]
            }
          ],
          risks: [],
          unknowns: []
        });
      }
    };

    const result = await generateHy3TestPlan(
      { prd: "Press START to begin.", publicCase },
      client
    );

    expect(result.plan.scenarios[0]?.steps[0]?.action_id).toBe("START");
    expect(captured).toContain("Press START to begin.");
    expect(captured).not.toContain("oracle.private");
    expect(captured).not.toContain("fault_ground_truth");
  });

  it("rejects an action invented by the model", async () => {
    const client = {
      async complete() {
        return JSON.stringify({
          schema_version: "prd2play.hy3-plan.v1",
          summary: "Invalid plan.",
          requirements: [
            {
              id: "RUN-01",
              layer: "L1",
              severity: "must",
              statement: "Start.",
              depends_on: [],
              observable: ["status"]
            }
          ],
          scenarios: [
            {
              id: "invalid",
              description: "Uses an undeclared control.",
              preconditions: [],
              steps: [
                { action_id: "TELEPORT", reason: "Invalid.", checkpoints: [] }
              ]
            }
          ],
          risks: [],
          unknowns: []
        });
      }
    };

    await expect(
      generateHy3TestPlan({ prd: "Start.", publicCase }, client)
    ).rejects.toThrow("undeclared action TELEPORT");
  });
});
