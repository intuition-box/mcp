/**
 * Trust Lens system -- filtered views of the attestation graph.
 *
 * A lens defines constraints (predicate type, stake threshold, recency,
 * address scope) that narrow the edge set before algorithms run.
 * Built-in lenses cover common use cases; custom lenses can be
 * constructed at runtime via the TrustLens interface.
 */

import type { AttestationEdge } from '../types/index.js';

// ============ Types ============

/**
 * A filtered view of the attestation graph.
 *
 * All filter fields are optional. When omitted, that dimension is
 * unrestricted. When multiple fields are set, they combine with AND
 * semantics -- an edge must pass every active filter to be included.
 */
export interface TrustLens {
  /** Unique identifier for this lens */
  id: string;
  /** Human-readable name */
  name: string;
  /** What this lens selects for */
  description: string;
  /** Only include edges with these predicates (null/undefined = all) */
  predicateFilter?: string[];
  /** Exclude edges below this stake (in ETH, post-normalization) */
  minStake?: number;
  /** Exclude attestations older than N days */
  maxAgeDays?: number;
  /** Scope to edges where both from and to are in this set */
  addressFilter?: string[];
  /**
   * Per-predicate weight overrides used by personalized / composite trust
   * computations performed under this lens. Unlike predicateFilter (which
   * removes edges entirely), predicateWeights re-weight them.
   * Keys are predicate names, values are numeric weights.
   */
  predicateWeights?: Record<string, number>;
}

// ============ Built-in Lenses ============

/** Full graph with no filters applied. Default for all algorithms. */
export const LENS_FULL: TrustLens = {
  id: 'full',
  name: 'Full Graph',
  description: 'No filters applied. Operates on the entire attestation graph.',
};

/** Only explicit trust attestations. */
export const LENS_TRUST_ONLY: TrustLens = {
  id: 'trust-only',
  name: 'Trust Only',
  description: 'Only "trusts" predicate edges. Excludes follow, visit, and all other attestation types.',
  predicateFilter: ['trusts'],
  minStake: 0,
};

/** High-conviction signals: trust and follow edges with meaningful stake. */
export const LENS_HIGH_CONVICTION: TrustLens = {
  id: 'high-conviction',
  name: 'High Conviction',
  description: 'Trust and follow edges with stake >= 100 ETH. Filters out low-confidence noise.',
  predicateFilter: ['trusts', 'follow'],
  minStake: 100,
};

/** Recent attestations only -- last 90 days. */
export const LENS_RECENT: TrustLens = {
  id: 'recent',
  name: 'Recent (90 days)',
  description: 'All predicates, but only attestations created within the last 90 days.',
  maxAgeDays: 90,
};

/**
 * Social-context lens. Boosts personal-relationship signals (trusts, follow,
 * interacted with) and de-prioritizes work / utility predicates.
 */
export const LENS_SOCIAL: TrustLens = {
  id: 'social',
  name: 'Social',
  description: 'Weights social signals (trusts, follow, interacted with) higher than utility / work signals.',
  predicateWeights: {
    trusts: 1.0,
    trust: 1.0,
    follow: 0.9,
    'interacted with': 0.7,
    'collaborates with': 0.4,
    'visits for fun': 0.4,
    'visits for inspiration': 0.4,
    'visits for music': 0.4,
    'visits for learning ': 0.3,
    'visits for work': 0.15,
    'visits for buying': 0.1,
    distrust: -0.5,
  },
};

/**
 * Professional-context lens. Boosts work-relationship signals (collaborates
 * with, visits for work) and de-prioritizes purely social predicates.
 */
export const LENS_PROFESSIONAL: TrustLens = {
  id: 'professional',
  name: 'Professional',
  description: 'Weights professional signals (collaborates with, visits for work) higher than purely social signals.',
  predicateWeights: {
    'collaborates with': 1.0,
    'visits for work': 0.9,
    trusts: 0.7,
    trust: 0.7,
    'visits for learning ': 0.6,
    'interacted with': 0.4,
    follow: 0.3,
    'visits for inspiration': 0.3,
    'visits for buying': 0.2,
    'visits for fun': 0.1,
    'visits for music': 0.1,
    distrust: -0.5,
  },
};

// ============ Registry ============

const BUILT_IN_LENSES: readonly TrustLens[] = [
  LENS_FULL,
  LENS_TRUST_ONLY,
  LENS_HIGH_CONVICTION,
  LENS_RECENT,
  LENS_SOCIAL,
  LENS_PROFESSIONAL,
];

/**
 * Return all registered built-in lenses.
 */
export function getLensRegistry(): TrustLens[] {
  return [...BUILT_IN_LENSES];
}

/**
 * Retrieve a built-in lens by its id.
 *
 * @param id - Lens identifier (e.g. "trust-only", "high-conviction")
 * @throws Error if no lens with that id exists
 */
export function getLens(id: string): TrustLens {
  const lens = BUILT_IN_LENSES.find(l => l.id === id);
  if (!lens) {
    const available = BUILT_IN_LENSES.map(l => l.id).join(', ');
    throw new Error(`Unknown lens "${id}". Available lenses: ${available}`);
  }
  return lens;
}

// ============ Filter Engine ============

/**
 * Apply a trust lens to an array of attestation edges.
 *
 * Filters are combined with AND semantics: an edge must satisfy every
 * active constraint to be included in the result. Fields that are
 * undefined or null on the lens are skipped (no restriction).
 *
 * @param lens - The trust lens defining filter constraints
 * @param edges - Raw attestation edges to filter
 * @returns Edges that pass all lens constraints
 */
export function applyLens(lens: TrustLens, edges: AttestationEdge[]): AttestationEdge[] {
  const predicateSet = lens.predicateFilter
    ? new Set(lens.predicateFilter.map(p => p.toLowerCase()))
    : null;

  const addressSet = lens.addressFilter
    ? new Set(lens.addressFilter.map(a => a.toLowerCase()))
    : null;

  const cutoffTime = lens.maxAgeDays != null
    ? Date.now() - lens.maxAgeDays * 24 * 60 * 60 * 1000
    : null;

  return edges.filter(edge => {
    // Predicate filter
    if (predicateSet && !predicateSet.has(edge.predicate.toLowerCase())) {
      return false;
    }

    // Minimum stake filter
    if (lens.minStake != null && edge.stake_amount < lens.minStake) {
      return false;
    }

    // Recency filter
    if (cutoffTime != null) {
      const edgeTime = new Date(edge.timestamp).getTime();
      if (edgeTime < cutoffTime) {
        return false;
      }
    }

    // Address scope filter -- both endpoints must be in the set
    if (addressSet) {
      if (!addressSet.has(edge.from.toLowerCase()) || !addressSet.has(edge.to.toLowerCase())) {
        return false;
      }
    }

    return true;
  });
}
