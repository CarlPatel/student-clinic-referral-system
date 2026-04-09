import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";

import { getSessionOptions } from "@/lib/auth/session";
import { getAppData, getReferrals, saveReferral, deleteReferral, type Referral } from "@/lib/dataSource/postgres";
import type { UserRole } from "@/lib/types";

type ReferralResponse = {
  ok: boolean;
  message?: string;
  error?: string;
};

function canAccessReferral(referral: Referral, role: UserRole, clinicName?: string) {
  if (role === "master_admin") {
    return true;
  }

  if (!clinicName) {
    return false;
  }

  return referral.referringClinic === clinicName || referral.receivingClinic === clinicName;
}

async function handler(req: NextApiRequest, res: NextApiResponse<ReferralResponse>) {
  try {
    if (!req.session.isLoggedIn) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const appData = await getAppData();
    const userRole = req.session.role || "clinic_member";
    const userClinicName = req.session.clinicKey ? appData.clinics[req.session.clinicKey]?.name : undefined;

    if (req.method === "POST") {
      const referral = req.body as Referral;

      if (!referral || !referral.id) {
        return res.status(400).json({ ok: false, message: "Invalid referral data" });
      }

      if (!canAccessReferral(referral, userRole, userClinicName)) {
        return res.status(403).json({ ok: false, message: "You can only save referrals for your clinic." });
      }

      await saveReferral(referral);
      return res.status(200).json({ ok: true });
    } else if (req.method === "DELETE") {
      const { id } = req.query;

      if (!id || typeof id !== "string") {
        return res.status(400).json({ ok: false, message: "Referral ID is required" });
      }

      const referrals = await getReferrals();
      const referral = referrals.find((entry) => entry.id === parseInt(id, 10));

      if (!referral) {
        return res.status(404).json({ ok: false, message: "Referral not found" });
      }

      if (!canAccessReferral(referral, userRole, userClinicName)) {
        return res.status(403).json({ ok: false, message: "You can only delete referrals for your clinic." });
      }

      await deleteReferral(parseInt(id, 10));
      return res.status(200).json({ ok: true });
    } else {
      res.setHeader("Allow", ["POST", "DELETE"]);
      return res.status(405).json({ ok: false, message: "Method not allowed" });
    }
  } catch (error) {
    console.error("Referral API error", error);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

export default withIronSessionApiRoute(handler, getSessionOptions());
