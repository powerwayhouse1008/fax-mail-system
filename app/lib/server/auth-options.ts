import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

const tenantId = process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID;
const allowPersonalMicrosoftAccount = process.env.AUTH_MICROSOFT_ALLOW_PERSONAL_ACCOUNT === "true";
const allowedDomain = process.env.AUTH_ALLOWED_EMAIL_DOMAIN;
const redirectProxyUrl = process.env.AUTH_REDIRECT_PROXY_URL;
const microsoftClientId =
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID ??
  process.env.AUTH_MICROSOFT_CLIENT_ID ??
  process.env.MICROSOFT_CLIENT_ID;

const microsoftClientSecret =
  process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ??
  process.env.AUTH_MICROSOFT_CLIENT_SECRET ??
  process.env.MICROSOFT_CLIENT_SECRET;

const issuerTenant = allowPersonalMicrosoftAccount ? "common" : tenantId;

const microsoftProvider =
  microsoftClientId && microsoftClientSecret
    ? [
        (() => {
          const issuerTenant = allowPersonalMicrosoftAccount ? "common" : tenantId;

          return MicrosoftEntraID({
          id: "microsoft-entra-id",
          clientId: microsoftClientId,
          clientSecret: microsoftClientSecret,
             ...(issuerTenant
            ? { issuer: `https://login.microsoftonline.com/${issuerTenant}/v2.0` }
            : {}),
          authorization: { params: { prompt: "select_account" } },
          ...(redirectProxyUrl ? { redirectProxyUrl } : {}),
         });
        })(),
      ]
    : [];

if (!microsoftProvider.length) {
  console.warn("[auth] Microsoft Entra ID provider is disabled due to missing credentials", {
    hasClientId: Boolean(microsoftClientId),
    hasClientSecret: Boolean(microsoftClientSecret),
  });
}
export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  providers: microsoftProvider,
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
        if (account?.provider !== "microsoft-entra-id") {
        return false;
      }

      const profileRecord = profile as Record<string, unknown> | undefined;
      const tid = (profileRecord?.tid as string | undefined) ?? undefined;
      const email =
        (profileRecord?.email as string | undefined) ??
        (profileRecord?.preferred_username as string | undefined) ??
        "";

         if (!allowPersonalMicrosoftAccount && tenantId && tid && tid !== tenantId) {
        console.warn("[auth] Tenant mismatch", { expected: tenantId, received: tid });
      }

      if (allowedDomain && email && !email.toLowerCase().endsWith(`@${allowedDomain.toLowerCase()}`)) {
        console.warn("[auth] Email domain mismatch", { expected: allowedDomain, received: email });
       
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
