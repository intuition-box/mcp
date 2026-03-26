# Trust Scoring Algorithms -- Technical Specification

This document describes every trust-scoring algorithm in `mcp-trust`, how the
graph indexer feeds data into Neo4j, and how the MCP tools expose these
algorithms to consumers.

---

## Quick Reference: MCP Tools

| Tool | Algorithm / Data Source | Required Params | Optional Params |
|------|------------------------|-----------------|-----------------|
| `get_graph_stats` | `getGraphStats()` | -- | -- |
| `get_sync_health` | `getGraphStats()` | -- | -- |
| `get_sync_status` | `getSyncStatus()` (cron state) | -- | -- |
| `get_predicate_config` | `TRUST_PREDICATES`, `DEFAULT_WEIGHTS` | -- | -- |
| `compute_eigentrust` | `computeEigenTrust()` | -- | -- |
| `compute_agentrank` | `computeAgentRank()` | -- | `topN` |
| `compute_composite_score` | `computeCompositeScore()` | `address` | `fromAddress`, weight overrides |
| `compute_personalized_trust` | `computePersonalizedTrust()` | `fromAddress`, `toAddress` | `maxHops`, `minStake` |
| `find_trust_paths` | `findTrustPaths()` | `fromAddress`, `toAddress` | `maxHops`, `predicateWeights` |
| `simulate_sybil_attack` | `simulateSybilAttack()` | -- | `numSybilNodes`, `targetAddress` |

---

## 1. EigenTrust

### Overview

Implementation of the EigenTrust algorithm (Kamvar, Schlosser, Garcia-Molina, 2003)
for sybil-resistant global trust computation. Computes the principal eigenvector of
a normalized trust matrix through iterative power iteration.

### Input

The attestation graph stored in Neo4j:
- **Nodes**: `Address` entities with `id`, `label`, `total_stake`, `attestation_count`
- **Edges**: `ATTESTS` relationships with `stakeAmount`, `predicate`, `tripleId`, `timestamp`

Graph data is fetched in a single Cypher query by `fetchGraphData()`, which returns
all addresses and all `ATTESTS` edges.

### Algorithm

1. **Initialize** -- uniform trust distribution: `t[i] = 1/n` for all `n` addresses.
2. **Build transition matrix** -- for each edge from `j` to `i`:
   - Edge weight = `stakeAmount * predicateWeight`
   - Row-normalize so each node's outgoing weights sum to 1 (stochastic matrix).
   - Nodes with no outgoing edges are dangling nodes; their trust is
     distributed uniformly during iteration.
3. **Iterate** -- single iteration formula:

```
t'[i] = (1 - alpha) * p[i]  +  alpha * SUM_j( C[j][i] * t[j] )
```

Where:
- `alpha = 1 - pretrustWeight` (default `1 - 0.1 = 0.9`)
- `p[i]` is the pretrust vector (uniform distribution in base implementation)
- `C[j][i]` is the normalized transition matrix entry
- Dangling node contribution is added uniformly: `danglingSum / n`

4. **Normalize** scores after each iteration to maintain a proper distribution.
5. **Check convergence** -- stop when `max(|t'[i] - t[i]|) < threshold` or
   `iterations >= maxIterations`.

### Output

`TrustComputationResult`:
- `scores`: `TrustScore[]` -- sorted descending by score, each with:
  - `address`, `score` (0-1), `confidence` (0-1), `pathCount`, `sources`
- `iterations`: number of iterations until convergence
- `converged`: boolean
- `computationTimeMs`: wall-clock time

Confidence is calculated on a logarithmic scale based on incoming attestation count:
`confidence = min(1, log2(incomingCount + 1) / log2(n))`.

### Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxIterations` | 100 | Upper bound on power iteration rounds |
| `convergenceThreshold` | 0.0001 | Max absolute delta to declare convergence |
| `decayFactor` | 0.6 | Used by pathfinding, not directly in EigenTrust iteration |
| `pretrustWeight` | 0.1 | Controls pretrust vector influence (higher = more uniform) |

