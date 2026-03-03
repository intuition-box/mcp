/** @type {import('next').NextConfig} */
const isGithubPages = process.env.GITHUB_PAGES === 'true';
const hasConfiguredBasePath = typeof process.env.PAGES_BASE_PATH === 'string';
const configuredBasePathRaw = process.env.PAGES_BASE_PATH || '';
const configuredBasePath = configuredBasePathRaw === '/'
  ? ''
  : configuredBasePathRaw.replace(/\/$/, '');
const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] || '';
const isUserOrOrgSite = repositoryName.endsWith('.github.io');
const fallbackBasePath = repositoryName && !isUserOrOrgSite ? `/${repositoryName}` : '';
const basePath = isGithubPages
  ? (hasConfiguredBasePath ? configuredBasePath : fallbackBasePath)
  : '';

const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  ...(isGithubPages
    ? {
        output: 'export',
        trailingSlash: true,
        images: {
          unoptimized: true,
        },
        basePath,
        assetPrefix: basePath ? `${basePath}/` : undefined,
      }
    : {}),
}

module.exports = nextConfig
