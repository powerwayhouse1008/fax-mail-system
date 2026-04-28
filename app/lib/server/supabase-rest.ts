export function getSupabaseServiceConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase environment variables. Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).",
    );
  }

  return {
    supabaseUrl,
    serviceRoleKey,
  };
}

export async function supabaseRestRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { supabaseUrl, serviceRoleKey } = getSupabaseServiceConfig();

  const response = await fetch(`${supabaseUrl}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${errorBody}`);
  }

  if (response.status === 204) return undefined as T;

  const rawBody = await response.text();
  if (!rawBody.trim()) return undefined as T;

  return JSON.parse(rawBody) as T;
}