### Complexity

- **Time**: O(iterations * edges) per iteration -- matrix-vector multiply
- **Space**: O(nodes + edges) for the transition matrix and score vectors
- Typical convergence within 15-30 iterations on real attestation graphs

---

## 2. AgentRank

### Overview

PageRank variant that computes influence scores based on graph structure and
stake weights. Unlike EigenTrust, AgentRank has no pre-trusted peer requirement
and is purely structure-based.

### Algorithm

Standard PageRank with weighted edges:

```
rank'[i] = (1 - d) / n  +  d * SUM_j( rank[j] * w[j->i] / outW[j] )
```

Where:
- `d` is the damping factor (default 0.85)
- `w[j->i]` is the edge weight from `j` to `i` (stakeAmount * predicateWeight)
- `outW[j]` is the sum of all outgoing edge weights from `j`
- `n` is the total number of nodes
- Dangling nodes (no outgoing edges) distribute rank uniformly

### Input

Same graph data as EigenTrust. `buildWeightedAdjacency()` constructs:
- `inLinks`: for each node, a map of incoming neighbors to their normalized edge weights
- `outWeights`: total outgoing weight per node

Optional `stakeWeighted` flag (default `true`). When false, only predicate weights
are used, ignoring stake amounts.

### Output

`AgentRankResult`:
- `ranks`: `Map<string, number>` -- address to influence score
- `iterations`, `converged`, `computationTimeMs`
- `topAgents`: `AgentSummary[]` -- top N agents with in/out degree
- `influenceMetrics`: network-level statistics

### Influence Metrics

Computed over the final rank distribution:

| Metric | Formula | Meaning |
|--------|---------|---------|
| Gini coefficient | `(2 * weightedSum) / (n * totalRank) - (n+1)/n` | Rank inequality (0 = equal, 1 = concentrated) |
| Shannon entropy | `-SUM(p_i * log2(p_i))` where `p_i = rank_i / totalRank` | Rank distribution spread |
| Top 10% share | Sum of top-decile ranks / total rank | Concentration in top agents |
| Median rank | Middle value in sorted rank list | Typical agent influence |

### Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `dampingFactor` | 0.85 | Probability of following a link (vs random teleport) |
| `maxIterations` | 100 | Upper bound on iteration rounds |
| `convergenceThreshold` | 1e-6 | Max absolute delta for convergence |
| `minRank` | 0.001 | Floor preventing zero-rank nodes |
| `stakeWeighted` | true | Whether to incorporate stake amounts |

---

## 3. Composite Scoring Engine

### Overview

The primary consumer-facing module. Combines three independent signals into a
single 0-100 score per address:

1. **EigenTrust** -- global sybil-resistant trust
2. **AgentRank** -- structural influence
3. **Transitive Trust** -- personalized path-based trust (optional)

### Default Weights

| Component | Weight | When |
|-----------|--------|------|
| EigenTrust | 0.4 | Always |
| AgentRank | 0.3 | Always |
| Transitive Trust | 0.3 | Only when `fromAddress` is provided |

Weights are configurable per-call via `eigentrustWeight`, `agentRankWeight`,
and `transitiveTrustWeight` parameters on the `compute_composite_score` tool.

### Weight Redistribution

When `fromAddress` is omitted, transitive trust cannot be computed. The
`resolveWeights()` function redistributes its weight proportionally:

```
redistributedEigentrust = eigentrust / (eigentrust + agentrank)
redistributedAgentrank  = agentrank  / (eigentrust + agentrank)
transitiveTrust         = 0
```

Edge case: if both `eigentrust + agentrank <= 0`, falls back to 0.5/0.5.

### Normalization

Each component is normalized against the network maximum before weighting:

```
etNormalized = etScore / maxEigentrustScore    (0-1)
arNormalized = arScore / maxAgentrankScore     (0-1)
ttScore      = raw transitive trust score      (already 0-1)

rawComposite = w_et * etNormalized + w_ar * arNormalized + w_tt * ttScore
compositeScore = clamp(rawComposite * 100, 0, 100)
```

