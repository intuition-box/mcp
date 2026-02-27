'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatPercentage, truncateAddress, formatTimestamp, getScoreColor, copyToClipboard } from '@/lib/utils';
import { resolveAddressOrENS } from '@/lib/intuition/ens';

export default function DashboardPage() {
  const [address, setAddress] = useState('');
  const [topic, setTopic] = useState('');
  const [claim, setClaim] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState('');
  const [ensName, setEnsName] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  const handleGetTrustScore = async () => {
    if (!address) {
      setError('Please enter an address or ENS name');
      return;
    }

    setLoading(true);
    setIsResolving(true);
    setError(null);
    setResult(null);
    setResolvedAddress('');
    setEnsName('');

    try {
      // Resolve ENS or validate address
      const resolution = await resolveAddressOrENS(address);
      setIsResolving(false);

      if (!resolution.address) {
        throw new Error(resolution.error || 'Invalid address or ENS name');
      }

      setResolvedAddress(resolution.address);
      if (resolution.isENS && resolution.ensName) {
        setEnsName(resolution.ensName);
      }

      // Fetch trust score with resolved address
      const response = await fetch(`/api/trust-score?address=${resolution.address}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch trust score');
      }

      setResult(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setIsResolving(false);
    }
  };

  const handleGetAttestations = async () => {
    if (!address) {
      setError('Please enter an address or ENS name');
      return;
    }

    setLoading(true);
    setIsResolving(true);
    setError(null);
    setResult(null);
    setResolvedAddress('');
    setEnsName('');

    try {
      // Resolve ENS or validate address
      const resolution = await resolveAddressOrENS(address);
      setIsResolving(false);

      if (!resolution.address) {
        throw new Error(resolution.error || 'Invalid address or ENS name');
      }

      setResolvedAddress(resolution.address);
      if (resolution.isENS && resolution.ensName) {
        setEnsName(resolution.ensName);
      }

      // Fetch attestations with resolved address
      const response = await fetch(`/api/attestations?subject=${resolution.address}&limit=10`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch attestations');
      }

      setResult(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setIsResolving(false);
    }
  };

  const handleVerifyCredential = async () => {
    if (!address || !claim) {
      setError('Please enter both address/ENS and claim');
      return;
    }

    setLoading(true);
    setIsResolving(true);
    setError(null);
    setResult(null);
    setResolvedAddress('');
    setEnsName('');

    try {
      // Resolve ENS or validate address
      const resolution = await resolveAddressOrENS(address);
      setIsResolving(false);

      if (!resolution.address) {
        throw new Error(resolution.error || 'Invalid address or ENS name');
      }

      setResolvedAddress(resolution.address);
      if (resolution.isENS && resolution.ensName) {
        setEnsName(resolution.ensName);
      }

      // Verify credential with resolved address
      const response = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'verifyCredential',
          params: { address: resolution.address, claim },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to verify credential');
      }

      setResult(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setIsResolving(false);
    }
  };

  const handleFindExperts = async () => {
    if (!topic) {
      setError('Please enter a topic');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'findTrustedExperts',
          params: { topic, limit: 10 },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to find experts');
      }

      setResult(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyResult = () => {
    if (result) {
      copyToClipboard(JSON.stringify(result, null, 2));
    }
  };

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
            <Link href="/docs">
              <Button variant="ghost">Docs</Button>
            </Link>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-4xl font-bold mb-2">API Playground</h2>
          <p className="text-slate-600">Test the Intuition MCP server tools in real-time</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left Column - Input Forms */}
          <div>
            <Card>
              <CardHeader>
  <CardTitle>Query Tools</CardTitle>
  <div className="flex items-center gap-2 mt-2">
    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-semibold">
      ⚡ Mainnet Data
    </span>
    <span className="text-gray-600">Connected to Intuition Mainnet</span>
  </div>
</CardHeader>
              <CardContent>
                <Tabs defaultValue="trust-score">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="trust-score">Trust Score</TabsTrigger>
                    <TabsTrigger value="attestations">Attestations</TabsTrigger>
                  </TabsList>
                  <TabsList className="grid w-full grid-cols-2 mt-2">
                    <TabsTrigger value="verify">Verify</TabsTrigger>
                    <TabsTrigger value="experts">Find Experts</TabsTrigger>
                  </TabsList>

                  <TabsContent value="trust-score" className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Ethereum Address or ENS</label>
                      <Input
                        type="text"
                        placeholder="0x... or vitalik.eth"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                      />
                      <div className="text-xs text-gray-500">
                        💡 <strong>Note:</strong> ENS names resolve to mainnet addresses, and trust scores are calculated from <strong>mainnet attestations</strong>
                      </div>
                      {address && (
                        <div className="mt-2 text-xs">
                          {address.includes('.') ? (
                            <span className="text-blue-600">🔍 ENS name detected</span>
                          ) : address.startsWith('0x') && address.length === 42 ? (
                            <span className="text-green-600">✓ Ethereum address detected</span>
                          ) : address.startsWith('0x') ? (
                            <span className="text-yellow-600">⚠️ Address incomplete</span>
                          ) : (
                            <span className="text-red-600">⚠️ Invalid format</span>
                          )}
                        </div>
                      )}
                      {ensName && resolvedAddress && (
                        <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-800">
                          ✓ Resolved {ensName} → {truncateAddress(resolvedAddress)}
                        </div>
                      )}
                    </div>

                    <Button onClick={handleGetTrustScore} disabled={loading} className="w-full">
                      {loading ? (isResolving ? 'Resolving...' : 'Loading...') : 'Get Trust Score'}
                    </Button>

                    <div className="border-t pt-4 mt-4">
                      <p className="text-sm font-medium mb-2">Try These Mainnet Examples:</p>
                      <div className="grid grid-cols-1 gap-2">
                        <button
                          onClick={() => setAddress('0xBb285b543C96C927FC320Fb28524899C2C90806C')}
                          className="text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded border"
                          type="button"
                        >
                          <div className="font-mono text-xs">0xBb28...806C</div>
                          <div className="text-xs text-gray-500">Active creator with many attestations</div>
                        </button>
                        <button
                          onClick={() => setAddress('0x4D4Ec2EC39ce77f09Ca25502536AfDb1a88d8375')}
                          className="text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded border"
                          type="button"
                        >
                          <div className="font-mono text-xs">0x4D4E...8375</div>
                          <div className="text-xs text-gray-500">Intuition project (mainnet data)</div>
                        </button>
                        <button
                          onClick={() => setAddress('vitalik.eth')}
                          className="text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded border"
                          type="button"
                        >
                          <div className="font-mono text-xs">vitalik.eth</div>
                          <div className="text-xs text-gray-500">ENS resolution demo</div>
                        </button>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="attestations" className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Subject Address or ENS Name
                      </label>
                      <Input
                        placeholder="vitalik.eth or 0x..."
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                      />
                      {address && (
                        <div className="mt-2 text-xs">
                          {address.includes('.') ? (
                            <span className="text-blue-600">🔍 ENS name detected</span>
                          ) : address.startsWith('0x') && address.length === 42 ? (
                            <span className="text-green-600">✓ Ethereum address detected</span>
                          ) : address.startsWith('0x') ? (
                            <span className="text-yellow-600">⚠️ Address incomplete</span>
                          ) : (
                            <span className="text-red-600">⚠️ Invalid format</span>
                          )}
                        </div>
                      )}
                      {ensName && resolvedAddress && (
                        <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-800">
                          ✓ Resolved {ensName} → {truncateAddress(resolvedAddress)}
                        </div>
                      )}
                    </div>
                    <Button
                      onClick={handleGetAttestations}
                      disabled={loading}
                      className="w-full"
                    >
                      {loading ? (isResolving ? 'Resolving...' : 'Loading...') : 'Get Attestations'}
                    </Button>
                  </TabsContent>

                  <TabsContent value="verify" className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Address or ENS Name
                      </label>
                      <Input
                        placeholder="vitalik.eth or 0x..."
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                      />
                      {address && (
                        <div className="mt-2 text-xs">
                          {address.includes('.') ? (
                            <span className="text-blue-600">🔍 ENS name detected</span>
                          ) : address.startsWith('0x') && address.length === 42 ? (
                            <span className="text-green-600">✓ Ethereum address detected</span>
                          ) : address.startsWith('0x') ? (
                            <span className="text-yellow-600">⚠️ Address incomplete</span>
                          ) : (
                            <span className="text-red-600">⚠️ Invalid format</span>
                          )}
                        </div>
                      )}
                      {ensName && resolvedAddress && (
                        <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-800">
                          ✓ Resolved {ensName} → {truncateAddress(resolvedAddress)}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Claim/Credential
                      </label>
                      <Input
                        placeholder="expert-in-defi"
                        value={claim}
                        onChange={(e) => setClaim(e.target.value)}
                      />
                    </div>
                    <Button
                      onClick={handleVerifyCredential}
                      disabled={loading}
                      className="w-full"
                    >
                      {loading ? (isResolving ? 'Resolving...' : 'Loading...') : 'Verify Credential'}
                    </Button>
                  </TabsContent>

                  <TabsContent value="experts" className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Topic/Domain
                      </label>
                      <Input
                        placeholder="solidity"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                      />
                    </div>
                    <Button
                      onClick={handleFindExperts}
                      disabled={loading}
                      className="w-full"
                    >
                      {loading ? 'Loading...' : 'Find Experts'}
                    </Button>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Example Queries */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg">Example Queries</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                  <p className="font-medium mb-2 text-blue-900">💡 You can search by:</p>
                  <ul className="space-y-1 text-xs text-blue-800">
                    <li>• ENS name: <code className="bg-white px-1 py-0.5 rounded">vitalik.eth</code></li>
                    <li>• Ethereum address: <code className="bg-white px-1 py-0.5 rounded">0x1234...5678</code></li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium">ENS Examples:</p>
                  <div className="flex gap-2 flex-wrap mt-1">
                    <code className="text-xs bg-slate-100 p-1 rounded">vitalik.eth</code>
                    <code className="text-xs bg-slate-100 p-1 rounded">nick.eth</code>
                  </div>
                </div>
                <div>
                  <p className="font-medium">Address Example:</p>
                  <code className="text-xs bg-slate-100 p-1 rounded">
                    0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
                  </code>
                </div>
                <div>
                  <p className="font-medium">Topic Examples:</p>
                  <code className="text-xs bg-slate-100 p-1 rounded mr-2">solidity</code>
                  <code className="text-xs bg-slate-100 p-1 rounded mr-2">defi</code>
                  <code className="text-xs bg-slate-100 p-1 rounded">security</code>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Results */}
          <div>
            <Card className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Results</CardTitle>
                  {result && (
                    <Button variant="outline" size="sm" onClick={handleCopyResult}>
                      Copy JSON
                    </Button>
                  )}
                </div>
                <CardDescription>
                  Live query results will appear here
                </CardDescription>
              </CardHeader>
              <CardContent>
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
                    <p className="font-medium">Error</p>
                    <p className="text-sm">{error}</p>
                  </div>
                )}

                {result && !error && (
                  <div className="space-y-4">
                    {/* Trust Score Result */}
                    {result.score !== undefined && (
                      <div className="space-y-3">
                        <div className="text-center p-6 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg border">
                          <p className="text-sm text-slate-600 mb-2">Trust Score</p>
                          <p className={`text-5xl font-bold ${getScoreColor(result.score)}`}>
                            {formatPercentage(result.score)}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 bg-slate-50 rounded border">
                            <p className="text-xs text-slate-600">Credibility</p>
                            <p className="text-lg font-semibold">{formatPercentage(result.breakdown.credibility)}</p>
                          </div>
                          <div className="p-3 bg-slate-50 rounded border">
                            <p className="text-xs text-slate-600">Expertise</p>
                            <p className="text-lg font-semibold">{formatPercentage(result.breakdown.expertise)}</p>
                          </div>
                          <div className="p-3 bg-slate-50 rounded border">
                            <p className="text-xs text-slate-600">Reliability</p>
                            <p className="text-lg font-semibold">{formatPercentage(result.breakdown.reliability)}</p>
                          </div>
                          <div className="p-3 bg-slate-50 rounded border">
                            <p className="text-xs text-slate-600">Reputation</p>
                            <p className="text-lg font-semibold">{formatPercentage(result.breakdown.reputation)}</p>
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded border text-sm">
                          <p><span className="font-medium">Attestations:</span> {result.attestationCount}</p>
                          <p><span className="font-medium">Positive:</span> {result.positiveAttestations}</p>
                          <p><span className="font-medium">Negative:</span> {result.negativeAttestations}</p>
                        </div>
                      </div>
                    )}

                    {/* Attestations Result */}
                    {Array.isArray(result) && result.length > 0 && result[0].subject && (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {result.map((att: any, i: number) => (
                          <div key={i} className="p-3 bg-slate-50 rounded border text-sm">
                            <p className="font-medium mb-1">{att.predicate}</p>
                            <p className="text-xs text-slate-600">Subject: {truncateAddress(att.subject)}</p>
                            <p className="text-xs text-slate-600">Creator: {truncateAddress(att.creator)}</p>
                            <p className="text-xs text-slate-600">Time: {formatTimestamp(att.timestamp)}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Verification Result */}
                    {result.verified !== undefined && (
                      <div className="space-y-3">
                        <div className={`p-4 rounded-lg border-2 ${result.verified ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                          <p className="font-medium text-lg">{result.verified ? '✓ Verified' : '✗ Not Verified'}</p>
                          <p className="text-sm mt-2">{result.message}</p>
                          {result.verified && (
                            <p className="text-sm mt-2">
                              <span className="font-medium">Confidence:</span> {formatPercentage(result.confidence * 100)}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Experts Result */}
                    {Array.isArray(result) && result.length > 0 && result[0].trustScore !== undefined && (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {result.map((expert: any, i: number) => (
                          <div key={i} className="p-3 bg-slate-50 rounded border">
                            <div className="flex items-center justify-between mb-2">
                              <p className="font-mono text-sm">{truncateAddress(expert.address)}</p>
                              <span className={`font-bold ${getScoreColor(expert.trustScore)}`}>
                                {formatPercentage(expert.trustScore)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600">
                              {expert.attestationCount} attestations
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Raw JSON */}
                    <details className="mt-4">
                      <summary className="cursor-pointer text-sm font-medium mb-2">
                        View Raw JSON
                      </summary>
                      <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto">
                        {JSON.stringify(result, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}

                {!result && !error && (
                  <div className="text-center py-12 text-slate-400">
                    <p>No results yet. Try a query!</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
