/**
 * Fetch Intuition GraphQL schema via introspection
 * Run with: npx tsx src/scripts/introspect.ts
 */

import 'dotenv/config';

const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    positions_type: __type(name: "positions") {
      name
      fields {
        name
        type {
          name
          kind
          ofType { name kind }
        }
      }
    }
    terms_type: __type(name: "terms") {
      name
      fields {
        name
        type {
          name
          kind
          ofType { name kind }
        }
      }
    }
    triple_vault_type: __type(name: "triple_vault") {
      name
      fields {
        name
        type {
          name
          kind
          ofType { name kind }
        }
      }
    }
  }
`;

async function introspect() {
  const endpoint = process.env.GRAPHQL_ENDPOINT || 'https://mainnet.intuition.sh/v1/graphql';
  
  console.log('Fetching schema from:', endpoint);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: INTROSPECTION_QUERY }),
    });

    const data = await response.json();
    
    if (data.errors) {
      console.error('GraphQL Errors:', JSON.stringify(data.errors, null, 2));
      return;
    }

    console.log('\n=== POSITIONS TYPE ===');
    console.log(JSON.stringify(data.data.positions_type, null, 2));
    console.log('\n=== TERMS TYPE ===');
    console.log(JSON.stringify(data.data.terms_type, null, 2));
    console.log('\n=== TRIPLE_VAULT TYPE ===');
    console.log(JSON.stringify(data.data.triple_vault_type, null, 2));

  } catch (error) {
    console.error('Fetch error:', error);
  }
}

introspect();