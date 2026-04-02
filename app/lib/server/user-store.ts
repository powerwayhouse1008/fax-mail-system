
import { DEFAULT_USER_ACCOUNTS, type UserAccount } from "../auth";

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  name: string | null;
  created_at: string;
};

const normalizeText = (value: string) => value.trim();
let hasSeededDefaultUsers = false;

const normalizeAccounts = (accounts: UserAccount[]) =>
  accounts.map((account) => ({
    ...account,
    username: normalizeText(account.username),
    password: normalizeText(account.password),
    name: account.name?.trim() || account.username,
  }));

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  }
}
  return {
    supabaseUrl,
    serviceRoleKey,
  };
}
async function supabaseRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
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

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function mapRowToAccount(row: UserRow): UserAccount {
  return {
    id: row.id,
    username: row.username,
    password: row.password_hash,
    name: row.name || row.username,
    createdAt: row.created_at,
  };
}

export async function hashPassword(password: string): Promise<string> {
  const data = await supabaseRequest<string>("/rpc/hash_password", {
    method: "POST",
    body: JSON.stringify({ plain_password: normalizeText(password) }),
  });

  return data;
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const data = await supabaseRequest<boolean>("/rpc/verify_password", {
    method: "POST",
    body: JSON.stringify({
      plain_password: normalizeText(password),
      stored_hash: passwordHash,
    }),
  });

  return Boolean(data);
}

async function seedDefaultUsersIfNeeded(): Promise<void> {
  if (hasSeededDefaultUsers) return;

  const countHeader = await supabaseRequest<unknown[]>("/users?select=id", {
    method: "GET",
    headers: { Prefer: "count=exact" },
  });

  if (countHeader.length > 0) {
    hasSeededDefaultUsers = true;
    return;
  }

  const defaultRows = await Promise.all(
    DEFAULT_USER_ACCOUNTS.map(async (account) => ({
      id: account.id,
      username: account.username,
      password_hash: await hashPassword(account.password),
      name: account.name || account.username,
      created_at: account.createdAt,
    })),
  );

  await supabaseRequest<unknown>("/users", {
    method: "POST",
    body: JSON.stringify(defaultRows),
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  });

  hasSeededDefaultUsers = true;
}

export async function readUsers(): Promise<UserAccount[]> {
  await seedDefaultUsersIfNeeded();

  const data = await supabaseRequest<UserRow[]>(
    "/users?select=id,username,password_hash,name,created_at&order=created_at.asc",
  );

  return normalizeAccounts((data ?? []).map((row) => mapRowToAccount(row)));
}

export async function createUser(input: {
  username: string;
  password: string;
  name?: string;
}): Promise<void> {
  const username = normalizeText(input.username);
  const passwordHash = await hashPassword(input.password);
  const name = normalizeText(input.name ?? username) || username;

  await supabaseRequest<unknown>("/users", {
    method: "POST",
    body: JSON.stringify({
      username,
      password_hash: passwordHash,
      name,
      created_at: new Date().toISOString(),
    }),
    headers: { Prefer: "return=minimal" },
  });
}

export async function updateUser(input: {
  id: string;
  username?: string;
  password?: string;
  name?: string;
}): Promise<void> {
  const payload: {
    username?: string;
    password_hash?: string;
    name?: string;
  } = {};

  if (input.username !== undefined) payload.username = normalizeText(input.username);
  if (input.password !== undefined) payload.password_hash = await hashPassword(input.password);
  if (input.name !== undefined) payload.name = normalizeText(input.name);

  await supabaseRequest<unknown>(`/users?id=eq.${encodeURIComponent(input.id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    headers: { Prefer: "return=minimal" },
  });
}

export async function deleteUser(id: string): Promise<void> {
  await supabaseRequest<unknown>(`/users?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}
