interface GitHubOrgResult {
  url: string;
  repos: number;
  followers: number;
  description: string;
}

interface EnrichResult {
  githubScore: number;
  githubData: Record<string, any>;
}

const cache = new Map<string, GitHubOrgResult | null>();

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

async function fetchGitHubApi(url: string): Promise<any> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'ADSOScore-Enrichment-Module',
  };

  const token = import.meta.env.GITHUB_TOKEN || (typeof process !== 'undefined' ? process.env.GITHUB_TOKEN : undefined);
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  const response = await fetch(url, { headers });

  if (response.status === 403) {
    console.warn('GitHub API Rate Limit hit or forbidden');
    return null;
  }

  if (!response.ok) {
    console.error(`GitHub API Error: ${response.status} ${response.statusText}`);
    return null;
  }

  return response.json();
}

export async function searchGitHubOrg(
  companyName: string
): Promise<GitHubOrgResult | null> {
  const normalized = normalizeCompanyName(companyName);

  if (cache.has(normalized)) {
    return cache.get(normalized) ?? null;
  }

  const searchUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(normalized)}+in:name&per_page=5`;
  const searchData = await fetchGitHubApi(searchUrl);

  if (!searchData?.items?.length) {
    cache.set(normalized, null);
    return null;
  }

  const bestMatch = searchData.items.find((item: any) => {
    const repoOwner = item.owner?.login?.toLowerCase() ?? '';
    return item.owner?.type === 'Organization' || repoOwner.includes(normalized);
  });

  if (!bestMatch?.owner?.login) {
    cache.set(normalized, null);
    return null;
  }

  const orgLogin = bestMatch.owner.login;
  const orgData = await fetchGitHubApi(
    `https://api.github.com/orgs/${orgLogin}`
  );

  if (!orgData) {
    cache.set(normalized, null);
    return null;
  }

  const result: GitHubOrgResult = {
    url: orgData.html_url ?? `https://github.com/${orgLogin}`,
    repos: orgData.public_repos ?? 0,
    followers: orgData.followers ?? 0,
    description: orgData.description ?? '',
  };

  cache.set(normalized, result);
  return result;
}

export async function enrichOfferFromGitHub(
  empresa: string,
  funciones: string
): Promise<EnrichResult> {
  let score = 0;
  const githubData: Record<string, any> = {};

  const org = await searchGitHubOrg(empresa);

  if (org) {
    githubData.org = org.url;
    githubData.repos = org.repos;
    githubData.followers = org.followers;
    githubData.description = org.description;

    score += 5;

    if (org.repos > 0) score += 5;

    if (org.followers > 10) score += 5;

    if (org.description.length > 0) score += 5;

    if (org.url) score += 5;
  }

  const funcionesLower = (funciones ?? '').toLowerCase();
  if (funcionesLower.includes('github')) {
    score += 3;
  }

  return {
    githubScore: Math.min(25, score),
    githubData,
  };
}
