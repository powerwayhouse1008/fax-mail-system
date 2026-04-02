export type UserAccount = {
  id: string;
  username: string;
  password: string;
  createdAt: string;
};

export const USER_ACCOUNTS_STORAGE_KEY = "fax_mail_user_accounts";
export const AUTH_SESSION_STORAGE_KEY = "fax_mail_auth_session";
export const AUTH_COOKIE_NAME = "fax_mail_auth";

export const DEFAULT_USER_ACCOUNTS: UserAccount[] = [
  {
    id: "default-user-1",
    username: "staff",
    password: "123456",
    createdAt: "2026-04-02T00:00:00.000Z",
  },
];

export const ADMIN_CREDENTIAL = {
  username: "admin",
  password: "admin123",
};
