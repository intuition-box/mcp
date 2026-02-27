// Types for Intuition attestation system
export interface Attestation {
  id: string;
  creator: string;
  subject: string;
  predicate: string;
  object: string;
  timestamp: number;
  confidence: number;
  stake?: string;
  metadata?: Record<string, any>;
}

export interface TrustScore {
  address: string;
  score: number;
  attestationCount: number;
  positiveAttestations: number;
  negativeAttestations: number;
  lastUpdated: number;
  breakdown: {
    credibility: number;
    expertise: number;
    reliability: number;
    reputation: number;
  };
}

export interface AttestationFilters {
  creator?: string;
  subject?: string;
  predicate?: string;
  object?: string;
  minConfidence?: number;
  fromTimestamp?: number;
  toTimestamp?: number;
  limit?: number;
  offset?: number;
}

export interface VerificationResult {
  verified: boolean;
  attestations: Attestation[];
  confidence: number;
  message: string;
}

export interface Expert {
  address: string;
  trustScore: number;
  attestationCount: number;
  specializations: string[];
  recentActivity: number;
}

export interface GraphQLResponse<T> {
  data: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
  }>;
}