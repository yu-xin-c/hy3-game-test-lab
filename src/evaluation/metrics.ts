import type {
  CaseEvaluation,
  Difficulty,
  PrivateOracle
} from "../contracts/schemas";

export interface EvaluatedSample {
  evaluation: CaseEvaluation;
  oracle: PrivateOracle;
}

export interface AggregateMetrics {
  sample_count: number;
  final_answer_accuracy: number;
  process_correctness: number;
  localization_exact_accuracy: number;
  localization_within_one_accuracy: number;
  false_positive_rate: number;
  lucky_pass_recall: number;
  error_type_macro_f1: number;
  error_type_distribution: Record<string, number>;
  by_difficulty: Record<
    Difficulty,
    { count: number; final_accuracy: number; process_correctness: number }
  >;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function mean(values: boolean[]): number {
  return ratio(values.filter(Boolean).length, values.length);
}

function groundTruthActionIndex(sample: EvaluatedSample): number | null {
  const id = sample.oracle.fault_ground_truth.first_divergence_checkpoint;
  if (!id) return null;
  return (
    sample.oracle.checkpoints.find((checkpoint) => checkpoint.id === id)
      ?.action_index ?? null
  );
}

function macroF1(samples: EvaluatedSample[]): number {
  const faulty = samples.filter(
    (sample) => sample.oracle.fault_ground_truth.sample_kind !== "clean"
  );
  const labels = [
    ...new Set(
      faulty.map((sample) => sample.oracle.fault_ground_truth.error_type)
    )
  ];
  if (labels.length === 0) return 0;

  const scores = labels.map((label) => {
    const tp = faulty.filter(
      (sample) =>
        sample.oracle.fault_ground_truth.error_type === label &&
        sample.evaluation.first_failure?.error_type === label
    ).length;
    const fp = faulty.filter(
      (sample) =>
        sample.oracle.fault_ground_truth.error_type !== label &&
        sample.evaluation.first_failure?.error_type === label
    ).length;
    const fn = faulty.filter(
      (sample) =>
        sample.oracle.fault_ground_truth.error_type === label &&
        sample.evaluation.first_failure?.error_type !== label
    ).length;
    return ratio(2 * tp, 2 * tp + fp + fn);
  });
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

export function computeMetrics(samples: EvaluatedSample[]): AggregateMetrics {
  const faulty = samples.filter(
    (sample) => sample.oracle.fault_ground_truth.sample_kind !== "clean"
  );
  const clean = samples.filter(
    (sample) => sample.oracle.fault_ground_truth.sample_kind === "clean"
  );
  const lucky = samples.filter(
    (sample) => sample.oracle.fault_ground_truth.sample_kind === "lucky_pass"
  );

  const exact = faulty.filter((sample) => {
    const expected = sample.oracle.fault_ground_truth.first_divergence_checkpoint;
    return sample.evaluation.first_failure?.checkpoint_id === expected;
  }).length;
  const withinOne = faulty.filter((sample) => {
    const predicted = sample.evaluation.first_failure?.action_index;
    const expected = groundTruthActionIndex(sample);
    return predicted !== undefined && expected !== null
      ? Math.abs(predicted - expected) <= 1
      : false;
  }).length;

  const distribution: Record<string, number> = {};
  for (const sample of samples) {
    const key = sample.evaluation.first_failure?.error_type ?? "none";
    distribution[key] = (distribution[key] ?? 0) + 1;
  }

  const emptyBucket = () => ({
    count: 0,
    final_accuracy: 0,
    process_correctness: 0
  });
  const byDifficulty: AggregateMetrics["by_difficulty"] = {
    D1: emptyBucket(),
    D2: emptyBucket(),
    D3: emptyBucket()
  };
  for (const difficulty of ["D1", "D2", "D3"] as const) {
    const bucket = samples.filter(
      (sample) => sample.evaluation.difficulty === difficulty
    );
    byDifficulty[difficulty] = {
      count: bucket.length,
      final_accuracy: mean(
        bucket.map((sample) => sample.evaluation.final_outcome_correct)
      ),
      process_correctness: mean(
        bucket.map((sample) => sample.evaluation.process_correct)
      )
    };
  }

  return {
    sample_count: samples.length,
    final_answer_accuracy: mean(
      samples.map((sample) => sample.evaluation.final_outcome_correct)
    ),
    process_correctness: mean(
      samples.map((sample) => sample.evaluation.process_correct)
    ),
    localization_exact_accuracy: ratio(exact, faulty.length),
    localization_within_one_accuracy: ratio(withinOne, faulty.length),
    false_positive_rate: ratio(
      clean.filter((sample) => !sample.evaluation.process_correct).length,
      clean.length
    ),
    lucky_pass_recall: ratio(
      lucky.filter((sample) => sample.evaluation.lucky_pass_detected).length,
      lucky.length
    ),
    error_type_macro_f1: macroF1(samples),
    error_type_distribution: distribution,
    by_difficulty: byDifficulty
  };
}