### Confidence Metric

Measures data availability and signal strength (0-1):

```
availabilityFactor = signalsPresent / totalExpectedSignals
strengthFactor     = mean( min(1, score * 1000) for each nonzero signal )
confidence         = 0.6 * availabilityFactor + 0.4 * strengthFactor
```

EigenTrust and AgentRank scores are scaled by 1000x before clamping because
raw scores are typically very small (e.g. 0.003). Transitive trust scores
are used directly (already on a 0-1 scale).

### Caching

Global computations (EigenTrust + AgentRank) are cached with a configurable
TTL (default 300,000ms / 5 minutes). Per-address lookups against cached data
are O(1). Cache is shared across calls within the same process.

- `cacheResults`: boolean (default `true`)
- `cacheTTL`: milliseconds (default `300000`)
- `clearScoreCache()`: forces recomputation on next call

### Batch API

`batchCompositeScores(addresses, fromAddress?, config?)` runs EigenTrust and
AgentRank once, then resolves all addresses in O(1) per address. If
`fromAddress` is provided, transitive trust is computed sequentially for each
target via `batchTransitiveTrust()` to avoid overloading Neo4j with concurrent
path queries.

Self-loop optimization: when `fromAddress === targetAddress`, returns `{score: 1, paths: 0}`
without running a path query.

### Output

`CompositeScoreResult`:

```
{
  address: string,
  compositeScore: number,        // 0-100
  confidence: number,            // 0-1
  breakdown: {
    eigentrust:      { score, normalizedScore, rank },
    agentrank:       { score, normalizedScore, rank },
    transitiveTrust: { score, paths, maxHops },
  },
  metadata: {
    totalNodes: number,
    computeTimeMs: number,
    dataFreshness: Date,
  }
}
```

---

## 4. Multi-Hop Transitive Trust

### Overview

Computes personalized trust between two specific addresses by traversing
attestation paths in the Neo4j graph. This is the only algorithm that takes
a source/target pair rather than computing over the entire network.

### Path Traversal

Uses Neo4j variable-length Cypher pattern matching:

```cypher
MATCH path = (source:Address {id: $from})-[:ATTESTS*1..<maxHops>]->(target:Address {id: $to})
```

The hop range is clamped to `[1, 10]` regardless of input. Results are limited
to 1,000 paths maximum (`MAX_PATHS_LIMIT`).

### Per-Hop Trust Formula

For each hop `i` in a path:

```
hopTrust[i] = normalizeStake(stakeAmount) * predicateWeight * decayFactor^i
```

Where:
- `normalizeStake(stake) = log(stake + 1) / log(1e18)` -- logarithmic normalization
  that maps raw stake (in wei) to [0, 1] with diminishing returns
- `predicateWeight` is looked up from the predicate registry (custom overrides supported)
- `decayFactor^i` reduces trust exponentially with distance

Total path trust is the product of all hop trusts, clamped to [0, 1]:

```
pathTrust = PRODUCT( hopTrust[i] for i in 0..hops-1 )
```

### Default Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `decayFactor` | 0.6 | Trust retained per hop (0.6^3 = 21.6% at 3 hops) |
| `maxHops` | 3 | Default traversal depth (configurable 1-10) |
| `minStake` | 0 | Minimum stake threshold for path filtering |

### Path Aggregation

`aggregatePathTrust()` combines multiple paths into a single score using
weighted averaging. Shorter paths receive higher weight:

```
weight[path] = 1.5 ^ (maxHops - pathLength)
```

For example with `maxHops = 3`:
- 1-hop path: weight = 1.5^2 = 2.25
- 2-hop path: weight = 1.5^1 = 1.50
- 3-hop path: weight = 1.5^0 = 1.00

Confidence is computed from two factors (60/40 blend):
- **Path count factor**: `min(1, log2(pathCount + 1) / log2(threshold + 1))`
  where `threshold = 5`
