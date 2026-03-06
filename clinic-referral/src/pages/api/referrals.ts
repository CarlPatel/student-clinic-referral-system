import type { NextApiRequest, NextApiResponse } from "next";
import { saveReferral, deleteReferral, type Referral } from "@/lib/dataSource/postgres";

type ReferralResponse = {
  ok: boolean;
  message?: string;
  error?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<ReferralResponse>) {
  try {
    if (req.method === "POST") {
      const referral = req.body as Referral;

      if (!referral || !referral.id) {
        return res.status(400).json({ ok: false, message: "Invalid referral data" });
      }

      await saveReferral(referral);
      return res.status(200).json({ ok: true });
    } else if (req.method === "DELETE") {
      const { id } = req.query;

      if (!id || typeof id !== "string") {
        return res.status(400).json({ ok: false, message: "Referral ID is required" });
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
