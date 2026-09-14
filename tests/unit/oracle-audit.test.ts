import { expect, it } from "vitest";
import { collectAuditAssertions, parseAuditResponse, validateAuditReview } from "../../src/evaluation/oracle-audit";

it("parses one explicit JSON fence but rejects ambiguous or broken JSON", () => {
  expect(parseAuditResponse('```json\n{"assertions":[]}\n```\nExplanation.')).toEqual({ assertions: [] });
  expect(() => parseAuditResponse('```json\n{}\n```\n```json\n{}\n```')).toThrow();
  expect(() => parseAuditResponse('```json\n{broken}\n```')).toThrow();
  expect(() => parseAuditResponse('prefix {"assertions":[]}')).toThrow();
});

it("deduplicates predicates without losing checkpoint contexts", () => {
  const result = collectAuditAssertions({ controls: [] }, { scenarios: [{ scenario_id: "win", checkpoints:
    ["a", "b"].map(id => ({ id, expected: { state: { score: 90 }, event_types: [] } })) }] });
  expect(result).toEqual([{ id: "A1", kind: "state", path: "score", expected: 90, contexts: ["win/a", "win/b"] }]);
});
it("requires complete unique decisions and exact public quotes", () => {
  const assertions = [{ id: "A1", kind: "state", path: "score", expected: 90, contexts: [] }];
  const item = { id: "A1", verdict: "supported", public_quote: "score 90", reason: "exact rule" };
  expect(validateAuditReview({ assertions: [item] }, assertions, "final score 90").assertions).toHaveLength(1);
  expect(() => validateAuditReview({ assertions: [] }, assertions, "final score 90")).toThrow();
  expect(() => validateAuditReview({ assertions: [item, item] }, assertions, "final score 90")).toThrow();
  expect(() => validateAuditReview({ assertions: [{ ...item, public_quote: "score 100" }] }, assertions, "score 90")).toThrow();
  expect(() => validateAuditReview({ assertions: [{ ...item, public_quote: null }] }, assertions, "score 90")).toThrow();
});
