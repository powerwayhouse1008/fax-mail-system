import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { DEFAULT_USER_ACCOUNTS, type UserAccount } from "../auth";

type UserRow = {
  id: string | number;
  username: string;
  "username unique"?: string | null;
  password_hash: string;
  name: string | null;
  created_at: string;
};

const normalizeText = (value: string) => value.trim();
let hasSeededDefaultUsers = false;
const LOCAL_HASH_SCHEME = "scrypt_v1";

const normalizeAccounts = (accounts: UserAccount[]) =>
  accounts.map((account) => ({
    ...account,
    username: normalizeText(account.username),
    password: normalizeText(account.password),
    name: account.name?.trim() || account.username,
  }));

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

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

  const rawBody = await response.text();
  if (!rawBody.trim()) {
    return undefined as T;
  }

  return JSON.parse(rawBody) as T;
}

function mapRowToAccount(row: UserRow): UserAccount {
  const username = row.username || row["username unique"] || "";
  return {
     id: String(row.id),
    username,
    password: row.password_hash,
     name: row.name || username,
    createdAt: row.created_at,
  };
}

export async function hashPassword(password: string): Promise<string> {
  const normalizedPassword = normalizeText(password);

  try {
    const data = await supabaseRequest<string>("/rpc/hash_password", {
      method: "POST",
      body: JSON.stringify({ plain_password: normalizedPassword }),
    });

    return data;
  } catch (error) {
    if (!isMissingSupabaseRpc(error)) {
      throw error;
    }


   return hashPasswordLocally(normalizedPassword);
  }
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const normalizedPassword = normalizeText(password);

  if (isLocalPasswordHash(passwordHash)) {
    return verifyLocalPassword(normalizedPassword, passwordHash);
  }

  try {
    const data = await supabaseRequest<boolean>("/rpc/verify_password", {
      method: "POST",
      body: JSON.stringify({
        plain_password: normalizedPassword,
        stored_hash: passwordHash,
      }),
    });

    return Boolean(data);
  } catch (error) {
    if (!isMissingSupabaseRpc(error)) {
      throw error;
    }

    return verifyLocalPassword(normalizedPassword, passwordHash);
  }
}

function isMissingSupabaseRpc(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  return (
    error.message.includes("PGRST202") &&
    (error.message.includes("/rpc/hash_password") || error.message.includes("/rpc/verify_password"))
  );
}

function isLocalPasswordHash(value: string): boolean {
  return value.startsWith(`${LOCAL_HASH_SCHEME}$`);
}

function hashPasswordLocally(password: string): string {
  const salt = randomBytes(16);
  const derivedKey = scryptSync(password, salt, 64);
  return `${LOCAL_HASH_SCHEME}$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

function verifyLocalPassword(password: string, storedHash: string): boolean {
  const [scheme, saltHex, hashHex] = storedHash.split("$");
  if (!scheme || !saltHex || !hashHex || scheme !== LOCAL_HASH_SCHEME) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expectedHash = Buffer.from(hashHex, "hex");
  const actualHash = scryptSync(password, salt, expectedHash.length);

  if (actualHash.length !== expectedHash.length) return false;

  return timingSafeEqual(actualHash, expectedHash);

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
      username: account.username,
      "username unique": account.username,
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
    '/users?select=id,username,"username unique",password_hash,name,created_at&order=created_at.asc',
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
      "username unique": username,
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
    "username unique"?: string;
    password_hash?: string;
    name?: string;
  } = {};

  if (input.username !== undefined) {
    const normalizedUsername = normalizeText(input.username);
    payload.username = normalizedUsername;
    payload["username unique"] = normalizedUsername;
  }
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