- **Consistency factor**: `1 - min(1, standardDeviation)` of path trust values

### Personalized PageRank

`computePersonalizedTrustNetwork()` runs a full personalized PageRank from
a source address, with teleportation probability back to the source:

| Parameter | Value |
|-----------|-------|
| Damping factor | 0.85 |
| Max iterations | 50 |
| Convergence threshold | 0.0001 |

### Direct Trust Shortcut

`getDirectTrust()` checks for a single-hop attestation and uses sigmoid
normalization:

```
normalizedStake = 2 / (1 + e^(-stake / 1e15)) - 1
```

### Exported Functions

| Function | Purpose |
|----------|---------|
| `findTrustPaths(from, to, maxHops, predicateWeights)` | Find all paths between two addresses |
| `findOutgoingTrustPaths(from, maxHops)` | Find all reachable addresses from a source |
| `calculatePathTrust(path, decayFactor, predicateWeights)` | Calculate trust for a single path |
| `normalizeStake(stake)` | Log-scale stake normalization |
| `getPathsFromCypherResult(records)` | Transform Neo4j records to TrustPath objects |
| `computePersonalizedTrust(query)` | Personalized trust between two addresses |
| `computePersonalizedTrustNetwork(from, maxHops)` | Personalized PageRank from a source |
| `aggregatePathTrust(paths, maxHops)` | Weighted path aggregation |
| `computeTrustWithDecay(from, to, maxHops)` | 70% strongest path + 30% aggregate blend |
| `getDirectTrust(from, to)` | Single-hop trust check |

---

## 5. Sybil Resistance

### Overview

`simulateSybilAttack()` measures how well the trust algorithms resist
coordinated fake-identity attacks. It runs a before/after experiment on
the live graph.

### Simulation Process

1. **Baseline capture** -- run EigenTrust and AgentRank on the clean graph.
2. **Inject sybil nodes** -- create `numSybilNodes` fake addresses with
   deterministic IDs: `0xsybil<4-hex-index><34-zeros>`.
3. **Create collusion edges** -- add `numCollusionEdges` (default: numSybilNodes * 4)
   random `ATTESTS` relationships between sybil pairs. Each edge carries
   a configurable stake (default 0.01 ETH). Self-loops and duplicates are avoided.
4. **Attack capture** -- rerun EigenTrust and AgentRank on the contaminated graph.
5. **Cleanup** -- remove all sybil nodes and their relationships (guaranteed
   by try/finally).
6. **Calculate resistance** -- compare baseline and attack scores for
   legitimate addresses only.

### Resistance Score

Computed by `calculateResistance()`:

```
avgAbsoluteChange = mean( |attacked[i] - baseline[i]| )  for legitimate addresses only
avgBaselineScore  = mean( baseline[i] )                   for legitimate addresses only
resistance        = clamp(1 - avgAbsoluteChange / avgBaselineScore, 0, 1)
```

| Score | Meaning |
|-------|---------|
| 1.0 | No impact -- scores unchanged |
| 0.7-0.9 | Good resistance -- minor perturbation |
| 0.3-0.6 | Moderate vulnerability |
| 0.0 | Complete compromise -- scores fully manipulated |

The function also returns `maxChange` (worst single-address deviation) and
`avgChange` (mean absolute change).

### Default Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `numSybilNodes` | 50 | Fake identities to inject |
| `numCollusionEdges` | 200 | Random inter-sybil attestations |
| `sybilStake` | 0.01 | ETH stake per collusion edge |
| `targetAddress` | undefined | Optional specific target to attempt boosting |

### Output

`SybilSimulationResult`:
- `resistanceScore`: 0-1 (higher = more resistant)
- `maxChange`, `avgChange`: impact metrics
- `baselineScores`, `attackedScores`: full score maps for analysis
- `sybilCount`, `collusionEdges`: simulation parameters

---

## 6. Graph Indexer

### Overview

The indexer syncs attestation data from the Intuition GraphQL API into the
Neo4j graph database. It handles pagination, batched writes, error recovery,
and sync health tracking.

