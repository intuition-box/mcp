# Trust Scoring Algorithms -- Technical Specification

Intuition Protocol's trust infrastructure for computing reputation, influence,
and sybil resistance over on-chain attestation graphs. These algorithms power
the MCP tools that AI agents and developers use to query, score, and reason
about trust relationships in the Intuition ecosystem.

**Quick Jump:**
[EigenTrust](#1-eigentrust) | [AgentRank](#2-agentrank) | [Composite Scoring](#3-composite-scoring-engine) | [Transitive Trust](#4-multi-hop-transitive-trust) | [Sybil Resistance](#5-sybil-resistance) | [Graph Indexer](#6-graph-indexer) | [Predicate Weights](#7-predicate-weights)

---

## Table of Contents

- [MCP Tools Quick Reference](#mcp-tools-quick-reference)
- [1. EigenTrust](#1-eigentrust)
  - [Overview](#overview)
  - [Input](#input)
  - [Algorithm](#algorithm)
  - [Output](#output)
  - [Key Parameters](#key-parameters)
  - [Complexity](#complexity)
- [2. AgentRank](#2-agentrank)
  - [Overview](#overview-1)
  - [Algorithm](#algorithm-1)
  - [Input](#input-1)
  - [Output](#output-1)
  - [Influence Metrics](#influence-metrics)
  - [Key Parameters](#key-parameters-1)
- [3. Composite Scoring Engine](#3-composite-scoring-engine)
  - [Overview](#overview-2)
  - [Default Weights](#default-weights)
  - [Weight Redistribution](#weight-redistribution)
  - [Normalization](#normalization)
  - [Confidence Metric](#confidence-metric)
  - [Caching](#caching)
  - [Batch API](#batch-api)
  - [Output](#output-2)
- [4. Multi-Hop Transitive Trust](#4-multi-hop-transitive-trust)
  - [Overview](#overview-3)
  - [Path Traversal](#path-traversal)
  - [Per-Hop Trust Formula](#per-hop-trust-formula)
  - [Default Parameters](#default-parameters)
  - [Path Aggregation](#path-aggregation)
  - [Personalized PageRank](#personalized-pagerank)
  - [Direct Trust Shortcut](#direct-trust-shortcut)
  - [Available Operations](#available-operations)
- [5. Sybil Resistance](#5-sybil-resistance)
  - [Overview](#overview-4)
  - [Simulation Process](#simulation-process)
  - [Resistance Score](#resistance-score)
  - [Default Configuration](#default-configuration)
  - [Output](#output-3)
- [6. Graph Indexer](#6-graph-indexer)
  - [Overview](#overview-5)
  - [Sync Pipeline](#sync-pipeline)
  - [Pagination Strategy](#pagination-strategy)
  - [Transform Pipeline](#transform-pipeline)
  - [Neo4j Schema](#neo4j-schema)
  - [Sync Health Tracking](#sync-health-tracking)
  - [Auto-Sync Cron Job](#auto-sync-cron-job)
  - [Sync Result](#sync-result)
- [7. Predicate Weights](#7-predicate-weights)
  - [Predicate Registry](#predicate-registry)
  - [Weight Resolution](#weight-resolution)
  - [Custom Overrides](#custom-overrides)
  - [Design Rationale](#design-rationale)

---

## MCP Tools Quick Reference

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `get_graph_stats` | Graph statistics (node/edge counts, labels) | -- | -- |
| `get_sync_health` | Sync health metrics (status, duration, errors) | -- | -- |
| `get_sync_status` | Auto-sync cron job status | -- | -- |
| `get_predicate_config` | Predicate registry with term IDs and weights | -- | -- |
| `get_lens_registry` | Available trust lenses (filtered graph views) | -- | -- |
| `compute_eigentrust` | Global EigenTrust scores for all addresses | -- | -- |
| `compute_agentrank` | Global AgentRank influence scores | -- | `topN` |
| `compute_composite_score` | Composite score combining all trust signals | `address` | `fromAddress`, weight overrides |
| `compute_personalized_trust` | Personalized trust between two addresses | `fromAddress`, `toAddress` | `maxHops`, `minStake` |
| `find_trust_paths` | All trust paths between two addresses | `fromAddress`, `toAddress` | `maxHops`, `predicateWeights` |
| `simulate_sybil_attack` | Sybil resistance simulation and scoring | -- | `numSybilNodes`, `targetAddress` |

---

## 1. EigenTrust

### Overview

Implementation of the EigenTrust algorithm (Kamvar, Schlosser, Garcia-Molina, 2003)
for sybil-resistant global trust computation. Computes the principal eigenvector of
a normalized trust matrix through iterative power iteration.

### Input

The attestation graph stored in Neo4j:
- **Nodes**: Address entities with id, label, total stake, and attestation count
- **Edges**: ATTESTS relationships with stake amount, predicate type, triple ID, and timestamp

All addresses and attestation edges are fetched in a single pass before
computation begins.

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
- `p[i]` is the pretrust vector (uniform distribution in the base implementation)
- `C[j][i]` is the normalized transition matrix entry
- Dangling node contribution is added uniformly: `danglingSum / n`

4. **Normalize** scores after each iteration to maintain a proper distribution.
5. **Check convergence** -- stop when `max(|t'[i] - t[i]|) < threshold` or
   `iterations >= maxIterations`.

### Output

- `scores` -- sorted descending by score, each entry containing:
  address, score (0-1), confidence (0-1), path count, and source addresses
- `iterations` -- number of iterations until convergence
- `converged` -- whether the algorithm converged within the iteration limit
- `computationTimeMs` -- wall-clock computation time

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

[Back to top](#table-of-contents)

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

Same attestation graph as EigenTrust. The weighted adjacency is constructed as:
- `inLinks` -- for each node, a map of incoming neighbors to their normalized edge weights
- `outWeights` -- total outgoing weight per node

An optional `stakeWeighted` flag (default `true`) controls whether stake amounts
are factored into edge weights. When false, only predicate weights are used.

### Output

- `ranks` -- map of address to influence score
- `iterations`, `converged`, `computationTimeMs`
- `topAgents` -- top N agents with in-degree and out-degree
- `influenceMetrics` -- network-level distribution statistics

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

[Back to top](#table-of-contents)

---

## 3. Composite Scoring Engine

### Overview

The primary consumer-facing scoring module. Combines three independent signals
into a single 0-100 score per address:

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

When `fromAddress` is omitted, transitive trust cannot be computed. Its weight
is redistributed proportionally to the remaining components:

```
redistributedEigentrust = eigentrust / (eigentrust + agentrank)
redistributedAgentrank  = agentrank  / (eigentrust + agentrank)
transitiveTrust         = 0
```

Edge case: if both `eigentrust + agentrank <= 0`, falls back to 0.5 / 0.5.

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

Measures data availability and signal strength on a 0-1 scale:

```
availabilityFactor = signalsPresent / totalExpectedSignals
strengthFactor     = mean( min(1, score * 1000) for each nonzero signal )
confidence         = 0.6 * availabilityFactor + 0.4 * strengthFactor
```

EigenTrust and AgentRank raw scores are scaled by 1000x before clamping because
they are typically very small (e.g. 0.003). Transitive trust scores are used
directly since they are already on a 0-1 scale.

### Caching

Global computations (EigenTrust + AgentRank) are cached with a configurable
TTL (default 5 minutes). Per-address lookups against cached data are O(1).
Cache is shared across calls within the same process.

| Setting | Default | Description |
|---------|---------|-------------|
| `cacheResults` | `true` | Whether to cache global algorithm results |
| `cacheTTL` | 300,000 ms | Time-to-live for cached results |

### Batch API

The batch endpoint runs EigenTrust and AgentRank once, then resolves all
requested addresses in O(1) per address. When `fromAddress` is provided,
transitive trust is computed sequentially for each target to avoid overloading
the database with concurrent path queries.

Self-loop optimization: when `fromAddress` equals the target address, the
engine returns `{score: 1, paths: 0}` without running a path query.

### Output

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

[Back to top](#table-of-contents)

---

## 4. Multi-Hop Transitive Trust

### Overview

Computes personalized trust between two specific addresses by traversing
attestation paths in the graph. This is the only algorithm that takes a
source/target pair rather than computing over the entire network.

### Path Traversal

Uses variable-length pattern matching to discover all attestation paths
between a source and target address:

```cypher
MATCH path = (source:Address {id: $from})-[:ATTESTS*1..<maxHops>]->(target:Address {id: $to})
```

The hop range is clamped to `[1, 10]` regardless of input. Results are limited
to 1,000 paths maximum.

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

Multiple paths are combined into a single score using weighted averaging.
Shorter paths receive higher weight:

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

A full personalized PageRank can be run from a source address, with
teleportation probability back to the source. This scores all reachable
addresses relative to the source.

| Parameter | Value |
|-----------|-------|
| Damping factor | 0.85 |
| Max iterations | 50 |
| Convergence threshold | 0.0001 |

### Direct Trust Shortcut

For single-hop queries, a fast path checks for a direct attestation and
uses sigmoid normalization:

```
normalizedStake = 2 / (1 + e^(-stake / 1e15)) - 1
```

### Available Operations

| Operation | Purpose |
|-----------|---------|
| Find trust paths | All paths between two addresses, ranked by strength |
| Find outgoing paths | All reachable addresses from a source |
| Calculate path trust | Trust value for a single path |
| Normalize stake | Log-scale stake normalization to [0, 1] |
| Personalized trust | Aggregated trust from one address to another |
| Personalized network | Personalized PageRank from a source to all reachable nodes |
| Trust with decay | 70% strongest path + 30% aggregate blend |
| Direct trust | Single-hop attestation check |

[Back to top](#table-of-contents)

---

## 5. Sybil Resistance

### Overview

The sybil simulation measures how well EigenTrust and AgentRank resist
coordinated fake-identity attacks. It runs a controlled before/after
experiment on the live graph with guaranteed cleanup.

### Simulation Process

1. **Baseline capture** -- run EigenTrust and AgentRank on the clean graph.
2. **Inject sybil nodes** -- create `numSybilNodes` fake addresses with
   deterministic, identifiable IDs.
3. **Create collusion edges** -- add random attestation relationships between
   sybil pairs. Each edge carries a configurable stake (default 0.01 ETH).
   Self-loops and duplicates are avoided.
4. **Attack capture** -- rerun EigenTrust and AgentRank on the contaminated graph.
5. **Cleanup** -- remove all sybil nodes and their relationships (guaranteed
   via try/finally).
6. **Calculate resistance** -- compare baseline and attack scores for
   legitimate addresses only.

### Resistance Score

```
avgAbsoluteChange = mean( |attacked[i] - baseline[i]| )  for legitimate addresses only
avgBaselineScore  = mean( baseline[i] )                   for legitimate addresses only
resistance        = clamp(1 - avgAbsoluteChange / avgBaselineScore, 0, 1)
```

| Score | Meaning |
|-------|---------|
| 1.0 | No impact -- scores unchanged |
| 0.7 - 0.9 | Good resistance -- minor perturbation |
| 0.3 - 0.6 | Moderate vulnerability |
| 0.0 | Complete compromise -- scores fully manipulated |

The result also includes `maxChange` (worst single-address deviation) and
`avgChange` (mean absolute change across all legitimate addresses).

### Default Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `numSybilNodes` | 50 | Fake identities to inject |
| `numCollusionEdges` | 200 | Random inter-sybil attestations |
| `sybilStake` | 0.01 | ETH stake per collusion edge |
| `targetAddress` | -- | Optional specific address to attempt boosting |

### Output

- `resistanceScore` (0-1, higher = more resistant)
- `maxChange`, `avgChange` -- impact metrics
- `baselineScores`, `attackedScores` -- full score maps for analysis
- `sybilCount`, `collusionEdges` -- simulation parameters used

[Back to top](#table-of-contents)

---

## 6. Graph Indexer

### Overview

The indexer syncs attestation data from the Intuition GraphQL API into the
Neo4j graph database. It handles pagination, batched writes, error recovery,
and sync health tracking.

### Sync Pipeline

```
 1. Load configuration        (Neo4j URI, GraphQL endpoint, batch size)
 2. Initialize Neo4j driver
 3. Verify connection
 4. Create schema             (constraints and indexes, idempotent)
 5. Initialize GraphQL client
 6. [optional] Clear graph    (if clearFirst is true)
 7. Fetch triples             (async generator yielding batches)
 8. Transform triples         (convert to address nodes + attestation edges)
 9. Upsert addresses          (MERGE nodes in batches)
10. Upsert attestations       (MERGE edges in batches)
11. Write sync metadata       (Meta node with health data)
12. Close driver
```

### Pagination Strategy

Triples are fetched through an async generator that yields pages from the
Intuition GraphQL API. Each page fetches up to `pageSize` triples (default 1000).
The generator continues until all triples are fetched or `maxPages` is reached.

Each yielded batch is processed independently -- transformed, then upserted to
Neo4j before the next batch is fetched. This keeps memory usage bounded
regardless of total triple count.

### Transform Pipeline

For each attestation triple:

1. **Validate** creator address (must match `0x` + 40 hex characters)
2. **Extract creator node** -- lowercase address, label from creator metadata
   or truncated address fallback
3. **Extract subject node** -- from the subject's wallet address if valid
4. **Calculate stake** -- `total_assets / 1e18` (wei to ETH conversion)
5. **Create edge** -- creator to subject with predicate label, stake, triple ID,
   and timestamp
6. **Deduplicate** -- nodes in the same batch are merged, accumulating
   total stake and attestation count

### Neo4j Schema

Created idempotently on each sync:

| Type | Name | Target |
|------|------|--------|
| Unique constraint | `address_id_unique` | `Address.id` |
| Index | `address_label_index` | `Address.label` |
| Index | `attests_predicate_index` | `ATTESTS.predicate` |
| Index | `attests_timestamp_index` | `ATTESTS.timestamp` |
| Index | `attests_triple_id_index` | `ATTESTS.tripleId` |

### Sync Health Tracking

After each sync, a Meta node is written (or updated) in Neo4j with health data:

| Field | Type | Description |
|-------|------|-------------|
| `lastSyncedAt` | ISO 8601 string | Timestamp of sync completion |
| `status` | `"success"` or `"partial"` | `"partial"` if any batch errors occurred |
| `durationMs` | number | Total wall-clock time |
| `nodesCreated` | number | Addresses upserted in this sync |
| `edgesCreated` | number | Attestations upserted in this sync |
| `errorCount` | number | Batch errors encountered |
| `totalNodes` | number | Total addresses in graph post-sync |
| `totalEdges` | number | Total attestations in graph post-sync |

These fields are exposed through the `get_graph_stats` and `get_sync_health` tools.

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

The cron job prevents overlap -- if a sync is still running when the next
scheduled run fires, the second run is skipped.

The `get_sync_status` tool returns: `isRunning`, `nextRun`, `lastRunSuccess`.

### Sync Result

```
{
  nodesCreated: number,
  nodesUpdated: number,
  edgesCreated: number,
  edgesUpdated: number,
  errors: string[],
  duration: number       // milliseconds
}
```

[Back to top](#table-of-contents)

---

## 7. Predicate Weights

### Predicate Registry

All 9 recognized predicates with their on-chain term IDs and default weights:

| Predicate | Term ID | Default Weight | Purpose |
|-----------|---------|----------------|---------|
| `trusts` | `0x3a73f3b1...c3ee9` | **1.0** | Primary trust signal |
| `distrust` | `0x93dd055a...9710` | **-0.5** | Negative trust (penalizes score) |
| `follow` | *(none)* | **0.7** | Social follow relationship |
| `visits_for_work` | `0x73872e18...d76b` | **0.4** | Work-related visits |
| `visits_for_learning` | `0x5d6fcc89...a282` | **0.3** | Learning-related visits |
| `visits_for_fun` | `0xb8b8ab8d...2459` | **0.2** | Leisure visits |
| `visits_for_inspiration` | `0xd635b746...9825` | **0.2** | Inspirational visits |
| `visits_for_buying` | `0x3b2089f0...845d` | **0.2** | Purchase visits |
| `visits_for_music` | `0xdeced28a...8fb7` | **0.2** | Music-related visits |

Full term IDs are available via the `get_predicate_config` tool.

### Weight Resolution

Predicate weights are resolved with the following priority:

```
1. Custom runtime override    (if provided per-call)
2. Registry default           (from the predicate table above)
3. 0                          (unknown predicate fallback)
```

### Custom Overrides

Custom weights can be passed at the tool level:

- `find_trust_paths` accepts a `predicateWeights` object
  (e.g. `{"trusts": 1.0, "follow": 0.5}`)
- `compute_eigentrust` accepts predicate weight overrides for matrix construction
- Custom weights only need to include predicates being overridden; unmentioned
  predicates fall back to their registry defaults

### Design Rationale

- **trusts (1.0)** -- highest-signal predicate, an explicit trust relationship
- **distrust (-0.5)** -- negative weight penalizes trust scores along paths
  containing distrust attestations
- **follow (0.7)** -- strong social signal but less explicit than trust
- **visits_for_work (0.4)** -- behavioral signal with moderate weight
- **visits_for_* (0.2-0.3)** -- weakest signals, behavioral but not explicit
  trust indicators
- Visit weights decrease by intentionality: work (0.4) > learning (0.3) >
  fun / inspiration / buying / music (0.2)

[Back to top](#table-of-contents)
