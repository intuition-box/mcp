import { NextRequest, NextResponse } from 'next/server';
import { intuitionClient } from '@/lib/intuition/client';
import type { AttestationFilters } from '@/lib/intuition/types';

/**
 * GET /api/attestations
 *
 * Query attestations from the Intuition graph with optional filters
 *
 * Query parameters:
 * - creator: Filter by creator address
 * - subject: Filter by subject address
 * - predicate: Filter by predicate
 * - object: Filter by object
 * - minConfidence: Minimum confidence score (0-1)
 * - fromTimestamp: Filter from timestamp (Unix seconds)
 * - toTimestamp: Filter to timestamp (Unix seconds)
 * - limit: Maximum results (default: 100, max: 1000)
 * - offset: Pagination offset (default: 0)
 *
 * Example: /api/attestations?subject=0x1234...&limit=50
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Build filters object from query parameters
    const filters: AttestationFilters = {};

    const creator = searchParams.get('creator');
    if (creator) filters.creator = creator;

    const subject = searchParams.get('subject');
    if (subject) filters.subject = subject;

    const predicate = searchParams.get('predicate');
    if (predicate) filters.predicate = predicate;

    const object = searchParams.get('object');
    if (object) filters.object = object;

    const minConfidence = searchParams.get('minConfidence');
    if (minConfidence) {
      const confidence = parseFloat(minConfidence);
      if (isNaN(confidence) || confidence < 0 || confidence > 1) {
        return NextResponse.json(
          { error: 'minConfidence must be a number between 0 and 1' },
          { status: 400 }
        );
      }
      filters.minConfidence = confidence;
    }

    const fromTimestamp = searchParams.get('fromTimestamp');
    if (fromTimestamp) {
      const timestamp = parseInt(fromTimestamp);
      if (isNaN(timestamp)) {
        return NextResponse.json(
          { error: 'fromTimestamp must be a valid Unix timestamp' },
          { status: 400 }
        );
      }
      filters.fromTimestamp = timestamp;
    }

    const toTimestamp = searchParams.get('toTimestamp');
    if (toTimestamp) {
      const timestamp = parseInt(toTimestamp);
      if (isNaN(timestamp)) {
        return NextResponse.json(
          { error: 'toTimestamp must be a valid Unix timestamp' },
          { status: 400 }
        );
      }
      filters.toTimestamp = timestamp;
    }

    const limit = searchParams.get('limit');
    if (limit) {
      const limitNum = parseInt(limit);
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
        return NextResponse.json(
          { error: 'limit must be a number between 1 and 1000' },
          { status: 400 }
        );
      }
      filters.limit = limitNum;
    }

    const offset = searchParams.get('offset');
    if (offset) {
      const offsetNum = parseInt(offset);
      if (isNaN(offsetNum) || offsetNum < 0) {
        return NextResponse.json(
          { error: 'offset must be a non-negative number' },
          { status: 400 }
        );
      }
      filters.offset = offsetNum;
    }

    // Fetch attestations from Intuition
    const attestations = await intuitionClient.getAttestations(filters);

    return NextResponse.json({
      success: true,
      data: attestations,
      count: attestations.length,
      filters,
    });
  } catch (error) {
    console.error('Error fetching attestations:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch attestations',
      },
      { status: 500 }
    );
  }
}
