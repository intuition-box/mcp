export const TRUST_PREDICATES: Record<string, number> = {
  trusts: 0.9,
  "vouches for": 0.7,
  follows: 0.3,
  endorses: 0.8,
  "is trusted by": 0.9,
  delegates: 0.6,
};

export const NOISE_PREDICATES = new Set([
  "has tag",
  "has interest",
  "is type",
  "has label",
]);

export interface WeightProfile {
  [predicate: string]: number;
}

export function isTrustPredicate(predicate: string): boolean {
  const normalized = predicate.toLowerCase().trim();
  if (NOISE_PREDICATES.has(normalized)) return false;
  return normalized in TRUST_PREDICATES;
}

export function getPredicateWeight(
  predicate: string,
  customWeights?: WeightProfile
): number {
  const normalized = predicate.toLowerCase().trim();

  if (customWeights && normalized in customWeights) {
    return customWeights[normalized];
  }

  return TRUST_PREDICATES[normalized] ?? 0;
}

export function filterByTrustPredicate(
  predicate: string,
  customWeights?: WeightProfile
): boolean {
  const normalized = predicate.toLowerCase().trim();
  if (NOISE_PREDICATES.has(normalized)) return false;
  if (customWeights) return normalized in customWeights;
  return normalized in TRUST_PREDICATES;
}