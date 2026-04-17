import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";

import { getSessionOptions } from "@/lib/auth/session";
import { createUser, deleteUser, listUsers, updateUserAccess } from "@/lib/auth/users";
import { getAppData } from "@/lib/dataSource/postgres";
import type { AppUser, UserRole } from "@/lib/types";

type UsersResponse = {
  ok: boolean;
  message?: string;
  users?: AppUser[];
  user?: AppUser;
};

const validRoles: UserRole[] = ["clinic_member", "clinic_admin", "master_admin"];

function isRole(value: unknown): value is UserRole {
  return typeof value === "string" && validRoles.includes(value as UserRole);
}

async function isValidClinicKey(clinicKey: unknown) {
  if (typeof clinicKey !== "string" || clinicKey.trim().length === 0) {
    return false;
  }

  const appData = await getAppData();
  return clinicKey.trim() in appData.clinics;
}

async function handler(req: NextApiRequest, res: NextApiResponse<UsersResponse>) {
  if (!req.session.isLoggedIn) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }

  if (req.session.role !== "master_admin") {
    return res.status(403).json({ ok: false, message: "Master admin access required" });
  }

  try {
    if (req.method === "GET") {
      const users = await listUsers();
      return res.status(200).json({ ok: true, users });
    }

    if (req.method === "POST") {
      const { username, password, role, clinicKey } = (req.body ?? {}) as {
        username?: string;
        password?: string;
        role?: UserRole;
        clinicKey?: string;
      };

      const clinicRequired = role !== "master_admin";
      const hasValidClinic = clinicRequired ? await isValidClinicKey(clinicKey) : true;

      if (typeof username !== "string" || typeof password !== "string" || !isRole(role) || !hasValidClinic) {
        return res.status(400).json({ ok: false, message: "Username, password, role, and clinic are required" });
      }

      const normalizedClinicKey = role === "master_admin" ? "" : typeof clinicKey === "string" ? clinicKey.trim() : "";
      const user = await createUser({ username, password, role, clinicKey: normalizedClinicKey });
      const users = await listUsers();
      return res.status(201).json({ ok: true, user, users });
    }

    if (req.method === "PATCH") {
      const { userId, role, clinicKey } = (req.body ?? {}) as { userId?: string; role?: UserRole; clinicKey?: string };

      const clinicRequired = role !== "master_admin";
      const hasValidClinic = clinicRequired ? await isValidClinicKey(clinicKey) : true;

      if (typeof userId !== "string" || !isRole(role) || !hasValidClinic) {
        return res.status(400).json({ ok: false, message: "User ID, role, and clinic are required" });
      }

      const normalizedClinicKey = role === "master_admin" ? "" : typeof clinicKey === "string" ? clinicKey.trim() : "";
      const user = await updateUserAccess(userId, role, normalizedClinicKey);
      if (userId === req.session.userId) {
        req.session.role = user.role;
        req.session.clinicKey = user.clinicKey ?? undefined;
        await req.session.save();
      }
      const users = await listUsers();
      return res.status(200).json({ ok: true, user, users });
    }

    if (req.method === "DELETE") {
      const { userId } = req.query;
      const targetUserId = typeof userId === "string" ? userId : null;

      if (!targetUserId) {
        return res.status(400).json({ ok: false, message: "User ID is required" });
      }

      if (targetUserId === req.session.userId) {
        return res.status(400).json({ ok: false, message: "You cannot delete your own account." });
      }

      await deleteUser(targetUserId);
      const users = await listUsers();
      return res.status(200).json({ ok: true, users });
    }

    res.setHeader("Allow", "GET,POST,PATCH,DELETE");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return res.status(400).json({ ok: false, message });
  }
}

export default withIronSessionApiRoute(handler, getSessionOptions());
