/**
 * Trust score explanation.
 *
 * Narrates the "why" behind a composite trust score using data that is already
 * computed by the scoring engine and the path finder. No new scoring happens
 * here. It reshapes existing results into drivers, weakeners, top contributors,
 * a strongest path, and a deterministic, templated natural-language summary.
 */

import { computeCompositeScore } from './scoring-engine.js';
import { findTrustPaths } from './pathfinding.js';
import type { CompositeScoreResult } from './scoring-engine.js';
import type { TrustPath, PathFindingResult } from './types.js';
import { log } from '../utils/logger.js';

/** Qualitative weight of a single explanation factor. */
export type ImpactLevel = 'high' | 'medium' | 'low';

/** A factor that pushes the score up. */
export interface TrustDriver {
  factor: string;
  impact: ImpactLevel;
  detail: string;
}

/** A factor that holds the score back or adds risk. */
export interface TrustWeakener {
  factor: string;
  detail: string;
}

/** An attester and its normalized share of the incoming trust. */
export interface TopContributor {
  address: string;
  contribution: number;
  predicate: string;
}

/** A trust path reshaped for human consumption. */
export interface ExplainedPath {
  hops: number;
  route: string[];
  predicates: string[];
  totalDecay: number;
}

/** Full explanation of a single address's trust score. */
export interface TrustExplanation {
  address: string;
  fromAddress: string | null;
  compositeScore: number;
  confidence: number;
  verdict: string;
  summary: string;
  drivers: TrustDriver[];
  weakeners: TrustWeakener[];
  topContributors: TopContributor[];
  strongestPath: ExplainedPath | null;
}

/**
 * Maps a composite score and confidence to a short verdict string.
 *
 * @param compositeScore - 0-100 composite trust score.
 * @param confidence - 0-1 confidence in the score.
 * @returns A human-readable verdict.
 */
export function deriveVerdict(compositeScore: number, confidence: number): string {
  if (compositeScore <= 0 && confidence <= 0) return 'insufficient data';
  if (compositeScore >= 80) return 'highly trusted';
  if (compositeScore >= 60) return 'well trusted';
  if (compositeScore >= 40) return 'moderately trusted';
  if (compositeScore >= 20) return 'weakly trusted';
  return 'minimally trusted';
}

/**
 * Reshapes a raw trust path into an ExplainedPath. Returns null when the path
 * is missing or empty.
 *
 * @param path - The strongest TrustPath, or null.
 * @returns An ExplainedPath, or null.
 */
export function mapStrongestPath(path: TrustPath | null): ExplainedPath | null {
  if (!path || path.addresses.length === 0) return null;
  return {
    hops: Math.max(path.addresses.length - 1, 0),
    route: path.addresses,
    predicates: path.predicates,
    totalDecay: path.totalDecay,
  };
}

/**
 * Attributes a normalized contribution share to each direct attester across the
 * supplied paths. The attester is the node one hop before the target; the
 * predicate is read off the final edge into the target. Contribution is each
 * attester's share of total path decay weight.
 *
 * @param paths - Trust paths into the target address.
 * @param limit - Maximum number of contributors to return.
 * @returns Top contributors sorted by contribution, descending.
 */
