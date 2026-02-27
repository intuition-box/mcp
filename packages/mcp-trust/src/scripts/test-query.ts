/**
 * Test a simple query against Intuition GraphQL
 * Run with: npx tsx src/scripts/test-query.ts
 */

import 'dotenv/config';

// Try the simplest possible query first
const SIMPLE_QUERY = `
  query TestTriples {
    triples(limit: 1) {
      __typename
    }
  }
`;

async function testQuery() {
  const endpoint = process.env.GRAPHQL_ENDPOINT || 'https://api.i7n.app/v1/graphql';

  console.log('Testing endpoint:', endpoint);
  console.log('');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: SIMPLE_QUERY }),
    });

    console.log('Response status:', response.status);
    console.log('');

    const data = await response.json();

    if (data.errors) {
      console.error('GraphQL Errors:');
      console.error(JSON.stringify(data.errors, null, 2));
      return;
    }

    console.log('=== SUCCESS ===');
    console.log(JSON.stringify(data.data, null, 2));

  } catch (error) {
    console.error('Fetch error:', error);
  }
}

testQuery();
