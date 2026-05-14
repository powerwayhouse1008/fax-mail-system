import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { DEFAULT_USER_ACCOUNTS, type UserAccount } from "../auth";

type UserRow = {
  id: string | number;
  username?: string | null;
  username_unique?: string | null;
  "username unique"?: string | null;
  password_hash?: string | null;
  password?: string | null;
  name: string | null;
  created_at: string;
};

const normalizeText = (value: string) => value.trim();
let hasSeededDefaultUsers = false;
let resolvedUsersTable: string | null = null;
const LOCAL_HASH_SCHEME = "scrypt_v1";
const LOCAL_USERS_FILE_PATH = path.join(process.cwd(), "data/users.json");

const normalizeAccounts = (accounts: UserAccount[]) =>
  accounts.map((account) => ({
    ...account,
    username: normalizeText(account.username),
    password: normalizeText(account.password),
    name: account.name?.trim() || account.username,
  }));


function getUsersTableCandidates(): string[] {
  const envTable = process.env.SUPABASE_USERS_TABLE?.trim();
  const propertyCode = process.env.SUPABASE_PROPERTY_CODE?.trim();
  const base = [
  envTable,
  "users",
].filter((value): value is string => Boolean(value));

  return Array.from(new Set(base));
}

function isMissingRelationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("PGRST205") ||
    error.message.includes('relation "public.') && error.message.includes('" does not exist')
  );
}

