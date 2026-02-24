import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { getSessionOptions } from "@/lib/auth/session";
import { verifyUserPassword } from "@/lib/auth/password";

type LoginRequest = {
  username?: string;
  password?: string;
};

type LoginResponse = {
  ok: boolean;
  message?: string;
};

async function handler(req: NextApiRequest, res: NextApiResponse<LoginResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  try {
    const { username, password } = (req.body ?? {}) as LoginRequest;

    if (typeof username !== "string" || username.trim().length === 0) {
      return res.status(400).json({ ok: false, message: "Username is required" });
    }

    if (typeof password !== "string" || password.trim().length === 0) {
      return res.status(400).json({ ok: false, message: "Password is required" });
    }

    const user = await verifyUserPassword(username, password);

    if (!user) {
      return res.status(401).json({ ok: false, message: "Invalid username or password" });
    }

    req.session.isLoggedIn = true;
    req.session.userId = user.id;
    req.session.username = user.username;
    await req.session.save();

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Login error", error);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}

export default withIronSessionApiRoute(handler, getSessionOptions());
