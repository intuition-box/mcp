/**
 * Predicate filtering configuration for the trust engine.
 *
 * Maps Intuition predicate names to their on-chain term IDs and default
 * trust weights. Custom weights can be supplied at runtime to override
 * the defaults without changing this file.
 */

// ============ Types ============

/** Runtime weight overrides keyed by predicate name */
export type PredicateWeights = Record<string, number>;

interface PredicateEntry {
  readonly termId: string | null;
  readonly weight: number;
}

// ============ Predicate Registry ============

export const TRUST_PREDICATES: Record<string, PredicateEntry> = {
  trusts: {
    termId: '0x3a73f3b1613d166eea141a25a2adc70db9304ab3c4e90daecad05f86487c3ee9',
    weight: 1.0,
  },
  distrust: {
    termId: '0x93dd055a971886b66c5f4d9c29098ebdd9b7991890b6372a7e184c64321c9710',
    weight: -0.5,
  },
  follow: {
    termId: null,
    weight: 0.7,
  },
  'visits for work': {
    termId: '0x73872e1840362760d0144599493fc6f22ec5042f85ae7b8904576999a189d76b',
    weight: 0.4,
  },
  'visits for learning ': {
    termId: '0x5d6fcc892d3634b61e743d256289dd95f60604ee07f170aea9b4980b5eeda282',
    weight: 0.3,
  },
  'visits for fun': {
    termId: '0xb8b8ab8d23678edad85cec5e580caeb564a88b532f8dfd884f93dcf2cab32459',
    weight: 0.2,
  },
  'visits for inspiration': {
    termId: '0xd635b7467c9f89a9d243b82c5e4f6a97d238ad91a914b5de9949e107e5f59825',
    weight: 0.2,
  },
  'visits for buying': {
    termId: '0x3b2089f0aa24da0473fd1ad01c555c80c6b17e6ac1de39c68c588640487f845d',
    weight: 0.2,
  },
  'visits for music': {
    termId: '0xdeced28a3213eec9e29e42ded5302864b0db614f708599e552a7aac7f40f8fb7',
    weight: 0.2,
  },
} as const;

// ============ Default Weights ============

/** Flat map of predicate name -> default weight for quick lookups */
export const DEFAULT_WEIGHTS: PredicateWeights = Object.fromEntries(
  Object.entries(TRUST_PREDICATES).map(([name, entry]) => [name, entry.weight]),
);

// ============ Lookup ============

/**
 * Resolve the weight for a predicate.
 *
 * Priority: customWeights[predicate] > DEFAULT_WEIGHTS[predicate] > 0
 */
export function getPredicateWeight(
  predicate: string,
  customWeights?: PredicateWeights,
): number {
  if (customWeights && predicate in customWeights) {
    return customWeights[predicate];
  }
  return DEFAULT_WEIGHTS[predicate] ?? 0;
}
