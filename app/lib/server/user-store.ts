import { promises as fs } from "fs";
import path from "path";
import { DEFAULT_USER_ACCOUNTS, type UserAccount } from "../auth";

const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

const normalizeAccounts = (accounts: UserAccount[]) =>
  accounts.map((account) => ({
    ...account,
    username: account.username.trim(),
    password: account.password.trim(),
    name: account.name?.trim() || account.username,
  }));

export async function ensureUsersFile(): Promise<void> {
  try {
    await fs.access(USERS_FILE);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(USERS_FILE, JSON.stringify(DEFAULT_USER_ACCOUNTS, null, 2), "utf-8");
  }
}

export async function readUsers(): Promise<UserAccount[]> {
  await ensureUsersFile();
  const raw = await fs.readFile(USERS_FILE, "utf-8");

  try {
    const parsed = JSON.parse(raw) as UserAccount[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_USER_ACCOUNTS;
    }
    return normalizeAccounts(parsed);
  } catch {
    return DEFAULT_USER_ACCOUNTS;
  }
}

export async function writeUsers(accounts: UserAccount[]): Promise<void> {
  await ensureUsersFile();
  await fs.writeFile(USERS_FILE, JSON.stringify(normalizeAccounts(accounts), null, 2), "utf-8");
}
