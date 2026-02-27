import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="text-center">
          <div className="inline-flex items-center px-4 py-2 bg-indigo-100 rounded-full mb-8">
            <span className="text-indigo-600 font-semibold text-sm">
              🚀 MCP Server for Intuition Mainnet
            </span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Connect AI Agents to
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
              Intuition Trust Network
            </span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Enable Claude, ChatGPT, and autonomous agents to query trust scores, 
            verify credentials, and discover experts using the Model Context Protocol.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/dashboard"
              className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-semibold hover:shadow-lg transform hover:-translate-y-0.5 transition-all"
            >
              Try Dashboard
            </Link>
            <Link
              href="/docs"
              className="px-8 py-4 bg-white text-indigo-600 border-2 border-indigo-600 rounded-lg font-semibold hover:bg-indigo-50 transition-all"
            >
              Read Docs
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">
          Powerful MCP Tools for AI Agents
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Feature 1 */}
          <div className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Trust Scores</h3>
            <p className="text-gray-600 text-sm">
              Calculate aggregated trust scores for any Ethereum address based on attestation patterns.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Query Attestations</h3>
            <p className="text-gray-600 text-sm">
              Search and filter attestations with flexible parameters including subjects and predicates.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Verify Credentials</h3>
            <p className="text-gray-600 text-sm">
              Check if addresses have specific attestations with confidence scores.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-cyan-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Find Experts</h3>
            <p className="text-gray-600 text-sm">
              Discover highly trusted addresses in specific domains or topics.
            </p>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-12 text-white">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold mb-2">Mainnet</div>
              <div className="text-indigo-200">Live Attestation Data</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">4 Tools</div>
              <div className="text-indigo-200">MCP Integration</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">100% Open</div>
              <div className="text-indigo-200">No API Key Required</div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">
          How It Works
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-bold text-indigo-600">1</span>
            </div>
            <h3 className="text-xl font-semibold mb-2">Configure MCP</h3>
            <p className="text-gray-600">
              Add the server to your Claude Desktop configuration file.
            </p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-bold text-purple-600">2</span>
            </div>
            <h3 className="text-xl font-semibold mb-2">Query Data</h3>
            <p className="text-gray-600">
              AI agents can now access Intuition's trust network directly.
            </p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-bold text-pink-600">3</span>
            </div>
            <h3 className="text-xl font-semibold mb-2">Build Apps</h3>
            <p className="text-gray-600">
              Create trust-gated apps, credential verifiers, and more.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h2 className="text-3xl font-bold mb-4">
          Ready to Get Started?
        </h2>
        <p className="text-xl text-gray-600 mb-8">
          Explore the interactive dashboard or read the documentation to integrate with your AI agents.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/dashboard"
            className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-semibold hover:shadow-lg transform hover:-translate-y-0.5 transition-all"
          >
            Launch Dashboard
          </Link>
          <Link
            href="https://github.com/rudazy/Intuition-"
            target="_blank"
            className="px-8 py-4 bg-gray-900 text-white rounded-lg font-semibold hover:bg-gray-800 transition-all"
          >
            View on GitHub
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="text-gray-600 mb-4 md:mb-0">
              © 2025 Intuition MCP Server. Open source AI agent integration.
            </div>
            <div className="flex space-x-6">
              <Link href="https://x.com/IntuitASystem" target="_blank" className="text-gray-600 hover:text-indigo-600 flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                Twitter
              </Link>
              <Link href="https://portal.intuition.systems/" target="_blank" className="text-gray-600 hover:text-indigo-600">
                Portal
              </Link>
              <Link href="https://docs.intuition.systems/" target="_blank" className="text-gray-600 hover:text-indigo-600">
                Docs
              </Link>
              <Link href="https://github.com/rudazy/Intuition-" target="_blank" className="text-gray-600 hover:text-indigo-600">
                GitHub
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}