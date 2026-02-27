import { GraphQLClient } from 'graphql-request';
import type {
  Attestation,
  AttestationFilters,
  TrustScore,
  VerificationResult,
  Expert
} from './types';

export class IntuitionClient {
  private client: GraphQLClient;
  private apiUrl: string;

  constructor() {
    this.apiUrl = process.env.NEXT_PUBLIC_INTUITION_GRAPH_URL || 'https://mainnet.intuition.sh/v1/graphql';
    this.client = new GraphQLClient(this.apiUrl, {
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }

  /**
   * Query attestations (triples) from Intuition graph
   */
  async getAttestations(filters: AttestationFilters = {}): Promise<Attestation[]> {
    const query = `
      query GetTriples($limit: Int) {
        triples(limit: $limit) {
          subject_id
          predicate_id
          object_id
          term_id
          creator_id
          created_at
          subject {
            data
            label
            wallet_id
          }
          predicate {
            data
            label
          }
          object {
            data
            label
          }
          term {
            id
          }
        }
      }
    `;

    try {
      const data = await this.client.request<{ triples: any[] }>(query, {
        limit: filters.limit || 100
      });

      return (data.triples || []).map(triple => ({
        id: triple.term_id || triple.term?.id || '',
        creator: triple.creator_id || '',
        subject: triple.subject?.data || triple.subject?.label || triple.subject?.wallet_id || triple.subject_id || '',
        predicate: triple.predicate?.data || triple.predicate?.label || triple.predicate_id || '',
        object: triple.object?.data || triple.object?.label || triple.object_id || '',
        timestamp: new Date(triple.created_at).getTime(),
        confidence: 0.8,
        stake: triple.term?.id || triple.term_id || '0',
        metadata: {
          subject_id: triple.subject_id,
          predicate_id: triple.predicate_id,
          object_id: triple.object_id,
          creator_id: triple.creator_id,
          term_id: triple.term_id
        }
      }));
    } catch (error) {
      console.error('Error fetching attestations:', error);
      throw new Error(`Failed to fetch attestations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate trust score for an address
   */
  async getTrustScore(address: string): Promise<TrustScore> {
    const attestations = await this.getAttestations({ limit: 1000 });

    // Search for address in subject, object (case-insensitive, partial match)
    const searchTerm = address.toLowerCase();
    const relevantAttestations = attestations.filter(a => {
      const subjectMatch = a.subject.toLowerCase().includes(searchTerm) ||
                          a.creator.toLowerCase().includes(searchTerm);
      const objectMatch = a.object.toLowerCase().includes(searchTerm);
      return subjectMatch || objectMatch;
    });

    if (relevantAttestations.length === 0) {
      return {
        address,
        score: 0,
        attestationCount: 0,
        positiveAttestations: 0,
        negativeAttestations: 0,
        lastUpdated: Date.now(),
        breakdown: {
          credibility: 0,
          expertise: 0,
          reliability: 0,
          reputation: 0
        }
      };
    }

    // Predicate weighting system (MVP: hardcoded weights)
    const predicateWeights: Record<string, number> = {
      'verified': 1.5,
      'trusted': 1.3,
      'expert': 1.2,
      'credible': 1.2,
      'reliable': 1.1,
      'endorsed': 1.1,
      'scam': -2.0,
      'fraud': -2.0,
      'suspicious': -1.5,
      'untrusted': -1.3
    };

    let weightedScore = 0;
    let positiveCount = 0;
    let negativeCount = 0;
    let totalWeight = 0;

    relevantAttestations.forEach(att => {
      const predicateText = att.predicate.toLowerCase();
      let weight = 1.0; // Default weight

      // Find matching predicate weight
      for (const [keyword, multiplier] of Object.entries(predicateWeights)) {
        if (predicateText.includes(keyword)) {
          weight = multiplier;
          break;
        }
      }

      // Apply weight
      weightedScore += weight;
      totalWeight += Math.abs(weight);

      if (weight > 0) positiveCount++;
      if (weight < 0) negativeCount++;
    });

    // Normalize score as percentage
    const totalAttestations = attestations.length;
    const normalizedScore = totalAttestations > 0
      ? ((relevantAttestations.length / totalAttestations) * weightedScore * 10)
      : 0;

    const finalScore = Math.min(Math.max(normalizedScore, 0), 100);

    return {
      address,
      score: finalScore,
      attestationCount: relevantAttestations.length,
      positiveAttestations: positiveCount,
      negativeAttestations: negativeCount,
      lastUpdated: Date.now(),
      breakdown: {
        credibility: finalScore,
        expertise: finalScore,
        reliability: finalScore,
        reputation: finalScore
      }
    };
  }

  /**
   * Verify credential
   */
  async verifyCredential(address: string, claim: string): Promise<VerificationResult> {
    const attestations = await this.getAttestations({ limit: 500 });
    
    const searchAddress = address.toLowerCase();
    const searchClaim = claim.toLowerCase();
    
    const matching = attestations.filter(a => 
      (a.subject.toLowerCase().includes(searchAddress) ||
       a.creator.toLowerCase().includes(searchAddress) ||
       a.object.toLowerCase().includes(searchAddress)) &&
      (a.predicate.toLowerCase().includes(searchClaim) ||
       a.object.toLowerCase().includes(searchClaim))
    );

    const verified = matching.length > 0;
    const avgConfidence = verified 
      ? matching.reduce((sum, a) => sum + a.confidence, 0) / matching.length 
      : 0;

    return {
      verified,
      attestations: matching,
      confidence: avgConfidence,
      message: verified 
        ? `Found ${matching.length} attestation(s) for "${claim}"`
        : `No attestations found for "${claim}"`
    };
  }

  /**
   * Find trusted experts
   */
  async findTrustedExperts(topic: string, limit: number = 10): Promise<Expert[]> {
    const attestations = await this.getAttestations({ limit: 500 });
    
    const topicLower = topic.toLowerCase();
    const topicAttestations = attestations.filter(a => 
      a.predicate.toLowerCase().includes(topicLower) ||
      a.object.toLowerCase().includes(topicLower)
    );

    const expertMap = new Map<string, number>();
    topicAttestations.forEach(att => {
      const count = expertMap.get(att.subject) || 0;
      expertMap.set(att.subject, count + 1);
    });

    const experts: Expert[] = Array.from(expertMap.entries()).map(([address, count]) => ({
      address,
      trustScore: Math.min(50 + count * 10, 100),
      attestationCount: count,
      specializations: [topic],
      recentActivity: Date.now()
    }));

    return experts
      .sort((a, b) => b.attestationCount - a.attestationCount)
      .slice(0, limit);
  }
}

export const intuitionClient = new IntuitionClient();