async function withUsersTable<T>(request: (table: string) => Promise<T>): Promise<T> {
  const candidates = resolvedUsersTable ? [resolvedUsersTable, ...getUsersTableCandidates()] : getUsersTableCandidates();

  let lastError: unknown;
  for (const table of Array.from(new Set(candidates))) {
    try {
      const result = await request(table);
      resolvedUsersTable = table;
      return result;
    } catch (error) {
      lastError = error;
      if (!isMissingRelationError(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? new Error(`Users table is not found. Tried: ${getUsersTableCandidates().join(", ")}. Last error: ${lastError.message}`)
    : new Error("Failed to resolve users table.");
}
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
function hasSupabaseConfig(): boolean {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  return Boolean(supabaseUrl && serviceRoleKey);
}

async function readLocalUsersFile(): Promise<UserAccount[]> {
  try {
    const raw = await readFile(LOCAL_USERS_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as UserAccount[];
    return normalizeAccounts(parsed);
  } catch {
    return normalizeAccounts(DEFAULT_USER_ACCOUNTS);
  }
}

async function writeLocalUsersFile(users: UserAccount[]): Promise<void> {
  await writeFile(LOCAL_USERS_FILE_PATH, `${JSON.stringify(users, null, 2)}\n`, "utf-8");
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
  const username = row.username || row.username_unique || row["username unique"] || row.name || "";
  const fallbackName = row.username_unique || row["username unique"] || row.username || username;
  const passwordHash = row.password_hash || row.password || "";
  return {
    id: String(row.id),
    username,
    password: passwordHash,
    name: row.name || fallbackName,
    createdAt: row.created_at,
  };
}

export async function hashPassword(password: string): Promise<string> {
  const normalizedPassword = normalizeText(password);
  
  // Always use local hashing so account creation/login stays consistent
  // even when Supabase RPC functions are unavailable or misconfigured.
  return hashPasswordLocally(normalizedPassword);
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

 return error.message.includes("PGRST202") && error.message.includes("verify_password");
}
function isMissingColumnError(error: unknown, columnName: string): boolean {
  return error instanceof Error && error.message.includes(`Could not find the '${columnName}' column`);
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

  const countHeader = await withUsersTable((table) => supabaseRequest<unknown[]>(`/${table}?select=id`, {
    method: "GET",
    headers: { Prefer: "count=exact" },
  }));

  if (countHeader.length > 0) {
    hasSeededDefaultUsers = true;
    return;
  }

  const defaultRows = await Promise.all(
     DEFAULT_USER_ACCOUNTS.map(async (account) => {
      const passwordHash = await hashPassword(account.password);

      return {
        username: account.username,
        password_hash: passwordHash,
        password: passwordHash,
        name: account.name || account.username,
        created_at: account.createdAt,
      };
    }),
  );

  await withUsersTable((table) => supabaseRequest<unknown>(`/${table}`, {
    method: "POST",
    body: JSON.stringify(defaultRows),
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
 }));

  hasSeededDefaultUsers = true;
}

export async function readUsers(): Promise<UserAccount[]> {
  await seedDefaultUsersIfNeeded();
 if (!hasSupabaseConfig()) {
    return readLocalUsersFile();
  }
   const data = await withUsersTable((table) =>
    supabaseRequest<UserRow[]>(`/${table}?select=id,username,password_hash,password,name,created_at&order=created_at.asc`),
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
  if (!hasSupabaseConfig()) {
    const users = await readLocalUsersFile();
    const nextUser: UserAccount = {
      id: randomBytes(8).toString("hex"),
      username,
      password: passwordHash,
      name,
      createdAt: new Date().toISOString(),
    };
    await writeLocalUsersFile([...users, nextUser]);
    return;
  }
  const basePayload = {
    username,
    password_hash: passwordHash,
    password: passwordHash,
    name,
    created_at: new Date().toISOString(),
  };
  const variants = [
    { ...basePayload, username_unique: username, "username unique": username },
    { ...basePayload, "username unique": username },
    { ...basePayload, username_unique: username },
    basePayload,
  ];

  let lastError: unknown;
  for (const variant of variants) {
    try {
       await withUsersTable((table) => supabaseRequest<unknown>(`/${table}`, {
        method: "POST",
        body: JSON.stringify(variant),
        headers: { Prefer: "return=minimal" },
       }));
      return;
    } catch (error) {
      lastError = error;
      const canRetry =
        isMissingColumnError(error, "username_unique") ||
        isMissingColumnError(error, "username unique");
      if (!canRetry) throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to create user.");
}

export async function updateUser(input: {
  id: string;
  username?: string;
  username_unique?: string;
  password?: string;
  name?: string;
}): Promise<void> {
  if (!hasSupabaseConfig()) {
    const users = await readLocalUsersFile();
    const updated = await Promise.all(
      users.map(async (user) => {
        if (user.id !== input.id) return user;
        const nextPassword = input.password ? await hashPassword(input.password) : user.password;
        return {
          ...user,
          username: input.username !== undefined ? normalizeText(input.username) : user.username,
          name: input.name !== undefined ? normalizeText(input.name) : user.name,
          password: nextPassword,
        };
      }),
    );
    await writeLocalUsersFile(updated);
    return;
  }
  const payload: Partial<
    Record<"username" | "username_unique" | "username unique" | "password" | "password_hash" | "name", string>
  > = {};
  let normalizedUsername: string | undefined;
  if (input.username !== undefined) {
    normalizedUsername = normalizeText(input.username);
    payload.username = normalizedUsername;
  }
  if (input.password !== undefined) {
    const passwordHash = await hashPassword(input.password);
    payload.password_hash = passwordHash;
    payload.password = passwordHash;
  }
  if (input.name !== undefined) payload.name = normalizeText(input.name);

   const variants = normalizedUsername
    ? [
        { ...payload, username_unique: normalizedUsername, "username unique": normalizedUsername },
        { ...payload, "username unique": normalizedUsername },
        { ...payload, username_unique: normalizedUsername },
        payload,
      ]
     : [payload];

  let lastError: unknown;
  for (const variant of variants) {
    try {
      await withUsersTable((table) => supabaseRequest<unknown>(`/${table}?id=eq.${encodeURIComponent(input.id)}`, {
        method: "PATCH",
        body: JSON.stringify(variant),
        headers: { Prefer: "return=minimal" },
      }));
      return;
    } catch (error) {
      lastError = error;
      const canRetry =
        isMissingColumnError(error, "username_unique") ||
        isMissingColumnError(error, "username unique");
      if (!canRetry) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Failed to update user.");
}

export async function deleteUser(id: string): Promise<void> {
   if (!hasSupabaseConfig()) {
    const users = await readLocalUsersFile();
    await writeLocalUsersFile(users.filter((user) => user.id !== id));
    return;
  }
 await withUsersTable((table) => supabaseRequest<unknown>(`/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  }));
}