### Sync Pipeline

```
1. loadConfig()          -- Load Neo4j URI, GraphQL endpoint, batch size
2. initializeDriver()    -- Create Neo4j driver connection
3. verifyConnection()    -- Confirm Neo4j is reachable
4. setupSchema()         -- Create constraints and indexes (idempotent)
5. initializeGraphQLClient()
6. [optional] clearGraph()  -- If clearFirst is true
7. fetchAllTriples()     -- Async generator yielding batches of IntuitionTriple[]
8. transformTriples()    -- Convert triples to AddressNode[] + AttestationEdge[]
9. upsertAddresses()     -- MERGE nodes in batches
10. upsertAttestations() -- MERGE edges in batches
11. Write Meta node      -- Sync health metadata
12. closeDriver()
```

### Pagination Strategy

`fetchAllTriples()` is an async generator that yields pages of triples from
the Intuition GraphQL API. Each page fetches up to `pageSize` triples (default 1000).
The generator continues until all triples are fetched or `maxPages` is reached.

Each yielded batch is processed independently: transformed, then upserted to
Neo4j before the next batch is fetched. This keeps memory usage bounded
regardless of total triple count.

### Transform Pipeline

For each `IntuitionTriple`:

1. **Validate** creator address (`isValidAddress` -- `0x` + 40 hex chars)
2. **Extract creator node** -- lowercase address, label from creator object
   or truncated address (`0xaaaaaaaa...`)
3. **Extract subject node** -- from `subject.wallet_id` if valid
4. **Calculate stake** -- `triple_vault.total_assets / 1e18` (wei to ETH)
5. **Create edge** -- `creator -> subject` with predicate label, stake, triple ID, timestamp
6. **Deduplicate** -- nodes in the same batch are merged, accumulating
   `total_stake` and `attestation_count`

### Neo4j Schema

Created by `setupSchema()` (idempotent with IF NOT EXISTS):

| Type | Name | Target |
|------|------|--------|
| Unique constraint | `address_id_unique` | `Address.id` |
| Index | `address_label_index` | `Address.label` |
| Index | `attests_predicate_index` | `ATTESTS.predicate` |
| Index | `attests_timestamp_index` | `ATTESTS.timestamp` |
| Index | `attests_triple_id_index` | `ATTESTS.tripleId` |

### Meta Node -- Sync Health Tracking

After each sync, a `Meta` node is written (or updated) in Neo4j:

```cypher
MERGE (m:Meta {key: 'sync'})
SET m.lastSyncedAt    = $now,
    m.nodesCreated    = $nodesCreated,
    m.edgesCreated    = $edgesCreated,
    m.errorCount      = $errorCount,
    m.durationMs      = $durationMs,
    m.totalNodes      = $totalNodes,
    m.totalEdges      = $totalEdges,
    m.status          = $status
```

| Field | Type | Description |
|-------|------|-------------|
| `lastSyncedAt` | ISO 8601 string | Timestamp of sync completion |
| `status` | `"success"` or `"partial"` | `partial` if any batch errors occurred |
| `durationMs` | number | Total wall-clock time |
| `nodesCreated` | number | Addresses upserted in this sync |
| `edgesCreated` | number | Attestations upserted in this sync |
| `errorCount` | number | Batch errors encountered |
| `totalNodes` | number | Total addresses in graph post-sync |
| `totalEdges` | number | Total attestations in graph post-sync |

These fields are exposed through `get_graph_stats` and `get_sync_health` tools.

### Auto-Sync Cron Job

Configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_SYNC_CRON` | `"false"` | Must be `"true"` to start the cron job |
| `SYNC_SCHEDULE` | `"0 * * * *"` | Cron expression (default: top of every hour) |
| `SYNC_INTERVAL_PRESET` | -- | Human-friendly alias (takes precedence over `SYNC_SCHEDULE`) |

Preset values for `SYNC_INTERVAL_PRESET`:

| Preset | Cron Expression | Schedule |
|--------|----------------|----------|
| `"hourly"` | `0 * * * *` | Every hour at minute 0 |
| `"daily"` | `0 0 * * *` | Midnight daily |
| `"twice-daily"` | `0 0,12 * * *` | Midnight and noon |

The cron job has `noOverlap: true` -- if a sync is still running when the
next scheduled run fires, the second run is skipped.

`get_sync_status` returns: `isRunning`, `nextRun`, `lastRunSuccess`.

### SyncResult

```typescript
{
  nodesCreated: number,
  nodesUpdated: number,
  edgesCreated: number,
  edgesUpdated: number,
  errors: string[],     // Batch error messages
  duration: number,     // Milliseconds
}
```

---

## 7. Predicate Weights

### Predicate Registry

All 9 recognized predicates with their on-chain term IDs and default weights:

| Predicate | Term ID | Default Weight | Purpose |
|-----------|---------|----------------|---------|
| `trusts` | `0x3a73f3b1613d166eea141a25a2adc70db9304ab3c4e90daecad05f86487c3ee9` | **1.0** | Primary trust signal |
| `distrust` | `0x93dd055a971886b66c5f4d9c29098ebdd9b7991890b6372a7e184c64321c9710` | **-0.5** | Negative trust (penalizes score) |
| `follow` | *(none)* | **0.7** | Social follow relationship |
| `visits_for_work` | `0x73872e1840362760d0144599493fc6f22ec5042f85ae7b8904576999a189d76b` | **0.4** | Work-related visits |
| `visits_for_learning` | `0x5d6fcc892d3634b61e743d256289dd95f60604ee07f170aea9b4980b5eeda282` | **0.3** | Learning-related visits |
| `visits_for_fun` | `0xb8b8ab8d23678edad85cec5e580caeb564a88b532f8dfd884f93dcf2cab32459` | **0.2** | Leisure visits |
| `visits_for_inspiration` | `0xd635b7467c9f89a9d243b82c5e4f6a97d238ad91a914b5de9949e107e5f59825` | **0.2** | Inspirational visits |
| `visits_for_buying` | `0x3b2089f0aa24da0473fd1ad01c555c80c6b17e6ac1de39c68c588640487f845d` | **0.2** | Purchase visits |
| `visits_for_music` | `0xdeced28a3213eec9e29e42ded5302864b0db614f708599e552a7aac7f40f8fb7` | **0.2** | Music-related visits |

There is also a legacy `PREDICATE_WEIGHTS` map in `constants.ts` with a
subset of predicates (trusts: 1.0, vouches: 0.9, follow: 0.7, has tag: 0.3,
Intuition: 0.5) and a `DEFAULT_PREDICATE_WEIGHT` of 0.5. The canonical
registry is in `config/predicates.ts`.

### Weight Resolution

The `getPredicateWeight(predicate, customWeights?)` function resolves weights
with the following priority:

```
1. customWeights[predicate]   -- runtime override (if provided)
2. DEFAULT_WEIGHTS[predicate] -- registry default
3. 0                          -- unknown predicate fallback
```

### Custom Overrides

Custom weights can be passed at the tool level:

- `find_trust_paths` accepts a `predicateWeights` object (e.g. `{"trusts": 1.0, "follow": 0.5}`)
- `computeEigenTrust` and `buildTransitionMatrix` accept a `PredicateWeights` parameter
- Custom weights only need to include predicates being overridden; unmentioned predicates
  use their defaults

### Design Rationale

- **trusts (1.0)**: Highest-signal predicate -- explicit trust relationship
- **distrust (-0.5)**: Negative weight penalizes trust scores along paths containing distrust
- **follow (0.7)**: Strong social signal but less explicit than trust
- **visits_for_work (0.4)**: Behavioral signal, moderate weight
- **visits_for_* (0.2-0.3)**: Weakest signals -- behavioral but not explicit trust indicators
- Visit weights decrease by purpose: work (0.4) > learning (0.3) > fun/inspiration/buying/music (0.2)
