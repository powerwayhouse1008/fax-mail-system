import NextAuth from "next-auth";
import { authConfig } from "./app/lib/server/auth-options";

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
