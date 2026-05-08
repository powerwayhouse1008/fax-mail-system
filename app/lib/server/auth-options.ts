import type { NextAuthConfig } from "next-auth";
import AzureAD from "next-auth/providers/azure-ad";

const tenantId = process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID;
const allowedDomain = process.env.AUTH_ALLOWED_EMAIL_DOMAIN;

export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    AzureAD({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "",
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? "",
      tenantId: tenantId ?? "common",
    }),
  ],
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        const profileRecord = profile as Record<string, unknown>;
        token.tid = (profileRecord.tid as string | undefined) ?? token.tid;
        token.roles = (profileRecord.roles as string[] | undefined) ?? token.roles;
      }
      return token;
    },
    async signIn({ account, profile }) {
      if (account?.provider !== "azure-ad") {
        return false;
      }

      const profileRecord = profile as Record<string, unknown> | undefined;
      const tid = (profileRecord?.tid as string | undefined) ?? undefined;
      const email =
        (profileRecord?.email as string | undefined) ??
        (profileRecord?.preferred_username as string | undefined) ??
        "";

      if (tenantId && tid !== tenantId) {
        return false;
      }

      if (allowedDomain && email && !email.toLowerCase().endsWith(`@${allowedDomain.toLowerCase()}`)) {
        return false;
      }

      return true;
    },
    async session({ session, token }) {
      if (session.user) {
        const roles = Array.isArray(token.roles) ? token.roles : [];
        const role = roles.includes("admin") ? "admin" : "user";
        session.user.role = role;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
};
