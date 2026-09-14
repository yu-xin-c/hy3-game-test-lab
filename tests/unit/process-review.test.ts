import { expect, it } from "vitest";
import { SolutionPlan, ProcessReview } from "../../src/contracts/process-review";
const verdict = { final_correct: null, process_correct: null, first_error_step: null, apparent_pass_with_flaw: false, findings: [], limits: [] };
it("allows explicitly unknown conclusions", () => { expect(ProcessReview.parse(verdict).final_correct).toBeNull(); });
it("rejects negative process positions", () => { expect(ProcessReview.safeParse({ ...verdict, first_error_step: -1 }).success).toBe(false); });
it("requires consecutive public plan steps", () => { expect(SolutionPlan.safeParse({ steps: [1, 3, 4].map(id => ({ id, requirement: "r", implementation: "i", verification: "v" })) }).success).toBe(false); });
it("accepts a complete public plan", () => { expect(SolutionPlan.parse({ steps: [1, 2, 3].map(id => ({ id, requirement: "r", implementation: "i", verification: "v" })) }).steps).toHaveLength(3); });
