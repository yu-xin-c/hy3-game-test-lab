export interface VerifierRow {
  gold: { defect: boolean; first_error_index: number | null };
  review: { verdict: { defect: boolean; first_error_index: number | null } } | null;
}
export function verifierMetrics(rows: VerifierRow[]) {
  const complete = rows.every(r => r.review !== null);
  const faulty = rows.filter(r => r.gold.defect), clean = rows.filter(r => !r.gold.defect);
  const fraction = (n: number, d: number) => ({ numerator: n, denominator: d, rate: complete && d ? n / d : null });
  return { complete,
    detection: fraction(faulty.filter(r => r.review?.verdict.defect === true).length, faulty.length),
    observed_step_localization: fraction(faulty.filter(r => r.review?.verdict.defect === true && r.review.verdict.first_error_index === r.gold.first_error_index).length, faulty.length),
    false_positive_rate: fraction(clean.filter(r => r.review?.verdict.defect === true).length, clean.length) };
}
