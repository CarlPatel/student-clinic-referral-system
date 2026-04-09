import "iron-session";
import type { UserRole } from "@/lib/types";

declare module "iron-session" {
  interface IronSessionData {
    isLoggedIn?: boolean;
    userId?: string;
    username?: string;
    role?: UserRole;
    clinicKey?: string;
  }
}