export function buildTopContributors(paths: TrustPath[], limit = 5): TopContributor[] {
  if (paths.length === 0) return [];

  const aggregate = new Map<string, { raw: number; predicate: string }>();
  let totalRaw = 0;

  for (const path of paths) {
    if (path.addresses.length < 2) continue;
    const attester = path.addresses[path.addresses.length - 2];
    const predicate = path.predicates[path.predicates.length - 1] ?? 'unknown';
    const weight = path.totalDecay > 0 ? path.totalDecay : 0;
    totalRaw += weight;
    const existing = aggregate.get(attester);
    if (existing) {
      existing.raw += weight;
    } else {
      aggregate.set(attester, { raw: weight, predicate });
    }
  }

  if (totalRaw === 0) return [];

  return Array.from(aggregate.entries())
    .map(([address, { raw, predicate }]) => ({
      address,
      contribution: Number((raw / totalRaw).toFixed(4)),
      predicate,
    }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, limit);
}

/**
 * Counts distinct trust routes, collapsing repeated attestations that share the
 * same address chain into a single route. Multiple attestations on one edge are
 * not independent paths.
 *
 * @param paths - Trust paths into the target address.
 * @returns The number of unique address routes.
 */
export function countDistinctRoutes(paths: TrustPath[]): number {
  if (paths.length === 0) return 0;
  return new Set(paths.map((path) => path.addresses.join('>'))).size;
}

/**
 * Counts distinct addresses that attest directly to the target (single-hop
 * routes), collapsing repeated attestations from the same attester.
 *
 * @param paths - Trust paths into the target address.
 * @returns The number of unique direct attesters.
 */
export function countDirectAttesters(paths: TrustPath[]): number {
  const direct = new Set<string>();
  for (const path of paths) {
    if (path.addresses.length === 2) {
      direct.add(path.addresses[0]);
    }
  }
  return direct.size;
}

/**
 * Builds the list of factors driving the score up, using the composite
 * breakdown and the discovered paths.
 *
 * @param breakdown - The composite score breakdown.
 * @param paths - Trust paths into the target address.
 * @returns Driver factors.
 */
export function buildDrivers(
  breakdown: CompositeScoreResult['breakdown'],
  paths: TrustPath[],
): TrustDriver[] {
  const drivers: TrustDriver[] = [];
  const { eigentrust, agentrank, predicateContributions } = breakdown;

  if (eigentrust && eigentrust.normalizedScore >= 0.5) {
    drivers.push({
      factor: 'Network trust standing',
      impact: eigentrust.normalizedScore >= 0.7 ? 'high' : 'medium',
      detail: `EigenTrust places this address at rank ${eigentrust.rank} with a normalized score of ${eigentrust.normalizedScore.toFixed(2)}.`,
    });
  }

  if (agentrank && agentrank.normalizedScore >= 0.5) {
    drivers.push({
      factor: 'Graph influence',
      impact: agentrank.normalizedScore >= 0.7 ? 'high' : 'medium',
      detail: `AgentRank influence is strong at rank ${agentrank.rank} (normalized ${agentrank.normalizedScore.toFixed(2)}).`,
    });
  }

  const distinctRoutes = countDistinctRoutes(paths);
  if (distinctRoutes >= 2) {
    drivers.push({
      factor: 'Path diversity',
      impact: distinctRoutes >= 3 ? 'high' : 'medium',
      detail: `Trust reaches this address through ${distinctRoutes} independent routes, reducing reliance on any single source.`,
    });
  }

  const directCount = countDirectAttesters(paths);
  if (directCount >= 1) {
    drivers.push({
      factor: 'Direct attestations',
      impact: directCount >= 3 ? 'high' : 'medium',
      detail: `${directCount} ${directCount === 1 ? 'address attests' : 'addresses attest'} directly to this one.`,
    });
  }

  if (predicateContributions && predicateContributions.length > 0) {
    const dominant = [...predicateContributions].sort(
      (a, b) => b.contributionPct - a.contributionPct,
    )[0];
    if (dominant && dominant.weight >= 0.8) {
      drivers.push({
        factor: 'Predicate quality',
        impact: dominant.weight >= 1 ? 'high' : 'medium',
        detail: `Most signal comes through the '${dominant.predicate}' predicate (weight ${dominant.weight.toFixed(2)}), a strong positive relation.`,
      });
    }
  }

  return drivers;
}

/**
 * Builds the list of factors that hold the score back or add risk.
 *
 * @param breakdown - The composite score breakdown.
 * @param confidence - 0-1 confidence in the score.
 * @param paths - Trust paths into the target address.
 * @param topContributors - Contributors already derived from the paths.
 * @param hasPerspective - Whether a fromAddress was supplied.
 * @returns Weakener factors.
 */
export function buildWeakeners(
  breakdown: CompositeScoreResult['breakdown'],
  confidence: number,
  paths: TrustPath[],
  topContributors: TopContributor[],
  hasPerspective: boolean,
): TrustWeakener[] {
  const weakeners: TrustWeakener[] = [];

  if (confidence < 0.4) {
    weakeners.push({
      factor: 'Limited data',
      detail: `Confidence is ${(confidence * 100).toFixed(0)}%, so the score rests on a thin set of signals.`,
    });
  }

  if (hasPerspective && paths.length > 0) {
    const deepest = Math.max(...paths.map((path) => path.addresses.length - 1));
    if (deepest <= 1) {
      weakeners.push({
        factor: 'Limited depth',
        detail: 'No attestations beyond a single hop, so the score relies on a local neighborhood.',
      });
    }
  }

  if (topContributors.length > 0 && topContributors[0].contribution >= 0.6) {
    weakeners.push({
      factor: 'Centralization risk',
      detail: `A single source accounts for ${(topContributors[0].contribution * 100).toFixed(0)}% of the incoming trust.`,
    });
  }

  if (hasPerspective) {
    const distinctRoutes = countDistinctRoutes(paths);
    if (distinctRoutes === 0) {
      weakeners.push({
        factor: 'No path from perspective',
        detail: 'No trust path was found from the provided fromAddress, so the score reflects global standing only.',
      });
    } else if (distinctRoutes === 1) {
      weakeners.push({
        factor: 'Sparse neighborhood',
        detail: 'Trust arrives through a single route, leaving no redundancy.',
      });
    }
  }

  const { predicateContributions } = breakdown;
  if (predicateContributions && predicateContributions.some((entry) => entry.weight < 0)) {
    weakeners.push({
      factor: 'Negative signals',
      detail: 'At least one incoming attestation carries a negative (distrust) predicate.',
    });
  }

  if (!hasPerspective) {
    weakeners.push({
      factor: 'No personalized perspective',
      detail: 'Without a fromAddress, path and contributor detail cannot be resolved. The score reflects global standing only.',
    });
  }

  return weakeners;
}

/**
 * Builds a deterministic, templated natural-language summary from the already
 * derived explanation parts. No LLM, no added latency.
 *
 * @param compositeScore - 0-100 composite score.
 * @param confidence - 0-1 confidence.
 * @param verdict - The derived verdict string.
 * @param drivers - Driver factors.
 * @param weakeners - Weakener factors.
 * @param strongestPath - The reshaped strongest path, or null.
 * @param distinctRouteCount - Number of unique routes found.
 * @param hasPerspective - Whether a fromAddress was supplied.
 * @returns A summary sentence or two.
 */
export function buildSummary(
  compositeScore: number,
  confidence: number,
  verdict: string,
  drivers: TrustDriver[],
  weakeners: TrustWeakener[],
  strongestPath: ExplainedPath | null,
  distinctRouteCount: number,
  hasPerspective: boolean,
): string {
  const parts: string[] = [];

  parts.push(
    `This address scores ${compositeScore.toFixed(1)}/100 (${verdict}) at ${(confidence * 100).toFixed(0)}% confidence.`,
  );

  if (drivers.length > 0) {
    const top = drivers
      .slice(0, 2)
      .map((driver) => driver.factor.toLowerCase())
      .join(' and ');
    parts.push(`Standing is driven mainly by ${top}.`);
  }

  if (hasPerspective && distinctRouteCount > 0) {
    if (strongestPath) {
      const predicate = strongestPath.predicates[strongestPath.predicates.length - 1] ?? 'trust';
      parts.push(
        `Trust reaches it through ${distinctRouteCount} ${distinctRouteCount === 1 ? 'route' : 'routes'}, the strongest being a ${strongestPath.hops}-hop '${predicate}' chain.`,
      );
    } else {
      parts.push(
        `Trust reaches it through ${distinctRouteCount} ${distinctRouteCount === 1 ? 'route' : 'routes'}.`,
      );
    }
  }

  if (weakeners.length > 0) {
    const headline =
      weakeners.find((weakener) => weakener.factor === 'Centralization risk') ?? weakeners[0];
    parts.push(`Worth noting: ${headline.detail}`);
  }

  if (!hasPerspective) {
    parts.push('Pass a fromAddress to surface specific paths and contributors.');
  }

  return parts.join(' ');
}

/**
 * Explains why an address has the trust score it does.
 *
 * Runs the composite scorer and, when a fromAddress is supplied, the path
 * finder, then narrates the results. With no fromAddress the explanation
 * reflects global standing only and omits path-level detail.
 *
 * @param address - The address to explain.
 * @param fromAddress - Optional source address for a personalized perspective.
 * @returns A full TrustExplanation.
 */
export async function explainTrustScore(
  address: string,
  fromAddress?: string,
): Promise<TrustExplanation> {
  const normalizedAddress = address.toLowerCase();
  const normalizedFrom = fromAddress ? fromAddress.toLowerCase() : undefined;
  const hasPerspective = Boolean(normalizedFrom);

  log('info', 'Explaining trust score', {
    address: normalizedAddress,
    fromAddress: normalizedFrom ?? null,
  });

  const composite = await computeCompositeScore(normalizedAddress, normalizedFrom);

  let paths: TrustPath[] = [];
  let strongestPath: TrustPath | null = null;
  if (normalizedFrom) {
    const pathResult: PathFindingResult = await findTrustPaths(normalizedFrom, normalizedAddress);
    paths = pathResult.paths;
    strongestPath = pathResult.strongestPath;
  }

  const verdict = deriveVerdict(composite.compositeScore, composite.confidence);
  const topContributors = buildTopContributors(paths);
  const explainedStrongest = mapStrongestPath(strongestPath);
  const drivers = buildDrivers(composite.breakdown, paths);
  const weakeners = buildWeakeners(
    composite.breakdown,
    composite.confidence,
    paths,
    topContributors,
    hasPerspective,
  );
  const summary = buildSummary(
    composite.compositeScore,
    composite.confidence,
    verdict,
    drivers,
    weakeners,
    explainedStrongest,
    countDistinctRoutes(paths),
    hasPerspective,
  );

  log('info', 'Trust explanation built', {
    address: normalizedAddress,
    verdict,
    driverCount: drivers.length,
    weakenerCount: weakeners.length,
  });

  return {
    address: normalizedAddress,
    fromAddress: normalizedFrom ?? null,
    compositeScore: composite.compositeScore,
    confidence: composite.confidence,
    verdict,
    summary,
    drivers,
    weakeners,
    topContributors,
    strongestPath: explainedStrongest,
  };
}
