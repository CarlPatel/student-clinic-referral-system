import type { IronSessionOptions } from "iron-session";

export function getSessionOptions(): IronSessionOptions {
  const password = process.env.SESSION_PASSWORD;
  if (!password || password.length < 32) {
    throw new Error("SESSION_PASSWORD must be set to at least 32 characters.");
  }

  return {
    password,
    cookieName: "clinic_referral_session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax"
    }
  };
}
