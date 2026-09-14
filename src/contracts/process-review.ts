import { z } from "zod";

export const SolutionPlan = z.object({ steps: z.array(z.object({
  id: z.number().int().positive(), requirement: z.string().min(1), implementation: z.string().min(1),
  verification: z.string().min(1)
})).min(3).max(10) }).superRefine((plan, ctx) => {
  if (plan.steps.some((step, i) => step.id !== i + 1)) ctx.addIssue({ code: "custom", message: "Steps must be consecutively numbered from 1" });
});

export const ProcessReview = z.object({
  final_correct: z.boolean().nullable(), process_correct: z.boolean().nullable(),
  first_error_step: z.number().int().positive().nullable(),
  apparent_pass_with_flaw: z.boolean(),
  findings: z.array(z.object({
    step_id: z.number().int().positive().nullable(),
    kind: z.enum(["requirement_misread", "invalid_assumption", "implementation_mismatch", "boundary_omission", "unsupported_claim", "test_problem", "other"]),
    status: z.enum(["supported_defect", "insufficient_evidence", "repaired", "test_problem"]),
    explanation: z.string(), file: z.string().nullable(), excerpt: z.string().nullable(),
    scenario_id: z.string().nullable(), action_index: z.number().int().nonnegative().nullable()
  })), limits: z.array(z.string())
});
