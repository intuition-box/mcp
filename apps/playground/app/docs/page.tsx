import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Navigation */}
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent cursor-pointer">
              Intuition MCP
            </h1>
          </Link>
          <div className="flex gap-4">
            <Link href="/">
              <Button variant="ghost">Home</Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="ghost">Dashboard</Button>
            </Link>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h2 className="text-4xl font-bold mb-2">Documentation</h2>
          <p className="text-slate-600">Complete guide to the Intuition MCP Server</p>
        </div>

        <div className="space-y-8">
          {/* Introduction */}
          <section>
            <h3 className="text-2xl font-bold mb-4">Introduction</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              The Intuition MCP Server provides a Model Context Protocol interface for querying trust scores,
              attestations, and verifying credentials on the Intuition network. It enables AI assistants like
              Claude to access on-chain reputation and attestation data.
            </p>
          </section>

          {/* Installation */}
          <section>
            <h3 className="text-2xl font-bold mb-4">Installation</h3>
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">1. Clone and Install</h4>
                    <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-sm overflow-x-auto">
{`git clone https://github.com/yourusername/intuition-mcp-server
cd intuition-mcp-server
npm install`}
                    </pre>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">2. Configure Environment</h4>
                    <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-sm overflow-x-auto">
{`# .env.local
NEXT_PUBLIC_INTUITION_GRAPH_URL=https://graph.intuition.systems/graphql`}
                    </pre>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">3. Run Development Server</h4>
                    <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-sm overflow-x-auto">
