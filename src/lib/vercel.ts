/**
 * Vercel API integration utilities
 */

const VERCEL_API_BASE = 'https://api.vercel.com';

interface AddDomainResponse {
  name: string;
  apexName: string;
  projectId: string;
  verified: boolean;
  redirect: string | null;
  redirectStatusCode: number | null;
  gitBranch: string | null;
  customEnvironmentId: string | null;
  updatedAt: number;
  createdAt: number;
  verification?: Array<{
    type: string;
    domain: string;
    value: string;
    reason: string;
  }>;
}

interface AddDomainOptions {
  domain: string;
  projectId?: string;
  teamId?: string;
  gitBranch?: string | null;
  redirect?: string | null;
  redirectStatusCode?: number | null;
}

/**
 * Add a domain to a Vercel project
 * 
 * @param options Domain configuration options
 * @returns Promise with the domain response or null if failed
 */
export async function addDomainToVercel(
  options: AddDomainOptions
): Promise<AddDomainResponse | null> {
  const apiToken = process.env.VERCEL_API_TOKEN;
  const projectId = options.projectId || process.env.VERCEL_PROJECT_ID;

  if (!apiToken) {
    console.warn('[Vercel] VERCEL_API_TOKEN not configured, skipping domain addition');
    return null;
  }

  if (!projectId) {
    console.warn('[Vercel] VERCEL_PROJECT_ID not configured, skipping domain addition');
    return null;
  }

  try {
    const url = new URL(`${VERCEL_API_BASE}/v10/projects/${projectId}/domains`);
    
    // Add teamId as query param if provided
    if (options.teamId) {
      url.searchParams.set('teamId', options.teamId);
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: options.domain,
        gitBranch: options.gitBranch ?? null,
        redirect: options.redirect ?? null,
        redirectStatusCode: options.redirectStatusCode ?? null,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Vercel] Failed to add domain ${options.domain}:`,
        response.status,
        errorText
      );
      
      // Don't throw - allow domain creation to succeed even if Vercel API fails
      // Common errors: domain already exists, invalid domain, etc.
      return null;
    }

    const data = await response.json() as AddDomainResponse;
    console.log(`[Vercel] Successfully added domain ${options.domain} to project ${projectId}`);
    
    if (!data.verified && data.verification) {
      console.log(
        `[Vercel] Domain ${options.domain} requires verification.`,
        `Add DNS records: ${JSON.stringify(data.verification, null, 2)}`
      );
    }

    return data;
  } catch (error) {
    console.error(`[Vercel] Error adding domain ${options.domain}:`, error);
    // Don't throw - allow domain creation to succeed even if Vercel API fails
    return null;
  }
}
