import { NextRequest, NextResponse } from 'next/server';
import { intuitionClient } from '@/lib/intuition/client';
import { resolveAddressOrENS } from '@/lib/intuition/ens';

/**
 * GET /api/trust-score
 *
 * Get trust score for an Ethereum address or ENS name
 *
 * Query parameters:
 * - address: Ethereum address (0x...) or ENS name (vitalik.eth)
 * - ens: Alternative parameter for ENS name (optional)
 *
 * Examples:
 * - /api/trust-score?address=0x1234567890123456789012345678901234567890
 * - /api/trust-score?address=vitalik.eth
 * - /api/trust-score?ens=nick.eth
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const input = searchParams.get('address') || searchParams.get('ens');

    // Validate input parameter
    if (!input) {
      return NextResponse.json(
        { error: 'Missing required parameter: address or ens' },
        { status: 400 }
      );
    }

    // Resolve ENS or validate address
    const resolution = await resolveAddressOrENS(input);

    if (!resolution.address) {
      return NextResponse.json(
        { error: resolution.error || 'Invalid address or ENS name' },
        { status: 400 }
      );
    }

    // Fetch trust score from Intuition using resolved address
    const trustScore = await intuitionClient.getTrustScore(resolution.address);

    return NextResponse.json({
      success: true,
      data: {
        ...trustScore,
        address: resolution.address,
        ensName: resolution.ensName || null,
        resolvedFrom: resolution.isENS ? 'ens' : 'address',
      },
    });
  } catch (error) {
    console.error('Error fetching trust score:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch trust score',
      },
      { status: 500 }
    );
  }
}