npm run dev
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Claude Desktop Setup */}
          <section>
            <h3 className="text-2xl font-bold mb-4">Claude Desktop Integration</h3>
            <Card>
              <CardHeader>
                <CardTitle>Configure MCP Server</CardTitle>
                <CardDescription>
                  Add the following configuration to your Claude Desktop config file
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm mb-2 text-slate-600">
                  <strong>Config file location:</strong>
                </p>
                <ul className="text-sm mb-4 space-y-1 text-slate-600">
                  <li>• macOS: <code className="bg-slate-100 px-1 rounded">~/Library/Application Support/Claude/claude_desktop_config.json</code></li>
                  <li>• Windows: <code className="bg-slate-100 px-1 rounded">%APPDATA%\Claude\claude_desktop_config.json</code></li>
                </ul>
                <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-sm overflow-x-auto">
{`{
  "mcpServers": {
    "intuition": {
      "command": "node",
      "args": [
        "C:/absolute/path/to/intuition-mcp-server/lib/mcp/server.js"
      ],
      "env": {
        "NEXT_PUBLIC_INTUITION_GRAPH_URL": "https://graph.intuition.systems/graphql"
      }
    }
  }
}`}
                </pre>
                <p className="text-sm mt-4 text-slate-600">
                  After updating the config, restart Claude Desktop for changes to take effect.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* MCP Tools */}
          <section>
            <h3 className="text-2xl font-bold mb-4">MCP Tools Reference</h3>

            <div className="space-y-4">
              {/* getTrustScore */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-blue-600">getTrustScore</CardTitle>
                  <CardDescription>
                    Get comprehensive trust score for an Ethereum address
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h5 className="font-semibold mb-2">Parameters</h5>
                    <ul className="text-sm space-y-1">
                      <li>• <code className="bg-slate-100 px-1 rounded">address</code> (string, required): Ethereum address (0x...)</li>
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-semibold mb-2">Returns</h5>
                    <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto">
{`{
  "address": "0x...",
  "score": 85.5,
  "attestationCount": 42,
  "positiveAttestations": 38,
  "negativeAttestations": 4,
  "lastUpdated": 1234567890,
  "breakdown": {
    "credibility": 88.2,
    "expertise": 90.1,
    "reliability": 82.5,
    "reputation": 85.5
  }
}`}
                    </pre>
                  </div>
                  <div>
                    <h5 className="font-semibold mb-2">Example Usage</h5>
                    <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-sm overflow-x-auto">
{`// In Claude conversation:
"What is the trust score for address 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb?"`}
                    </pre>
                  </div>
                </CardContent>
              </Card>

              {/* getAttestations */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-purple-600">getAttestations</CardTitle>
                  <CardDescription>
                    Query attestations with flexible filters
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h5 className="font-semibold mb-2">Parameters</h5>
                    <ul className="text-sm space-y-1">
                      <li>• <code className="bg-slate-100 px-1 rounded">creator</code> (string, optional): Filter by creator address</li>
                      <li>• <code className="bg-slate-100 px-1 rounded">subject</code> (string, optional): Filter by subject address</li>
                      <li>• <code className="bg-slate-100 px-1 rounded">predicate</code> (string, optional): Filter by predicate/claim type</li>
                      <li>• <code className="bg-slate-100 px-1 rounded">object</code> (string, optional): Filter by object value</li>
                      <li>• <code className="bg-slate-100 px-1 rounded">minConfidence</code> (number, optional): Minimum confidence (0-1)</li>
                      <li>• <code className="bg-slate-100 px-1 rounded">limit</code> (number, optional): Max results (default: 100, max: 1000)</li>
                      <li>• <code className="bg-slate-100 px-1 rounded">offset</code> (number, optional): Pagination offset</li>
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-semibold mb-2">Returns</h5>
                    <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto">
{`[
  {
    "id": "triple-123",
    "creator": "0x...",
    "subject": "0x...",
    "predicate": "expert-in-solidity",
    "object": "true",
    "timestamp": 1234567890,
    "confidence": 0.95,
    "stake": "vault-456"
  }
]`}
                    </pre>
                  </div>
                  <div>
                    <h5 className="font-semibold mb-2">Example Usage</h5>
                    <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-sm overflow-x-auto">
{`// In Claude conversation:
"Show me all attestations for address 0x... with predicate 'expert-in-defi'"`}
                    </pre>
                  </div>
                </CardContent>
              </Card>

              {/* verifyCredential */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-pink-600">verifyCredential</CardTitle>
                  <CardDescription>
                    Verify if an address has a specific credential or claim
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h5 className="font-semibold mb-2">Parameters</h5>
                    <ul className="text-sm space-y-1">
                      <li>• <code className="bg-slate-100 px-1 rounded">address</code> (string, required): Ethereum address to verify</li>
                      <li>• <code className="bg-slate-100 px-1 rounded">claim</code> (string, required): Credential/claim to verify</li>
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-semibold mb-2">Returns</h5>
                    <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto">
{`{
  "verified": true,
  "attestations": [...],
  "confidence": 0.92,
  "message": "Address 0x... has 5 attestation(s) for 'expert-in-defi' with 92.0% confidence"
}`}
                    </pre>
                  </div>
                  <div>
                    <h5 className="font-semibold mb-2">Example Usage</h5>
                    <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-sm overflow-x-auto">
{`// In Claude conversation:
"Is address 0x... verified as 'trusted-developer'?"`}
                    </pre>
                  </div>
                </CardContent>
              </Card>

              {/* findTrustedExperts */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-orange-600">findTrustedExperts</CardTitle>
                  <CardDescription>
                    Find and rank experts in a specific topic or domain
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h5 className="font-semibold mb-2">Parameters</h5>
                    <ul className="text-sm space-y-1">
                      <li>• <code className="bg-slate-100 px-1 rounded">topic</code> (string, required): Topic or domain to search</li>
                      <li>• <code className="bg-slate-100 px-1 rounded">limit</code> (number, optional): Max experts (default: 10, max: 100)</li>
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-semibold mb-2">Returns</h5>
                    <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto">
{`[
  {
    "address": "0x...",
    "trustScore": 92.5,
    "attestationCount": 47,
    "specializations": ["solidity"],
    "recentActivity": 1234567890
  }
]`}
                    </pre>
                  </div>
                  <div>
                    <h5 className="font-semibold mb-2">Example Usage</h5>
                    <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-sm overflow-x-auto">
{`// In Claude conversation:
"Who are the top 5 experts in 'smart-contract-security'?"`}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* API Endpoints */}
          <section>
            <h3 className="text-2xl font-bold mb-4">HTTP API Endpoints</h3>
            <p className="text-slate-700 mb-4">
              You can also access the MCP tools via HTTP endpoints when running the Next.js development server.
            </p>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">GET /api/trust-score</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-sm">
{`curl "http://localhost:3000/api/trust-score?address=0x..."`}
                  </pre>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">GET /api/attestations</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-sm">
{`curl "http://localhost:3000/api/attestations?subject=0x...&limit=50"`}
                  </pre>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">POST /api/mcp</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-sm">
{`curl -X POST http://localhost:3000/api/mcp \\
  -H "Content-Type: application/json" \\
  -d '{
    "tool": "verifyCredential",
    "params": {
      "address": "0x...",
      "claim": "expert-in-defi"
    }
  }'`}
                  </pre>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* TypeScript Types */}
          <section>
            <h3 className="text-2xl font-bold mb-4">TypeScript Types</h3>
            <Card>
              <CardContent className="pt-6">
                <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto">
{`interface TrustScore {
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

interface Attestation {
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

interface VerificationResult {
  verified: boolean;
  attestations: Attestation[];
  confidence: number;
  message: string;
}

interface Expert {
  address: string;
  trustScore: number;
  attestationCount: number;
  specializations: string[];
  recentActivity: number;
}`}
                </pre>
              </CardContent>
            </Card>
          </section>

          {/* Resources */}
          <section>
            <h3 className="text-2xl font-bold mb-4">Resources</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Intuition Systems</CardTitle>
                  <CardDescription>Learn about the Intuition protocol</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href="https://intuition.systems" target="_blank" className="text-blue-600 hover:underline">
                    intuition.systems →
                  </Link>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Model Context Protocol</CardTitle>
                  <CardDescription>Official MCP documentation</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href="https://modelcontextprotocol.io" target="_blank" className="text-blue-600 hover:underline">
                    modelcontextprotocol.io →
                  </Link>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Try Dashboard</CardTitle>
                  <CardDescription>Test the API in your browser</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href="/dashboard" className="text-blue-600 hover:underline">
                    Go to Dashboard →
                  </Link>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">GitHub Repository</CardTitle>
                  <CardDescription>View source code</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href="https://github.com" target="_blank" className="text-blue-600 hover:underline">
                    GitHub →
                  </Link>
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
