import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the logger (matches scoring-engine.test.ts convention)
vi.mock('../../utils/logger.js', () => ({
  log: vi.fn(),
}));

// Mock the two algorithm dependencies so we control their outputs
vi.mock('../scoring-engine.js', () => ({
  computeCompositeScore: vi.fn(),
}));

vi.mock('../pathfinding.js', () => ({
  findTrustPaths: vi.fn(),
}));

import { computeCompositeScore } from '../scoring-engine.js';
import { findTrustPaths } from '../pathfinding.js';
import {
  deriveVerdict,
  mapStrongestPath,
  buildTopContributors,
  countDistinctRoutes,
  countDirectAttesters,
  buildDrivers,
  buildWeakeners,
  buildSummary,
  explainTrustScore,
} from '../explain.js';
import type { TrustDriver, TrustWeakener, ExplainedPath, TopContributor } from '../explain.js';
import type { TrustPath } from '../types.js';
import type { CompositeScoreResult } from '../scoring-engine.js';

const mockComposite = vi.mocked(computeCompositeScore);
const mockFindTrustPaths = vi.mocked(findTrustPaths);

// ============ Fixtures ============

/** Build a TrustPath fixture. predicates default to 'trusts' per hop. */
function makePath(
  addresses: string[],
  totalDecay = 0.5,
  predicates?: string[],
): TrustPath {
  const hops = Math.max(addresses.length - 1, 0);
  return {
    addresses,
    predicates: predicates ?? Array.from({ length: hops }, () => 'trusts'),
    stakes: Array.from({ length: hops }, () => 1),
    totalDecay,
  };
}

/** Build a composite breakdown fixture with safe defaults. */
function makeBreakdown(
  overrides?: Partial<CompositeScoreResult['breakdown']>,
): CompositeScoreResult['breakdown'] {
  return {
    eigentrust: { score: 0, normalizedScore: 0, rank: 100 },
    agentrank: { score: 0, normalizedScore: 0, rank: 100 },
    transitiveTrust: { score: 0, paths: 0, maxHops: 3 },
    ...overrides,
  };
}

