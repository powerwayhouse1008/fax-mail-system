import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user?: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: "technical_admin" | "owner" | "manager" | "staff";
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    tid?: string;
    roles?: string[];
  }
}
