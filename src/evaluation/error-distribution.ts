export interface ReviewedTask {
  id: string;
  difficulty: string;
  hy3_review: { scenarios: { scenario_id: string; process_correct: boolean | null; error_type?: string | null }[] };
}
export function errorDistribution(tasks: ReviewedTask[]) {
  const groups = new Map<string, { error_type: string; count: number; task_ids: Set<string>; by_difficulty: Record<string, number> }>();
  const seen = new Set<string>(); let negative = 0, unknown = 0, reviewed = 0;
  for (const task of tasks) for (const scenario of task.hy3_review.scenarios) {
    const key = `${task.id}/${scenario.scenario_id}`;
    if (seen.has(key)) throw new Error(`Duplicate reviewed scenario: ${key}`);
    seen.add(key); reviewed++;
    if (scenario.process_correct === null) { unknown++; continue; }
    if (scenario.process_correct !== false) continue;
    negative++;
    const type = scenario.error_type || "unclassified";
    const group = groups.get(type) ?? { error_type: type, count: 0, task_ids: new Set<string>(), by_difficulty: {} };
    group.count++; group.task_ids.add(task.id); group.by_difficulty[task.difficulty] = (group.by_difficulty[task.difficulty] ?? 0) + 1;
    groups.set(type, group);
  }
  return { reviewed_scenarios: reviewed, negative_process_scenarios: negative, unknown_process_scenarios: unknown,
    labels: [...groups.values()].sort((a, b) => b.count - a.count || a.error_type.localeCompare(b.error_type)).map(g => ({ ...g, task_ids: [...g.task_ids].sort(), fraction_of_negative: negative ? g.count / negative : null })) };
}
