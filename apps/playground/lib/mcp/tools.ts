import { z } from 'zod';
import { intuitionClient } from '../intuition/client';
import type { Attestation, TrustScore, VerificationResult, Expert } from '../intuition/types';

// Zod schemas for input validation
export const GetTrustScoreSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address')
});

export const GetAttestationsSchema = z.object({
  creator: z.string().optional(),
  subject: z.string().optional(),
  predicate: z.string().optional(),
  object: z.string().optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  fromTimestamp: z.number().optional(),
  toTimestamp: z.number().optional(),
  limit: z.number().min(1).max(1000).optional(),
  offset: z.number().min(0).optional()
});

export const VerifyCredentialSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  claim: z.string().min(1, 'Claim cannot be empty')
});

export const FindTrustedExpertsSchema = z.object({
  topic: z.string().min(1, 'Topic cannot be empty'),
  limit: z.number().min(1).max(100).optional().default(10)
});

// MCP Tool definitions
export const tools = [
  {
    name: 'getTrustScore',
    description: 'Get the trust score for an Ethereum address based on Intuition attestations. Returns a comprehensive trust score with breakdown by credibility, expertise, reliability, and reputation.',
    inputSchema: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Ethereum address to get trust score for (0x...)',
          pattern: '^0x[a-fA-F0-9]{40}$'
        }
      },
      required: ['address']
    }
  },
  {
    name: 'getAttestations',
    description: 'Query attestations from the Intuition graph with optional filters. Returns attestations (triples) that match the specified criteria.',
    inputSchema: {
      type: 'object',
      properties: {
        creator: {
          type: 'string',
          description: 'Filter by attestation creator address'
        },
        subject: {
          type: 'string',
          description: 'Filter by attestation subject (the entity being attested about)'
        },
        predicate: {
          type: 'string',
          description: 'Filter by attestation predicate (the type of claim/relationship)'
        },
        object: {
          type: 'string',
          description: 'Filter by attestation object (the value/target of the claim)'
        },
        minConfidence: {
          type: 'number',
          description: 'Minimum confidence score (0-1)',
          minimum: 0,
          maximum: 1
        },
        fromTimestamp: {
          type: 'number',
          description: 'Filter attestations from this timestamp (Unix seconds)'
        },
        toTimestamp: {
          type: 'number',
          description: 'Filter attestations until this timestamp (Unix seconds)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of attestations to return (default: 100, max: 1000)',
          minimum: 1,
          maximum: 1000
        },
        offset: {
          type: 'number',
          description: 'Number of attestations to skip (for pagination)',
          minimum: 0
        }
      }
    }
  },
  {
    name: 'verifyCredential',
    description: 'Verify if an address has a specific credential or claim on the Intuition network. Returns verification status with supporting attestations.',
    inputSchema: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Ethereum address to verify',
          pattern: '^0x[a-fA-F0-9]{40}$'
        },
        claim: {
          type: 'string',
          description: 'The credential/claim to verify (e.g., "expert-in-defi", "trusted-developer")'
        }
      },
      required: ['address', 'claim']
    }
  },
  {
    name: 'findTrustedExperts',
    description: 'Find the most trusted experts in a specific topic or domain based on Intuition attestations. Returns ranked list of experts with their trust scores.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Topic or domain to find experts in (e.g., "solidity", "defi", "security-audit")'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of experts to return (default: 10, max: 100)',
          minimum: 1,
          maximum: 100
        }
      },
      required: ['topic']
    }
  }
];

// Tool implementation functions
export async function handleGetTrustScore(params: unknown): Promise<TrustScore> {
  const validated = GetTrustScoreSchema.parse(params);
  return await intuitionClient.getTrustScore(validated.address);
}

export async function handleGetAttestations(params: unknown): Promise<Attestation[]> {
  const validated = GetAttestationsSchema.parse(params);
  return await intuitionClient.getAttestations(validated);
}

export async function handleVerifyCredential(params: unknown): Promise<VerificationResult> {
  const validated = VerifyCredentialSchema.parse(params);
  return await intuitionClient.verifyCredential(validated.address, validated.claim);
}

export async function handleFindTrustedExperts(params: unknown): Promise<Expert[]> {
  const validated = FindTrustedExpertsSchema.parse(params);
  return await intuitionClient.findTrustedExperts(validated.topic, validated.limit);
}
