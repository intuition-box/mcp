# Performance Benchmarks

Performance benchmark suite for all major trust scoring operations in `mcp-trust`.

---

## Running Benchmarks

Run the full benchmark suite:

```bash
npx vitest run src/__tests__/benchmarks.test.ts
```

Run with verbose output (shows individual test names):

```bash
npx vitest run src/__tests__/benchmarks.test.ts --reporter=verbose
```

The suite prints a summary table to stdout after all benchmarks complete.

---

## Methodology

### Test Graph

Each benchmark runs against a deterministic mock graph:

| Parameter | Value |
|-----------|-------|
| Address nodes | 100 |
| Attestation edges | 500 |
| Predicates used | trusts, follow, vouches, visits_for_work, visits_for_learning |
| Stake range | 0.1 -- 1.0 ETH (in wei) |
| Edge distribution | Deterministic pseudo-random via prime-based index mapping |

The graph is large enough to exercise convergence loops, matrix construction,
and path aggregation at realistic scale, while small enough to run in CI
without dedicated infrastructure.

### Execution

- Each operation is executed **5 times** sequentially
- Wall-clock time is measured per run using `performance.now()`
- The scoring engine cache is cleared before each benchmark to ensure
  full recomputation (no cache hits)
- Neo4j is mocked at the session level -- the benchmark measures algorithm
  computation time (matrix building, power iteration, convergence detection,
  path trust calculation), not network latency

### What Is Measured

The benchmarks isolate **algorithm computation time** by mocking the Neo4j
driver. The mock returns pre-generated data for each query pattern (address
lists, edge lists, path objects, count results). This means:

- **Included**: matrix construction, iterative convergence, score normalization,
  path trust calculation, confidence computation, resistance scoring
- **Excluded**: Neo4j network round-trips, Cypher query planning, disk I/O

This is intentional -- the algorithms must be fast regardless of database
latency. Neo4j performance should be monitored separately via query profiling.

---

## Benchmarked Operations

| # | Operation | Description |
|---|-----------|-------------|
| 1 | `computeEigenTrust` | Full EigenTrust power iteration over 100 nodes, 500 edges. Builds transition matrix, iterates until convergence (threshold 0.0001, max 100 iterations), computes confidence scores. |
| 2 | `computeAgentRank` | Full PageRank computation over the same graph. Builds weighted adjacency, iterates with damping factor 0.85, computes influence metrics (Gini, entropy, top-10% share). |
| 3 | `computeCompositeScore` (global) | Single-address composite score without `fromAddress`. Runs EigenTrust + AgentRank, normalizes against network max, redistributes transitive trust weight. |
| 4 | `computeCompositeScore` (personalized) | Single-address composite with `fromAddress`. Same as above plus personalized trust path query, direct trust check, and path aggregation. |
| 5 | `findTrustPaths` | 3-hop path traversal between two addresses. Parses Neo4j path objects, calculates per-hop trust (stake * predicate weight * decay), sorts by strength. |
| 6 | `simulateSybilAttack` | Full sybil simulation with 10 injected nodes and 40 collusion edges. Runs EigenTrust + AgentRank twice (baseline + attack), calculates resistance metrics, guarantees cleanup. |

---

## Target Thresholds

| Metric | Threshold | Rationale |
|--------|-----------|-----------|
| Average duration | < 3000ms | MCP tool responses should feel interactive. 3 seconds is the upper bound for a single tool call before users perceive delay. |

All 6 benchmarks must pass for the suite to succeed. Any single benchmark
exceeding the 3-second average threshold causes a test failure.

### Scaling Considerations

The 3-second target applies to the 100-node / 500-edge test graph. For
production graphs:

- EigenTrust and AgentRank scale as O(iterations * edges). A 10,000-node
  graph with 50,000 edges should converge within seconds on modern hardware.
- Pathfinding depends on `maxHops` and graph connectivity. The 1-10 hop
  clamp and 1,000-path limit prevent runaway queries.
- Sybil simulation runs the global algorithms twice. Budget 2x the
  single-computation time.
- Composite scoring caches global results for 5 minutes. After the initial
  computation, per-address lookups are O(1).

---

## Output Format

Each benchmark produces a result object:

```typescript
{
  operation: string,   // Human-readable operation name
  runs: number,        // Number of executions (default 5)
  avgMs: number,       // Mean duration across all runs
  minMs: number,       // Fastest run
  maxMs: number,       // Slowest run (often the first due to JIT warmup)
  passed: boolean      // true if avgMs < 3000
}
```

The suite prints a formatted summary table after all benchmarks complete:

```
BENCHMARK RESULTS SUMMARY
------------------------------------------------------------------------------------------------
Operation                                Runs      Avg (ms)      Min (ms)      Max (ms)    Status
------------------------------------------------------------------------------------------------
computeEigenTrust                           5        10.67          3.61         25.95      PASS
computeAgentRank                            5         2.32          1.24          4.26      PASS
compositeScore (global)                     5         2.42          0.04         11.89      PASS
compositeScore (personalized)               5         3.24          0.37         14.12      PASS
findTrustPaths (3 hops)                     5         0.32          0.20          0.44      PASS
simulateSybilAttack (10 nodes)              5        14.84         12.25         20.15      PASS
------------------------------------------------------------------------------------------------
All 6 benchmarks passed (target: < 3000ms avg)
------------------------------------------------------------------------------------------------
```

---

## Adding New Benchmarks

To add a benchmark for a new operation:

1. Import the function in `src/__tests__/benchmarks.test.ts`
2. Add any new query patterns to the `queryRouter` function if the operation
   uses Neo4j queries not already handled
3. Add a test case using the `benchmark()` helper:

```typescript
it('myNewOperation -- description', async () => {
  const result = await benchmark('myNewOperation', () =>
    myNewOperation(args)
  );
  expect(result.passed).toBe(true);
  expect(result.avgMs).toBeLessThan(TARGET_MS);
});
```

The result is automatically collected and included in the summary table.