/** Build a full CompositeScoreResult fixture. */
function makeComposite(
  overrides?: Partial<CompositeScoreResult>,
): CompositeScoreResult {
  return {
    address: '0xtarget',
    compositeScore: 50,
    confidence: 0.8,
    breakdown: makeBreakdown(),
    metadata: {
      totalNodes: 10,
      computeTimeMs: 5,
      dataFreshness: new Date('2024-01-01T00:00:00.000Z'),
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============ deriveVerdict ============

describe('deriveVerdict', () => {
  it('returns insufficient data when score and confidence are both zero', () => {
    expect(deriveVerdict(0, 0)).toBe('insufficient data');
  });

  it('returns highly trusted at and above 80', () => {
    expect(deriveVerdict(80, 0.9)).toBe('highly trusted');
    expect(deriveVerdict(95, 0.9)).toBe('highly trusted');
  });

  it('returns well trusted at and above 60', () => {
    expect(deriveVerdict(60, 0.7)).toBe('well trusted');
    expect(deriveVerdict(75, 0.7)).toBe('well trusted');
  });

  it('returns moderately trusted at and above 40', () => {
    expect(deriveVerdict(40, 0.5)).toBe('moderately trusted');
    expect(deriveVerdict(55, 0.5)).toBe('moderately trusted');
  });

  it('returns weakly trusted at and above 20', () => {
    expect(deriveVerdict(20, 0.3)).toBe('weakly trusted');
    expect(deriveVerdict(35, 0.3)).toBe('weakly trusted');
  });

  it('returns minimally trusted just below 20', () => {
    expect(deriveVerdict(19.9, 0.3)).toBe('minimally trusted');
  });

  it('does not return insufficient data when confidence is positive but score is zero', () => {
    expect(deriveVerdict(0, 0.5)).toBe('minimally trusted');
  });

  it('does not return insufficient data when score is positive but confidence is zero', () => {
    expect(deriveVerdict(50, 0)).toBe('moderately trusted');
  });
});

// ============ mapStrongestPath ============

describe('mapStrongestPath', () => {
  it('returns null for null input', () => {
    expect(mapStrongestPath(null)).toBeNull();
  });

  it('returns null for empty-addresses input', () => {
    expect(mapStrongestPath(makePath([]))).toBeNull();
  });

  it('reshapes a normal multi-hop path', () => {
    const path = makePath(['0xa', '0xb', '0xc'], 0.42, ['trusts', 'follow']);
    const result = mapStrongestPath(path) as ExplainedPath;

    expect(result).not.toBeNull();
    expect(result.hops).toBe(2);
    expect(result.route).toEqual(['0xa', '0xb', '0xc']);
    expect(result.predicates).toEqual(['trusts', 'follow']);
    expect(result.totalDecay).toBe(0.42);
  });
});

// ============ buildTopContributors ============

describe('buildTopContributors', () => {
  it('returns empty array for no paths', () => {
    expect(buildTopContributors([])).toEqual([]);
  });

  it('skips paths with fewer than 2 addresses', () => {
    const paths = [makePath(['0xonly'], 0.5)];
    expect(buildTopContributors(paths)).toEqual([]);
  });

  it('aggregates two paths sharing an attester into one entry', () => {
    const paths = [
      makePath(['0xfrom', '0xatt1', '0xtarget'], 0.6, ['trusts', 'follow']),
      makePath(['0xfrom', '0xatt1', '0xtarget'], 0.4, ['trusts', 'follow']),
    ];
    const result = buildTopContributors(paths);

    expect(result).toHaveLength(1);
    expect(result[0].address).toBe('0xatt1');
    expect(result[0].predicate).toBe('follow');
    expect(result[0].contribution).toBeCloseTo(1, 5);
  });

  it('normalizes contributions to sum near 1 and sorts descending', () => {
    const paths = [
      makePath(['0xfrom', '0xatt1', '0xtarget'], 0.75),
      makePath(['0xfrom', '0xatt2', '0xtarget'], 0.25),
    ];
    const result = buildTopContributors(paths);

    expect(result).toHaveLength(2);
    expect(result[0].address).toBe('0xatt1');
    expect(result[0].contribution).toBeCloseTo(0.75, 4);
    expect(result[1].contribution).toBeCloseTo(0.25, 4);
    const sum = result.reduce((acc, entry) => acc + entry.contribution, 0);
    expect(sum).toBeCloseTo(1, 4);
  });

  it('truncates to the supplied limit', () => {
    const paths = [
      makePath(['0xfrom', '0xa', '0xtarget'], 0.6),
      makePath(['0xfrom', '0xb', '0xtarget'], 0.5),
      makePath(['0xfrom', '0xc', '0xtarget'], 0.4),
      makePath(['0xfrom', '0xd', '0xtarget'], 0.3),
      makePath(['0xfrom', '0xe', '0xtarget'], 0.2),
      makePath(['0xfrom', '0xf', '0xtarget'], 0.1),
    ];
    expect(buildTopContributors(paths, 3)).toHaveLength(3);
    // Default limit is 5
    expect(buildTopContributors(paths)).toHaveLength(5);
  });

  it('returns empty array when all paths have zero decay', () => {
    const paths = [
      makePath(['0xfrom', '0xatt1', '0xtarget'], 0),
      makePath(['0xfrom', '0xatt2', '0xtarget'], 0),
    ];
    expect(buildTopContributors(paths)).toEqual([]);
  });

  it('falls back to unknown predicate when the final edge predicate is missing', () => {
    // A 2-address path with an empty predicates array exercises the ?? 'unknown' fallback
    const path: TrustPath = {
      addresses: ['0xatt', '0xtarget'],
      predicates: [],
      stakes: [],
      totalDecay: 0.5,
    };
    const result = buildTopContributors([path]);
    expect(result).toHaveLength(1);
    expect(result[0].predicate).toBe('unknown');
  });
});

// ============ countDistinctRoutes ============

describe('countDistinctRoutes', () => {
  it('returns 0 for an empty array', () => {
    expect(countDistinctRoutes([])).toBe(0);
  });

  it('collapses identical address chains into one route', () => {
    const paths = [
      makePath(['0xa', '0xt']),
      makePath(['0xa', '0xt']),
      makePath(['0xa', '0xt']),
    ];
    expect(countDistinctRoutes(paths)).toBe(1);
  });

  it('counts distinct address chains separately', () => {
    const paths = [
      makePath(['0xa', '0xt']),
      makePath(['0xb', '0xt']),
      makePath(['0xc', '0xt']),
    ];
    expect(countDistinctRoutes(paths)).toBe(3);
  });
});

// ============ countDirectAttesters ============

describe('countDirectAttesters', () => {
  it('returns 0 for an empty array', () => {
    expect(countDirectAttesters([])).toBe(0);
  });

  it('collapses many single-hop attestations from the same source into one', () => {
    const paths = Array.from({ length: 18 }, () => makePath(['0xsame', '0xt']));
    expect(countDirectAttesters(paths)).toBe(1);
  });

  it('counts single-hop paths from three different sources as three', () => {
    const paths = [
      makePath(['0xa', '0xt']),
      makePath(['0xb', '0xt']),
      makePath(['0xc', '0xt']),
    ];
    expect(countDirectAttesters(paths)).toBe(3);
  });

  it('returns 0 when there are no single-hop paths', () => {
    const paths = [
      makePath(['0xf', '0xa', '0xt']),
      makePath(['0xf', '0xb', '0xt']),
    ];
    expect(countDirectAttesters(paths)).toBe(0);
  });
});

// ============ buildDrivers ============

describe('buildDrivers', () => {
  it('adds no drivers when nothing meets thresholds', () => {
    const drivers = buildDrivers(makeBreakdown(), []);
    expect(drivers).toEqual([]);
  });

  it('flags eigentrust high vs medium', () => {
    const high = buildDrivers(
      makeBreakdown({ eigentrust: { score: 1, normalizedScore: 0.8, rank: 1 } }),
      [],
    );
    expect(high.find((d) => d.factor === 'Network trust standing')?.impact).toBe('high');

    const medium = buildDrivers(
      makeBreakdown({ eigentrust: { score: 1, normalizedScore: 0.55, rank: 2 } }),
      [],
    );
    expect(medium.find((d) => d.factor === 'Network trust standing')?.impact).toBe('medium');
  });

  it('omits eigentrust driver below 0.5', () => {
    const drivers = buildDrivers(
      makeBreakdown({ eigentrust: { score: 1, normalizedScore: 0.4, rank: 9 } }),
      [],
    );
    expect(drivers.find((d) => d.factor === 'Network trust standing')).toBeUndefined();
  });

  it('flags agentrank high vs medium and omits when below 0.5', () => {
    const high = buildDrivers(
      makeBreakdown({ agentrank: { score: 1, normalizedScore: 0.9, rank: 1 } }),
      [],
    );
    expect(high.find((d) => d.factor === 'Graph influence')?.impact).toBe('high');

    const medium = buildDrivers(
      makeBreakdown({ agentrank: { score: 1, normalizedScore: 0.5, rank: 4 } }),
      [],
    );
    expect(medium.find((d) => d.factor === 'Graph influence')?.impact).toBe('medium');

    const absent = buildDrivers(
      makeBreakdown({ agentrank: { score: 1, normalizedScore: 0.49, rank: 4 } }),
      [],
    );
    expect(absent.find((d) => d.factor === 'Graph influence')).toBeUndefined();
  });

  it('flags path diversity high (3+) vs medium (2) vs absent (<2)', () => {
    const three = buildDrivers(makeBreakdown(), [
      makePath(['0xf', '0xa', '0xt']),
      makePath(['0xf', '0xb', '0xt']),
      makePath(['0xf', '0xc', '0xt']),
    ]);
    expect(three.find((d) => d.factor === 'Path diversity')?.impact).toBe('high');

    const two = buildDrivers(makeBreakdown(), [
      makePath(['0xf', '0xa', '0xt']),
      makePath(['0xf', '0xb', '0xt']),
    ]);
    expect(two.find((d) => d.factor === 'Path diversity')?.impact).toBe('medium');

    const one = buildDrivers(makeBreakdown(), [makePath(['0xf', '0xa', '0xt'])]);
    expect(one.find((d) => d.factor === 'Path diversity')).toBeUndefined();
  });

  it('flags direct attestations high (3+) vs medium (1) vs absent (0)', () => {
    const three = buildDrivers(makeBreakdown(), [
      makePath(['0xa', '0xt']),
      makePath(['0xb', '0xt']),
      makePath(['0xc', '0xt']),
    ]);
    expect(three.find((d) => d.factor === 'Direct attestations')?.impact).toBe('high');

    const one = buildDrivers(makeBreakdown(), [makePath(['0xa', '0xt'])]);
    expect(one.find((d) => d.factor === 'Direct attestations')?.impact).toBe('medium');

    const none = buildDrivers(makeBreakdown(), [makePath(['0xf', '0xa', '0xt'])]);
    expect(none.find((d) => d.factor === 'Direct attestations')).toBeUndefined();
  });

  it('flags predicate quality high (>=1) vs medium (0.8-0.99) vs absent (below 0.8)', () => {
    const high = buildDrivers(
      makeBreakdown({
        predicateContributions: [
          { predicate: 'trusts', weight: 1, normalizedWeight: 0.5, contributionPct: 50 },
          { predicate: 'follow', weight: 0.7, normalizedWeight: 0.35, contributionPct: 35 },
        ],
      }),
      [],
    );
    const highDriver = high.find((d) => d.factor === 'Predicate quality');
    expect(highDriver?.impact).toBe('high');

    const medium = buildDrivers(
      makeBreakdown({
        predicateContributions: [
          { predicate: 'follow', weight: 0.9, normalizedWeight: 0.6, contributionPct: 60 },
        ],
      }),
      [],
    );
    expect(medium.find((d) => d.factor === 'Predicate quality')?.impact).toBe('medium');

    const below = buildDrivers(
      makeBreakdown({
        predicateContributions: [
          { predicate: 'visits_for_fun', weight: 0.2, normalizedWeight: 1, contributionPct: 100 },
        ],
      }),
      [],
    );
    expect(below.find((d) => d.factor === 'Predicate quality')).toBeUndefined();
  });

  it('omits predicate quality when contributions array is empty', () => {
    const drivers = buildDrivers(makeBreakdown({ predicateContributions: [] }), []);
    expect(drivers.find((d) => d.factor === 'Predicate quality')).toBeUndefined();
  });

  it('does not count repeated attestations on one edge as path diversity (regression)', () => {
    // 18 attestations that are all the same single-hop edge from one wallet.
    const paths = Array.from({ length: 18 }, () => makePath(['0xsame', '0xt']));
    const drivers = buildDrivers(makeBreakdown(), paths);

    // One distinct route -> no Path diversity driver.
    expect(drivers.find((d) => d.factor === 'Path diversity')).toBeUndefined();

    // One distinct direct attester -> medium impact, singular wording.
    const direct = drivers.find((d) => d.factor === 'Direct attestations');
    expect(direct?.impact).toBe('medium');
    expect(direct?.detail).toContain('1 address attests');
  });

  it('flags path diversity high for 3 distinct multi-hop routes', () => {
    const paths = [
      makePath(['0xf', '0xa', '0xt']),
      makePath(['0xf', '0xb', '0xt']),
      makePath(['0xf', '0xc', '0xt']),
    ];
    const drivers = buildDrivers(makeBreakdown(), paths);
    expect(drivers.find((d) => d.factor === 'Path diversity')?.impact).toBe('high');
  });

  it('flags path diversity medium for 2 distinct routes', () => {
    const paths = [
      makePath(['0xf', '0xa', '0xt']),
      makePath(['0xf', '0xb', '0xt']),
    ];
    const drivers = buildDrivers(makeBreakdown(), paths);
    expect(drivers.find((d) => d.factor === 'Path diversity')?.impact).toBe('medium');
  });

  it('flags direct attestations high for 3 distinct single-hop attesters', () => {
    const paths = [
      makePath(['0xa', '0xt']),
      makePath(['0xb', '0xt']),
      makePath(['0xc', '0xt']),
    ];
    const drivers = buildDrivers(makeBreakdown(), paths);
    const direct = drivers.find((d) => d.factor === 'Direct attestations');
    expect(direct?.impact).toBe('high');
    expect(direct?.detail).toContain('3 addresses attest');
  });
});

// ============ buildWeakeners ============

describe('buildWeakeners', () => {
  it('flags limited data when confidence is below 0.4', () => {
    const weakeners = buildWeakeners(makeBreakdown(), 0.3, [], [], true);
    expect(weakeners.find((w) => w.factor === 'Limited data')).toBeDefined();
  });

  it('flags limited depth when all paths are single hop with perspective', () => {
    const paths = [makePath(['0xa', '0xt']), makePath(['0xb', '0xt'])];
    const weakeners = buildWeakeners(makeBreakdown(), 0.9, paths, [], true);
    expect(weakeners.find((w) => w.factor === 'Limited depth')).toBeDefined();
  });

  it('does not flag limited depth when a deeper path exists', () => {
    const paths = [makePath(['0xa', '0xb', '0xt']), makePath(['0xc', '0xt'])];
    const weakeners = buildWeakeners(makeBreakdown(), 0.9, paths, [], true);
    expect(weakeners.find((w) => w.factor === 'Limited depth')).toBeUndefined();
  });

  it('flags centralization when top contributor share is at least 0.6', () => {
    const paths = [makePath(['0xa', '0xb', '0xt']), makePath(['0xc', '0xd', '0xt'])];
    const contributors: TopContributor[] = [
      { address: '0xb', contribution: 0.7, predicate: 'trusts' },
    ];
    const weakeners = buildWeakeners(makeBreakdown(), 0.9, paths, contributors, true);
    expect(weakeners.find((w) => w.factor === 'Centralization risk')).toBeDefined();
  });

  it('flags sparse neighborhood when one path or fewer with perspective', () => {
    const weakeners = buildWeakeners(makeBreakdown(), 0.9, [makePath(['0xa', '0xb', '0xt'])], [], true);
    expect(weakeners.find((w) => w.factor === 'Sparse neighborhood')).toBeDefined();
  });

  it('flags negative signals when a predicate contribution has negative weight', () => {
    const breakdown = makeBreakdown({
      predicateContributions: [
        { predicate: 'distrust', weight: -0.5, normalizedWeight: -0.2, contributionPct: -20 },
      ],
    });
    const paths = [makePath(['0xa', '0xb', '0xt']), makePath(['0xc', '0xd', '0xt'])];
    const weakeners = buildWeakeners(breakdown, 0.9, paths, [], true);
    expect(weakeners.find((w) => w.factor === 'Negative signals')).toBeDefined();
  });

  it('flags no personalized perspective when hasPerspective is false', () => {
    const weakeners = buildWeakeners(makeBreakdown(), 0.9, [], [], false);
    expect(weakeners.find((w) => w.factor === 'No personalized perspective')).toBeDefined();
  });

  it('does not fire perspective-gated weakeners when hasPerspective is false (only the no-perspective one)', () => {
    // High confidence, no paths, no contributors, no perspective.
    const weakeners = buildWeakeners(makeBreakdown(), 0.9, [], [], false);
    const factors = weakeners.map((w) => w.factor);
    expect(factors).toContain('No personalized perspective');
    expect(factors).not.toContain('Limited depth');
    expect(factors).not.toContain('Sparse neighborhood');
    expect(factors).not.toContain('Limited data');
    expect(factors).not.toContain('Centralization risk');
  });

  it('returns no weakeners for a strong, well-connected address with perspective', () => {
    const paths = [
      makePath(['0xa', '0xb', '0xt']),
      makePath(['0xc', '0xd', '0xt']),
    ];
    const contributors: TopContributor[] = [
      { address: '0xb', contribution: 0.5, predicate: 'trusts' },
      { address: '0xd', contribution: 0.5, predicate: 'trusts' },
    ];
    const weakeners = buildWeakeners(makeBreakdown(), 0.9, paths, contributors, true);
    expect(weakeners).toEqual([]);
  });

  it('flags no path from perspective when paths are empty with perspective', () => {
    const weakeners = buildWeakeners(makeBreakdown(), 0.9, [], [], true);
    const factors = weakeners.map((w) => w.factor);
    expect(factors).toContain('No path from perspective');
    expect(factors).not.toContain('Sparse neighborhood');
  });

  it('flags sparse neighborhood for many identical single-hop paths (one distinct route)', () => {
    const paths = Array.from({ length: 18 }, () => makePath(['0xsame', '0xt']));
    const weakeners = buildWeakeners(makeBreakdown(), 0.9, paths, [], true);
    const factors = weakeners.map((w) => w.factor);
    expect(factors).toContain('Sparse neighborhood');
    expect(factors).not.toContain('No path from perspective');
  });

  it('fires neither route weakener for 3 distinct routes with perspective', () => {
    const paths = [
      makePath(['0xf', '0xa', '0xt']),
      makePath(['0xf', '0xb', '0xt']),
      makePath(['0xf', '0xc', '0xt']),
    ];
    const weakeners = buildWeakeners(makeBreakdown(), 0.9, paths, [], true);
    const factors = weakeners.map((w) => w.factor);
    expect(factors).not.toContain('No path from perspective');
    expect(factors).not.toContain('Sparse neighborhood');
  });

  it('fires neither route weakener when there is no perspective', () => {
    const weakeners = buildWeakeners(makeBreakdown(), 0.9, [], [], false);
    const factors = weakeners.map((w) => w.factor);
    expect(factors).not.toContain('No path from perspective');
    expect(factors).not.toContain('Sparse neighborhood');
    expect(factors).toContain('No personalized perspective');
  });
});

// ============ buildSummary ============

describe('buildSummary', () => {
  const drivers: TrustDriver[] = [
    { factor: 'Network trust standing', impact: 'high', detail: 'x' },
    { factor: 'Graph influence', impact: 'medium', detail: 'y' },
  ];
  const weakeners: TrustWeakener[] = [{ factor: 'Limited data', detail: 'thin signals' }];
  const strongest: ExplainedPath = {
    hops: 2,
    route: ['0xa', '0xb', '0xt'],
    predicates: ['trusts', 'follow'],
    totalDecay: 0.5,
  };

  it('includes drivers, path detail, and weakener with perspective and a strongest path', () => {
    const summary = buildSummary(72, 0.85, 'well trusted', drivers, weakeners, strongest, 3, true);
    expect(summary).toContain('72.0/100 (well trusted)');
    expect(summary).toContain('driven mainly by network trust standing and graph influence');
    expect(summary).toContain("strongest being a 2-hop 'follow' chain");
    expect(summary).toContain('Worth noting: thin signals');
  });

  it('uses generic route wording when route count is positive but no strongest path', () => {
    const summary = buildSummary(50, 0.6, 'moderately trusted', drivers, [], null, 2, true);
    expect(summary).toContain('Trust reaches it through 2 routes.');
    expect(summary).not.toContain('strongest being');
  });

  it('omits path detail and adds the fromAddress nudge without perspective', () => {
    const summary = buildSummary(40, 0.5, 'moderately trusted', drivers, [], null, 0, false);
    expect(summary).not.toContain('Trust reaches it');
    expect(summary).toContain('Pass a fromAddress to surface specific paths and contributors.');
  });

  it('falls back to trust predicate when the strongest path has no predicates', () => {
    const noPredPath: ExplainedPath = { hops: 1, route: ['0xa', '0xt'], predicates: [], totalDecay: 0.5 };
    const summary = buildSummary(60, 0.7, 'well trusted', drivers, [], noPredPath, 1, true);
    expect(summary).toContain("'trust' chain");
  });

  it('emits only the opening sentence and the fromAddress nudge with no drivers or weakeners', () => {
    const summary = buildSummary(10, 0.1, 'minimally trusted', [], [], null, 0, false);
    expect(summary).toBe(
      'This address scores 10.0/100 (minimally trusted) at 10% confidence. ' +
        'Pass a fromAddress to surface specific paths and contributors.',
    );
  });

  it('surfaces centralization risk even when it is not the first weakener', () => {
    const ordered: TrustWeakener[] = [
      { factor: 'Limited depth', detail: 'local neighborhood only' },
      { factor: 'Centralization risk', detail: 'one source dominates' },
    ];
    const summary = buildSummary(50, 0.6, 'moderately trusted', drivers, ordered, strongest, 2, true);
    expect(summary).toContain('Worth noting: one source dominates');
    expect(summary).not.toContain('Worth noting: local neighborhood only');
  });

  it('uses singular route wording for a single distinct route', () => {
    const summary = buildSummary(60, 0.7, 'well trusted', drivers, [], strongest, 1, true);
    expect(summary).toContain('through 1 route, the strongest');
    expect(summary).not.toContain('1 routes');
    expect(summary).not.toContain('1 path(s)');
  });

  it('omits the route clause when distinct route count is zero with perspective', () => {
    const summary = buildSummary(45, 0.5, 'moderately trusted', drivers, [], null, 0, true);
    expect(summary).not.toContain('Trust reaches it through');
  });
});

// ============ explainTrustScore ============

describe('explainTrustScore', () => {
  it('populates the full explanation with a fromAddress and lowercases inputs', async () => {
    mockComposite.mockResolvedValue(
      makeComposite({
        address: '0xtarget',
        compositeScore: 82,
        confidence: 0.9,
        breakdown: makeBreakdown({
          eigentrust: { score: 0.5, normalizedScore: 0.9, rank: 1 },
          agentrank: { score: 0.4, normalizedScore: 0.8, rank: 1 },
          predicateContributions: [
            { predicate: 'trusts', weight: 1, normalizedWeight: 0.5, contributionPct: 50 },
          ],
        }),
      }),
    );

    const strongest = makePath(['0xfrom', '0xatt', '0xtarget'], 0.6, ['trusts', 'follow']);
    mockFindTrustPaths.mockResolvedValue({
      paths: [
        strongest,
        makePath(['0xfrom', '0xatt2', '0xtarget'], 0.4, ['trusts', 'trusts']),
        makePath(['0xfrom', '0xatt3', '0xtarget'], 0.3, ['trusts', 'trusts']),
      ],
      strongestPath: strongest,
      nodesVisited: 12,
    });

    const result = await explainTrustScore('0xTARGET', '0xFROM');

    expect(result.address).toBe('0xtarget');
    expect(result.fromAddress).toBe('0xfrom');
    expect(result.compositeScore).toBe(82);
    expect(result.confidence).toBe(0.9);
    expect(result.verdict).toBe('highly trusted');
    expect(result.summary).toContain('82.0/100');
    expect(result.drivers.length).toBeGreaterThan(0);
    expect(result.topContributors.length).toBeGreaterThan(0);
    expect(result.strongestPath).not.toBeNull();
    expect(result.strongestPath?.hops).toBe(2);

    // findTrustPaths called with normalized (lowercased) from -> address
    expect(mockFindTrustPaths).toHaveBeenCalledWith('0xfrom', '0xtarget');
  });

  it('skips path finding without a fromAddress and flags the missing perspective', async () => {
    mockComposite.mockResolvedValue(makeComposite({ compositeScore: 30, confidence: 0.5 }));

    const result = await explainTrustScore('0xTarget');

    expect(mockFindTrustPaths).not.toHaveBeenCalled();
    expect(result.fromAddress).toBeNull();
    expect(result.strongestPath).toBeNull();
    expect(result.topContributors).toEqual([]);
    expect(result.weakeners.find((w) => w.factor === 'No personalized perspective')).toBeDefined();
    expect(result.address).toBe('0xtarget');
  });
});
