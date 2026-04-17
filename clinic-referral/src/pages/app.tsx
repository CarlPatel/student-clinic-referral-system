import { useState, useEffect } from "react";
import Link from "next/link";
import { withIronSessionSsr } from "iron-session/next";
import { getSessionOptions } from "@/lib/auth/session";
import { getAppData, getReferrals, type Referral } from "@/lib/dataSource/postgres";
import { buildGoogleDriveDownloadUrl, buildGoogleDrivePreviewUrl } from "@/lib/googleDrive";
import Head from "next/head";
import type { AppUser, ClinicServiceDocument, UserRole } from "@/lib/types";

// ─── TYPES ──────────────────────────────────────────────────────────────────
type ClinicInfo = {
  id: string;
  name: string;
  location: string;
  phone: string;
  contact: string;
  founded: string;
  tags: string[];
  website: string | null;
};

type ClinicEntry = {
  id: string;
  serviceId: string;
  clinicId: string;
  clinicKey: string;
  status: string;
  notes: string;
  acceptingReferrals: boolean;
  docs: ClinicServiceDocument[];
};

type ServiceData = {
  id: string;
  icon: string;
  serviceType: string;
  clinics: ClinicEntry[];
};

type AppPageProps = {
  username: string;
  userId: string;
  role: UserRole;
  clinicKey: string;
  clinics: Record<string, ClinicInfo>;
  servicesData: Record<string, ServiceData>;
  initialReferrals: Referral[];
};

type ReferralFormDraft = {
  receivingClinic?: string;
  service?: string;
};

// ─── SERVER SIDE PROPS ──────────────────────────────────────────────────────
export const getServerSideProps = withIronSessionSsr<AppPageProps>(
  async (context) => {
    if (!context.req.session.isLoggedIn) {
      const nextPath = context.resolvedUrl ?? "/app";
      return {
        redirect: {
          destination: `/login?next=${encodeURIComponent(nextPath)}`,
          permanent: false
        }
      };
    }

    const [appData, initialReferrals] = await Promise.all([
      getAppData(),
      getReferrals()
    ]);

    const userRole = context.req.session.role || "clinic_member";
    const userClinicId = context.req.session.clinicKey ? appData.clinics[context.req.session.clinicKey]?.id : undefined;
    const visibleReferrals = initialReferrals.filter((referral) => canAccessReferral(referral, userRole, userClinicId));

    return {
      props: {
        username: context.req.session.username || "User",
        userId: context.req.session.userId || "",
        role: userRole,
        clinicKey: context.req.session.clinicKey || "",
        clinics: appData.clinics,
        servicesData: appData.servicesData,
        initialReferrals: visibleReferrals
      }
    };
  },
  getSessionOptions()
);

// ─── CONSTANTS ──────────────────────────────────────────────────────────────
const docTypeStyles = {
  form: { bg: "#EFF6FF", color: "#2563EB", label: "Form" },
  auth: { bg: "#FFF7ED", color: "#C2410C", label: "Authorization" },
  insurance: { bg: "#F0FDF4", color: "#16A34A", label: "Insurance" }
};

const EMPTY_FORM = {
  referringClinic: "",
  receivingClinic: "",
  service: "",
  preceptor: "",
  notes: ""
};

const STEPS = ["Referring Clinic", "Service", "Receiving Clinic", "Preceptor", "Review"];

const ROLE_LABELS: Record<UserRole, string> = {
  clinic_member: "Clinic member",
  clinic_admin: "Clinic admin",
  master_admin: "Master admin"
};

const ROLE_OPTIONS: UserRole[] = ["clinic_member", "clinic_admin", "master_admin"];
const REFERRAL_STATUSES: Referral["status"][] = ["sent", "received", "scheduled", "completed"];
let lastSecond = -1;
let sequence = 0;

function sortDocuments(docs: ClinicServiceDocument[]) {
  return docs.slice().sort((a, b) => {
    if (a.sortOrder == null && b.sortOrder != null) return 1;
    if (a.sortOrder != null && b.sortOrder == null) return -1;
    if (a.sortOrder != null && b.sortOrder != null && a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }

    return a.name.localeCompare(b.name);
  });
}

function getDocumentLinks(doc: ClinicServiceDocument) {
  if (doc.googleDriveFileId) {
    return {
      previewUrl: buildGoogleDrivePreviewUrl(doc.googleDriveFileId),
      downloadUrl: buildGoogleDriveDownloadUrl(doc.googleDriveFileId)
    };
  }

  return {
    previewUrl: doc.url,
    downloadUrl: null
  };
}

function canAccessReferral(referral: Referral, role: UserRole, clinicId?: string) {
  if (role === "master_admin") {
    return true;
  }

  if (!clinicId) {
    return false;
  }

  return referral.referringClinicId === clinicId || referral.receivingClinicId === clinicId;
}

// ─── HELPER COMPONENTS ──────────────────────────────────────────────────────
function DocIcon({ type }: { type: "form" | "auth" | "insurance" }) {
  if (type === "auth")
    return (
      <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      </svg>
    );
  if (type === "insurance")
    return (
      <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    );
  return (
    <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

// ─── REFERRAL TRACKER COMPONENT ────────────────────────────────────────────
function ReferralTracker({
  clinics,
  servicesData,
  initialReferrals,
  role,
  userClinicName,
  launchDraft
}: {
  clinics: Record<string, ClinicInfo>;
  servicesData: Record<string, ServiceData>;
  initialReferrals: Referral[];
  role: UserRole;
  userClinicName?: string;
  launchDraft?: ReferralFormDraft | null;
}) {
  const CLINICS = clinics;
  const SERVICES_DATA = servicesData;
  const CLINIC_NAMES = Object.values(CLINICS).map((c) => c.name);
  const clinicByName = Object.fromEntries(Object.values(CLINICS).map((clinic) => [clinic.name, clinic]));
  const SERVICE_LIST = Object.keys(SERVICES_DATA);
  const canSkipReferringClinic = (role === "clinic_admin" || role === "clinic_member") && Boolean(userClinicName);
  const firstStep = canSkipReferringClinic ? 1 : 0;
  const visibleSteps = canSkipReferringClinic ? STEPS.slice(1) : STEPS;
  const defaultClinicFilter = role === "master_admin" ? "All" : userClinicName ?? "All";
  const getServiceIcon = (service: string) => SERVICES_DATA[service]?.icon ?? "🏥";
  const formatReferralTime = (time: string) => {
    const parsed = new Date(`1970-01-01T${time}`);
    if (Number.isNaN(parsed.getTime())) {
      return time;
    }
    return parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  };
  const formatReferralDateTimeShort = (date: string, time: string) => {
    const parsed = new Date(`${date}T${time}`);
    if (Number.isNaN(parsed.getTime())) {
      return `${date}, ${time}`;
    }
    return parsed.toLocaleString("en-US");
  };
  const generateReferralId = () => {
    const currentSecond = Math.floor(Date.now() / 1000) % 1_000_000_000;

    if (currentSecond === lastSecond) {
      sequence += 1;
    } else {
      lastSecond = currentSecond;
      sequence = 0;
    }

    if (sequence > 9) {
      throw new Error("Too many IDs generated in the same second");
    }

    return Number(`${currentSecond}${sequence}`);
  };

  const [referrals, setReferrals] = useState<Referral[]>(initialReferrals);
  const [view, setView] = useState<"list" | "form" | "detail">("list");
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    referringClinic: canSkipReferringClinic ? userClinicName ?? "" : ""
  }));
  const [step, setStep] = useState(firstStep);
  const [submitted, setSubmitted] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [pendingDeleteReferral, setPendingDeleteReferral] = useState<Referral | null>(null);
  const [isEditingDetailNotes, setIsEditingDetailNotes] = useState(false);
  const [detailNotesDraft, setDetailNotesDraft] = useState("");
  const [isSavingDetailNotes, setIsSavingDetailNotes] = useState(false);
  const [filterClinic, setFilterClinic] = useState(defaultClinicFilter);
  const [filterService, setFilterService] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const buildInitialForm = (draft?: ReferralFormDraft | null) => ({
    ...EMPTY_FORM,
    referringClinic: canSkipReferringClinic ? userClinicName ?? "" : "",
    service: draft?.service ?? "",
    receivingClinic: draft?.receivingClinic ?? ""
  });

  useEffect(() => {
    if (!canSkipReferringClinic) {
      return;
    }

    setForm((current) => {
      if (current.referringClinic === userClinicName) {
        return current;
      }

      return {
        ...current,
        referringClinic: userClinicName ?? ""
      };
    });

    setStep((current) => (current < firstStep ? firstStep : current));
  }, [canSkipReferringClinic, firstStep, userClinicName]);

  useEffect(() => {
    if (!launchDraft) {
      return;
    }

    setForm({
      ...EMPTY_FORM,
      referringClinic: canSkipReferringClinic ? userClinicName ?? "" : "",
      service: launchDraft.service ?? "",
      receivingClinic: launchDraft.receivingClinic ?? ""
    });
    setStep(
      !canSkipReferringClinic
        ? 0
        : launchDraft.service && launchDraft.receivingClinic
          ? 3
          : launchDraft.service
            ? 2
            : firstStep
    );
    setSubmitted(false);
    setErrors({});
    setView("form");
  }, [canSkipReferringClinic, firstStep, launchDraft, userClinicName]);

  const save = (updated: Referral[]) => {
    setReferrals(updated);
    localStorage.setItem("referrals", JSON.stringify(updated));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (step === 0 && !form.referringClinic) e.referringClinic = "Please select a referring clinic";
    if (step === 1 && !form.service) e.service = "Please select a service";
    if (step === 2 && !form.receivingClinic) e.receivingClinic = "Please select a receiving clinic";
    if (step === 2 && form.referringClinic && form.receivingClinic === form.referringClinic)
      e.receivingClinic = "Referring and receiving clinic cannot be the same";
    if (step === 3 && !form.preceptor.trim()) e.preceptor = "Please enter the preceptor name";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (validate()) setStep((s) => s + 1);
  };
  const back = () => {
    setErrors({});
    if (step === firstStep) {
      setView("list");
      return;
    }
    setStep((s) => s - 1);
  };

  const submit = async () => {
    const now = new Date();
    const referringClinic = clinicByName[form.referringClinic];
    const receivingClinic = clinicByName[form.receivingClinic];
    const clinicService = SERVICES_DATA[form.service]?.clinics.find((entry) => entry.clinicId === receivingClinic?.id);

    if (!referringClinic || !receivingClinic || !clinicService) {
      setErrors({
        ...errors,
        receivingClinic: "Please select a valid receiving clinic for this service"
      });
      return;
    }

    const entry: Referral = {
      id: generateReferralId(),
      referringClinicId: referringClinic.id,
      receivingClinicId: receivingClinic.id,
      clinicServiceId: clinicService.id,
      referringClinic: referringClinic.name,
      receivingClinic: receivingClinic.name,
      service: form.service,
      date: now.toISOString().split("T")[0],
      time: now.toTimeString().split(" ")[0].substring(0, 5),
      status: "sent",
      preceptor: form.preceptor,
      notes: form.notes,
      submittedAt: now.toISOString()
    };
    
    // Save to database via API
    try {
      const response = await fetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry)
      });

      if (!response.ok) {
        throw new Error("Referral could not be saved.");
      }
    } catch (error) {
      console.error("Failed to save referral to database", error);
      return;
    }
    
    // Save to state and localStorage
    const userClinicId = userClinicName ? clinicByName[userClinicName]?.id : undefined;
    const updated = [entry, ...referrals].filter((referral) => canAccessReferral(referral, role, userClinicId));
    save(updated);
    setSubmitted(true);
  };

  const startNew = () => {
    setForm(buildInitialForm());
    setStep(firstStep);
    setSubmitted(false);
    setErrors({});
    setView("form");
  };

  const deleteReferral = async (id: number) => {
    // Delete from database via API
    try {
      const response = await fetch(`/api/referrals?id=${id}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error("Referral could not be deleted.");
      }
    } catch (error) {
      console.error("Failed to delete referral from database", error);
      return;
    }
    
    // Remove from state and localStorage
    save(referrals.filter((r) => r.id !== id));
  };

  const updateReferralStatus = async (id: number, status: Referral["status"]) => {
    const referral = referrals.find((entry) => entry.id === id);

    if (!referral) {
      return;
    }

    try {
      const response = await fetch("/api/referrals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status })
      });

      if (!response.ok) {
        throw new Error("Referral status could not be updated.");
      }
    } catch (error) {
      console.error("Failed to update referral status", error);
      return;
    }

    save(
      referrals.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              status
            }
          : entry
      )
    );
  };

  const filtered = referrals.filter(
    (r) =>
      (filterClinic === "All" || r.referringClinic === filterClinic || r.receivingClinic === filterClinic) &&
      (filterService === "All" || r.service === filterService) &&
      (filterStatus === "All" || r.status === filterStatus)
  );

  const detailEntry = referrals.find((r) => r.id === detailId);

  useEffect(() => {
    if (!detailEntry) {
      setIsEditingDetailNotes(false);
      setDetailNotesDraft("");
      return;
    }

    setDetailNotesDraft(detailEntry.notes ?? "");
  }, [detailEntry]);

  const inp = (field: string, value: string) => {
    setForm((f) => {
      const updated = { ...f, [field]: value };
      // If service changes, clear receiving clinic since it may not be valid
      if (field === "service" && f.receivingClinic) {
        updated.receivingClinic = "";
      }
      return updated;
    });
    setErrors((e) => {
      const newErrors = { ...e };
      delete newErrors[field];
      // Also clear receiving clinic error if service changes
      if (field === "service") {
        delete newErrors.receivingClinic;
      }
      return newErrors;
    });
  };

  const editDetailNotes = () => {
    if (!detailEntry) {
      return;
    }

    setDetailNotesDraft(detailEntry.notes ?? "");
    setIsEditingDetailNotes(true);
  };

  const discardDetailNotesChanges = () => {
    if (!detailEntry) {
      return;
    }

    if (!window.confirm("Discard your notes changes?")) {
      return;
    }

    setDetailNotesDraft(detailEntry.notes ?? "");
    setIsEditingDetailNotes(false);
  };

  const saveDetailNotes = async () => {
    if (!detailEntry) {
      return;
    }

    setIsSavingDetailNotes(true);

    const updatedEntry: Referral = {
      ...detailEntry,
      notes: detailNotesDraft.trim()
    };

    try {
      const response = await fetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedEntry)
      });

      if (!response.ok) {
        throw new Error("Referral notes could not be updated.");
      }

      save(referrals.map((entry) => (entry.id === detailEntry.id ? updatedEntry : entry)));
      setIsEditingDetailNotes(false);
    } catch (error) {
      console.error("Failed to update referral notes", error);
    } finally {
      setIsSavingDetailNotes(false);
    }
  };

  const inputStyle = (err?: string) => ({
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "11px 14px",
    fontSize: 13.5,
    border: `1.5px solid ${err ? "#EF4444" : "#E2E8F0"}`,
    borderRadius: 10,
    outline: "none",
    background: "#fff",
    color: "#0F172A",
    transition: "border-color 0.15s"
  });

  const selectStyle = (err?: string) => ({ ...inputStyle(err), cursor: "pointer", appearance: "none" as const });

  // ── SUBMITTED CONFIRMATION ──
  if (submitted)
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px 20px",
          textAlign: "center"
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: "#F0FDF4",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
            fontSize: 32
          }}
        >
          ✅
        </div>
        <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Referral Logged!</h2>
        <p style={{ color: "#64748B", fontSize: 14, margin: "0 0 28px", maxWidth: 360, lineHeight: 1.6 }}>
          The referral from <strong>{form.referringClinic}</strong> to <strong>{form.receivingClinic}</strong> for{" "}
          <strong>{form.service}</strong> has been recorded.
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => {
              setSubmitted(false);
              setView("list");
            }}
            style={{
              padding: "10px 22px",
              background: "#F1F5F9",
              border: "none",
              borderRadius: 10,
              color: "#334155",
              fontSize: 13.5,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            View All Referrals
          </button>
          <button
            onClick={startNew}
            style={{
              padding: "10px 22px",
              background: "#0F172A",
              border: "none",
              borderRadius: 10,
              color: "#fff",
              fontSize: 13.5,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Log Another
          </button>
        </div>
      </div>
    );

  // ── DETAIL VIEW ──
  if (view === "detail" && detailEntry)
    return (
      <div>
        <button
          onClick={() => setView("list")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "1px solid #E2E8F0",
            borderRadius: 8,
            padding: "7px 14px",
            cursor: "pointer",
            color: "#64748B",
            fontSize: 13,
            fontWeight: 500,
            marginBottom: 24
          }}
        >
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to referrals
        </button>
        <div
          style={{
            background: "linear-gradient(135deg,#0F172A,#1E3A5F)",
            borderRadius: 16,
            padding: "24px 28px",
            marginBottom: 24
          }}
        >
          <div
            style={{
              color: "#38BDF8",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              marginBottom: 8
            }}
          >
            Referral Record · #{detailEntry.id}
          </div>
          <div style={{ color: "#fff", fontSize: 20, fontWeight: 700, marginBottom: 6 }}>{detailEntry.service}</div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
            Submitted {formatReferralDateTimeShort(detailEntry.date, detailEntry.time)}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          {[
            { label: "Referring Clinic", value: detailEntry.referringClinic, icon: "🏥" },
            { label: "Receiving Clinic", value: detailEntry.receivingClinic, icon: "🎯" },
            {
              label: "Date & Time",
              value: `${new Date(detailEntry.date + "T12:00:00").toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric"
              })} at ${formatReferralTime(detailEntry.time)}`,
              icon: "📅"
            },
            { label: "Status", value: detailEntry.status, icon: "📌" },
            { label: "Service", value: detailEntry.service, icon: "🩺" },
            { label: "Referring Preceptor", value: detailEntry.preceptor, icon: "👨‍⚕️" }
          ].map((item) => (
            <div
              key={item.label}
              style={{ background: "#fff", border: "1.5px solid #E2E8F0", borderRadius: 12, padding: "16px 18px" }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  color: "#94A3B8",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  marginBottom: 6
                }}
              >
                {item.icon} {item.label}
              </div>
              <div style={{ fontSize: 14, color: "#0F172A", fontWeight: 600 }}>{item.value}</div>
            </div>
          ))}
        </div>
        <div style={{ background: "#fff", border: "1.5px solid #E2E8F0", borderRadius: 12, padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <div
              style={{
                fontSize: 10.5,
                color: "#94A3B8",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.8
              }}
            >
              📝 Notes
            </div>
            {!isEditingDetailNotes ? (
              <button
                onClick={editDetailNotes}
                style={{
                  padding: "8px 12px",
                  background: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                  borderRadius: 8,
                  color: "#334155",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Edit
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={discardDetailNotesChanges}
                  disabled={isSavingDetailNotes}
                  style={{
                    padding: "8px 12px",
                    background: "#F8FAFC",
                    border: "1px solid #E2E8F0",
                    borderRadius: 8,
                    color: "#334155",
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: isSavingDetailNotes ? "default" : "pointer",
                    opacity: isSavingDetailNotes ? 0.65 : 1
                  }}
                >
                  Discard Changes
                </button>
                <button
                  onClick={saveDetailNotes}
                  disabled={isSavingDetailNotes}
                  style={{
                    padding: "8px 12px",
                    background: "#0F172A",
                    border: "none",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: isSavingDetailNotes ? "default" : "pointer",
                    opacity: isSavingDetailNotes ? 0.65 : 1
                  }}
                >
                  {isSavingDetailNotes ? "Saving..." : "Save"}
                </button>
              </div>
            )}
          </div>
          {isEditingDetailNotes ? (
            <textarea
              value={detailNotesDraft}
              onChange={(event) => setDetailNotesDraft(event.target.value)}
              rows={4}
              placeholder="Add referral notes..."
              style={{ ...inputStyle(), resize: "vertical", fontFamily: "inherit" }}
            />
          ) : (
            <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.6 }}>
              {detailEntry.notes?.trim() ? detailEntry.notes : "No notes added."}
            </div>
          )}
        </div>
      </div>
    );

  // ── FORM VIEW ──
  if (view === "form") {
    const displayStep = canSkipReferringClinic ? step - 1 : step;
    const progress = (displayStep / (visibleSteps.length - 1)) * 100;
    return (
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        {/* Progress header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#0F172A" }}>Log a Referral</h2>
            <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 500 }}>
              Step {displayStep + 1} of {visibleSteps.length}
            </span>
          </div>
          {/* Step pills */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {visibleSteps.map((s, i) => (
              <div
                key={s}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "4px 12px",
                  borderRadius: 20,
                  background: i < displayStep ? "#0F172A" : i === displayStep ? "#38BDF8" : "#F1F5F9",
                  color: i < displayStep ? "#fff" : i === displayStep ? "#0F172A" : "#94A3B8",
                  transition: "all 0.2s"
                }}
              >
                {i < displayStep ? "✓ " : ""}
                {s}
              </div>
            ))}
          </div>
          {/* Progress bar */}
          <div style={{ height: 4, background: "#F1F5F9", borderRadius: 99, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                background: "linear-gradient(90deg,#38BDF8,#818CF8)",
                borderRadius: 99,
                transition: "width 0.3s ease"
              }}
            />
          </div>
        </div>

        {/* Step card */}
        <div
          style={{
            background: "#fff",
            border: "1.5px solid #E2E8F0",
            borderRadius: 16,
            padding: "28px 28px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.06)"
          }}
        >
          {/* Step 0 – Referring Clinic */}
          {step === 0 && (
            <div>
              <div style={{ fontSize: 22, marginBottom: 4 }}>🏥</div>
              <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700, color: "#0F172A" }}>
                Which clinic is making the referral?
              </h3>
              <p style={{ margin: "0 0 20px", color: "#64748B", fontSize: 13 }}>
                Select the clinic where the patient is currently being seen.
              </p>
              <div style={{ position: "relative" }}>
                <select
                  value={form.referringClinic}
                  onChange={(e) => inp("referringClinic", e.target.value)}
                  disabled={canSkipReferringClinic}
                  style={selectStyle(errors.referringClinic)}
                >
                  <option value="">— Select referring clinic —</option>
                  {CLINIC_NAMES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <svg
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
                  width="14"
                  height="14"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="#94A3B8"
                  strokeWidth="2.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              {errors.referringClinic && (
                <div style={{ color: "#EF4444", fontSize: 12, marginTop: 6 }}>⚠ {errors.referringClinic}</div>
              )}
              {canSkipReferringClinic && (
                <div style={{ color: "#64748B", fontSize: 12, marginTop: 6 }}>
                  Your clinic is filled automatically from your account and cannot be changed.
                </div>
              )}
            </div>
          )}

          {/* Step 1 – Service */}
          {step === 1 && (
            <div>
              <div style={{ fontSize: 22, marginBottom: 4 }}>🩺</div>
              <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700, color: "#0F172A" }}>
                What service is this referral for?
              </h3>
              <p style={{ margin: "0 0 20px", color: "#64748B", fontSize: 13 }}>
                Select the relevant service for this referral.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {SERVICE_LIST.map((s) => (
                  <button
                    key={s}
                    onClick={() => inp("service", s)}
                    style={{
                      padding: "10px 12px",
                      textAlign: "left",
                      border: `1.5px solid ${form.service === s ? "#38BDF8" : "#E2E8F0"}`,
                      borderRadius: 10,
                      background: form.service === s ? "#F0F9FF" : "#fff",
                      color: form.service === s ? "#0369A1" : "#334155",
                      fontSize: 12.5,
                      fontWeight: form.service === s ? 600 : 400,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      transition: "all 0.13s"
                    }}
                  >
                    <span>{getServiceIcon(s)}</span>
                    {s}
                    {form.service === s && <span style={{ marginLeft: "auto", color: "#38BDF8" }}>✓</span>}
                  </button>
                ))}
              </div>
              {errors.service && (
                <div style={{ color: "#EF4444", fontSize: 12, marginTop: 8 }}>⚠ {errors.service}</div>
              )}
            </div>
          )}

          {/* Step 2 – Receiving Clinic (filtered by service) */}
          {step === 2 && (
            <div>
              <div style={{ fontSize: 22, marginBottom: 4 }}>🎯</div>
              <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700, color: "#0F172A" }}>
                Which clinic is receiving the referral?
              </h3>
              <p style={{ margin: "0 0 20px", color: "#64748B", fontSize: 13 }}>
                Select a clinic that offers {form.service} services.
              </p>
              <div style={{ position: "relative" }}>
                <select
                  value={form.receivingClinic}
                  onChange={(e) => inp("receivingClinic", e.target.value)}
                  style={selectStyle(errors.receivingClinic)}
                >
                  <option value="">— Select receiving clinic —</option>
                  {(() => {
                    const serviceData = (SERVICES_DATA as Record<string, ServiceData>)[form.service];
                    if (!serviceData) return null;
                    return serviceData.clinics
                      .map(entry => (CLINICS as Record<string, ClinicInfo>)[entry.clinicKey].name)
                      .filter(name => name !== form.referringClinic)
                      .map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ));
                  })()}
                </select>
                <svg
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
                  width="14"
                  height="14"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="#94A3B8"
                  strokeWidth="2.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              {errors.receivingClinic && (
                <div style={{ color: "#EF4444", fontSize: 12, marginTop: 6 }}>⚠ {errors.receivingClinic}</div>
              )}
              <div style={{ marginTop: 16, padding: "12px 14px", background: "#F8FAFC", borderRadius: 10, fontSize: 12.5, color: "#64748B" }}>
                <span style={{ color: "#94A3B8" }}>Service: </span>
                <strong style={{ color: "#0F172A" }}>{form.service}</strong>
              </div>
              <div style={{ marginTop: 10, padding: "12px 14px", background: "#F8FAFC", borderRadius: 10, fontSize: 12.5, color: "#64748B" }}>
                <span style={{ color: "#94A3B8" }}>Referring from: </span>
                <strong style={{ color: "#0F172A" }}>{form.referringClinic}</strong>
              </div>
            </div>
          )}

          {/* Step 3 – Preceptor */}
          {step === 3 && (
            <div>
              <div style={{ fontSize: 22, marginBottom: 4 }}>👨‍⚕️</div>
              <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700, color: "#0F172A" }}>
                Who is the referring preceptor?
              </h3>
              <p style={{ margin: "0 0 20px", color: "#64748B", fontSize: 13 }}>
                Enter the full name of the supervising preceptor making this referral.
              </p>
              <input
                type="text"
                value={form.preceptor}
                onChange={(e) => inp("preceptor", e.target.value)}
                placeholder="Dr. First Last"
                style={inputStyle(errors.preceptor)}
              />
              {errors.preceptor && (
                <div style={{ color: "#EF4444", fontSize: 12, marginTop: 6 }}>⚠ {errors.preceptor}</div>
              )}
              <div style={{ marginTop: 18 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                  Additional Notes <span style={{ color: "#94A3B8", fontWeight: 400 }}>(optional)</span>
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => inp("notes", e.target.value)}
                  placeholder="Any additional context about this referral…"
                  rows={3}
                  style={{ ...inputStyle(), resize: "vertical", fontFamily: "inherit" }}
                />
              </div>
            </div>
          )}

          {/* Step 4 – Review */}
          {step === 4 && (
            <div>
              <div style={{ fontSize: 22, marginBottom: 4 }}>📋</div>
              <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700, color: "#0F172A" }}>Review & Confirm</h3>
              <p style={{ margin: "0 0 20px", color: "#64748B", fontSize: 13 }}>
                Please verify all details before submitting.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { label: "Referring Clinic", value: form.referringClinic, icon: "🏥" },
                  { label: "Service", value: `${getServiceIcon(form.service)} ${form.service}`, icon: "" },
                  { label: "Receiving Clinic", value: form.receivingClinic, icon: "🎯" },
                  { label: "Referring Preceptor", value: form.preceptor, icon: "👨‍⚕️" },
                  ...(form.notes ? [{ label: "Notes", value: form.notes, icon: "📝" }] : [])
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "11px 14px",
                      background: "#F8FAFC",
                      borderRadius: 10,
                      gap: 12
                    }}
                  >
                    <span style={{ fontSize: 12.5, color: "#94A3B8", fontWeight: 600, flexShrink: 0 }}>
                      {item.icon} {item.label}
                    </span>
                    <span style={{ fontSize: 12.5, color: "#0F172A", fontWeight: 500, textAlign: "right" }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}



          {/* Navigation */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28, gap: 10 }}>
            {step > firstStep ? (
              <button
                onClick={back}
                style={{
                  padding: "10px 20px",
                  background: "#F1F5F9",
                  border: "none",
                  borderRadius: 10,
                  color: "#334155",
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                ← Back
              </button>
            ) : (
              <button
                onClick={() => setView("list")}
                style={{
                  padding: "10px 20px",
                  background: "#F1F5F9",
                  border: "none",
                  borderRadius: 10,
                  color: "#334155",
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                onClick={next}
                style={{
                  padding: "10px 28px",
                  background: "#0F172A",
                  border: "none",
                  borderRadius: 10,
                  color: "#fff",
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Continue →
              </button>
            ) : (
              <button
                onClick={submit}
                style={{
                  padding: "10px 28px",
                  background: "linear-gradient(135deg,#16A34A,#15803D)",
                  border: "none",
                  borderRadius: 10,
                  color: "#fff",
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                ✓ Submit Referral
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── LIST VIEW ──
  const uniqueReferringClinics = [...new Set(referrals.map((r) => r.referringClinic))];
  const usedServices = [...new Set(referrals.map((r) => r.service))];

  return (
    <div>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#0F172A" }}>Referrals Tracker</h2>
          <p style={{ margin: "4px 0 0", color: "#64748B", fontSize: 13 }}>
            {referrals.length === 0
              ? "No referrals logged yet."
              : `${referrals.length} total referral${referrals.length !== 1 ? "s" : ""} on record`}
          </p>
        </div>
        <button
          onClick={() => {
            setForm(buildInitialForm());
            setStep(firstStep);
            setErrors({});
            setView("form");
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "10px 20px",
            background: "#0F172A",
            border: "none",
            borderRadius: 10,
            color: "#fff",
            fontSize: 13.5,
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Log New Referral
        </button>
      </div>

      {/* Stats cards */}
      {referrals.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total Referrals", value: referrals.length, icon: "📋", color: "#0EA5E9" },
            {
              label: "Clinics Involved",
              value: new Set([...referrals.map((r) => r.referringClinic), ...referrals.map((r) => r.receivingClinic)]).size,
              icon: "🏥",
              color: "#8B5CF6"
            },
            { label: "Services", value: new Set(referrals.map((r) => r.service)).size, icon: "🩺", color: "#16A34A" },
            { label: "Preceptors", value: new Set(referrals.map((r) => r.preceptor)).size, icon: "👨‍⚕️", color: "#F59E0B" }
          ].map((stat) => (
            <div key={stat.label} style={{ background: "#fff", border: "1.5px solid #E2E8F0", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{stat.icon}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4, fontWeight: 500 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      {referrals.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <select
              value={filterClinic}
              onChange={(e) => setFilterClinic(e.target.value)}
              style={{
                padding: "7px 28px 7px 12px",
                border: "1.5px solid #E2E8F0",
                borderRadius: 8,
                background: "#fff",
                color: "#334155",
                fontSize: 12.5,
                cursor: "pointer",
                outline: "none",
                appearance: "none"
              }}
            >
              <option value="All">All Clinics</option>
              {uniqueReferringClinics.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <svg
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
              width="12"
              height="12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="#94A3B8"
              strokeWidth="2.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          <div style={{ position: "relative" }}>
            <select
              value={filterService}
              onChange={(e) => setFilterService(e.target.value)}
              style={{
                padding: "7px 28px 7px 12px",
                border: "1.5px solid #E2E8F0",
                borderRadius: 8,
                background: "#fff",
                color: "#334155",
                fontSize: 12.5,
                cursor: "pointer",
                outline: "none",
                appearance: "none"
              }}
            >
              <option value="All">All Services</option>
              {usedServices.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <svg
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
              width="12"
              height="12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="#94A3B8"
              strokeWidth="2.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          <div style={{ position: "relative" }}>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{
                padding: "7px 28px 7px 12px",
                border: "1.5px solid #E2E8F0",
                borderRadius: 8,
                background: "#fff",
                color: "#334155",
                fontSize: 12.5,
                cursor: "pointer",
                outline: "none",
                appearance: "none"
              }}
            >
              <option value="All">Status</option>
              {REFERRAL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
            <svg
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
              width="12"
              height="12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="#94A3B8"
              strokeWidth="2.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {(filterClinic !== defaultClinicFilter || filterService !== "All" || filterStatus !== "All") && (
            <button
              onClick={() => {
                setFilterClinic(defaultClinicFilter);
                setFilterService("All");
                setFilterStatus("All");
              }}
              style={{
                padding: "7px 12px",
                background: "#FEE2E2",
                border: "none",
                borderRadius: 8,
                color: "#DC2626",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              ✕ Clear filters
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {referrals.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", background: "#fff", borderRadius: 16, border: "2px dashed #E2E8F0" }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>📋</div>
          <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 700, color: "#0F172A" }}>No referrals yet</h3>
          <p style={{ color: "#64748B", fontSize: 13.5, margin: "0 0 22px" }}>Start logging referrals to track cross-clinic patient transfers.</p>
          <button
            onClick={() => {
              setForm(EMPTY_FORM);
              setStep(0);
              setErrors({});
              setView("form");
            }}
            style={{
              padding: "10px 22px",
              background: "#0F172A",
              border: "none",
              borderRadius: 10,
              color: "#fff",
              fontSize: 13.5,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Log Your First Referral
          </button>
        </div>
      )}

      {/* Referral table */}
      {filtered.length > 0 && (
        <div style={{ background: "#fff", border: "1.5px solid #E2E8F0", borderRadius: 14, overflow: "hidden" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "100px 110px 1fr 1fr 1fr 120px 120px 56px",
              padding: "10px 18px",
              background: "#F8FAFC",
              borderBottom: "1px solid #E2E8F0",
              gap: 8
            }}
          >
            {["Record #", "Date", "Referring Clinic", "Receiving Clinic", "Service", "Preceptor", "Status", ""].map((h) => (
              <div
                key={h}
                style={{ fontSize: 10.5, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.8 }}
              >
                {h}
              </div>
            ))}
          </div>
          {filtered.map((r, i) => (
            <div
              key={r.id}
              style={{
                display: "grid",
                gridTemplateColumns: "100px 110px 1fr 1fr 1fr 120px 120px 56px",
                padding: "13px 18px",
                borderBottom: i < filtered.length - 1 ? "1px solid #F1F5F9" : "none",
                alignItems: "center",
                gap: 8,
                transition: "background 0.12s"
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ fontSize: 11, fontFamily: "monospace", color: "#334155", fontWeight: 500}}>#{r.id}</div>
              <div style={{ fontSize: 12, color: "#64748B" }}>
                {new Date(r.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{formatReferralTime(r.time)}</div>
              </div>
              <div style={{ fontSize: 12.5, color: "#0F172A", fontWeight: 500 }}>{r.referringClinic}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="#38BDF8" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <span style={{ fontSize: 12.5, color: "#0F172A", fontWeight: 500 }}>{r.receivingClinic}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 13 }}>{getServiceIcon(r.service)}</span>
                <span style={{ fontSize: 12, color: "#334155" }}>{r.service}</span>
              </div>
              <div style={{ fontSize: 12, color: "#334155", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.preceptor}
              </div>
              <div>
                <select
                  value={r.status}
                  onChange={(event) => void updateReferralStatus(r.id, event.target.value as Referral["status"])}
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    borderRadius: 8,
                    border: "1.5px solid #E2E8F0",
                    background: "#fff",
                    color: "#0F172A",
                    fontSize: 12.5,
                    fontWeight: 600
                  }}
                >
                  {REFERRAL_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </option>
                    ))}
                </select>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => {
                    setDetailId(r.id);
                    setView("detail");
                  }}
                  title="View details"
                  style={{
                    background: "#F1F5F9",
                    border: "none",
                    borderRadius: 7,
                    padding: "5px 8px",
                    cursor: "pointer",
                    color: "#475569"
                  }}
                >
                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => setPendingDeleteReferral(r)}
                  title="Delete"
                  style={{
                    background: "#FEF2F2",
                    border: "none",
                    borderRadius: 7,
                    padding: "5px 8px",
                    cursor: "pointer",
                    color: "#DC2626"
                  }}
                >
                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length === 0 && referrals.length > 0 && (
        <div style={{ textAlign: "center", padding: "40px", color: "#94A3B8", fontSize: 13.5 }}>
          No referrals match the current filters.
        </div>
      )}

      {pendingDeleteReferral ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 50
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 440,
              background: "#fff",
              borderRadius: 16,
              padding: 24,
              boxShadow: "0 20px 40px rgba(15,23,42,0.2)"
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800, color: "#0F172A" }}>Delete referral?</h3>
            <p style={{ margin: "0 0 20px", fontSize: 13.5, color: "#475569", lineHeight: 1.6 }}>
              Remove referral <strong>#{pendingDeleteReferral.id}</strong> from <strong>{pendingDeleteReferral.referringClinic}</strong> to{" "}
              <strong>{pendingDeleteReferral.receivingClinic}</strong>. This action cannot be undone.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setPendingDeleteReferral(null)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #CBD5E1",
                  background: "#fff",
                  color: "#334155",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  void deleteReferral(pendingDeleteReferral.id);
                  setPendingDeleteReferral(null);
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "#DC2626",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                Confirm delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UserManagement({
  currentUserId,
  clinicOptions
}: {
  currentUserId: string;
  clinicOptions: Array<{ key: string; name: string }>;
}) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [pendingDeleteUser, setPendingDeleteUser] = useState<AppUser | null>(null);
  const [form, setForm] = useState({
    username: "",
    password: "",
    role: "" as UserRole | "",
    clinicKey: ""
  });
  const allClinicsValue = "__all_clinics__";
  const managementSelectStyle = {
    padding: "9px 11px",
    borderRadius: 9,
    border: "1.5px solid #E2E8F0",
    background: "#fff",
    fontSize: 13,
    color: "#0F172A"
  };

  const loadUsers = async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/users");
      const payload = (await response.json()) as { ok: boolean; users?: AppUser[]; message?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message ?? "Unable to load users.");
      }

      setUsers(payload.users ?? []);
    } catch (loadError) {
      console.error(loadError);
      setError(loadError instanceof Error ? loadError.message : "Unable to load users.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const createNewUser = async () => {
    setIsSaving(true);
    setError("");

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const payload = (await response.json()) as { ok: boolean; users?: AppUser[]; message?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message ?? "Unable to create user.");
      }

      setUsers(payload.users ?? []);
      setForm({
        username: "",
        password: "",
        role: "",
        clinicKey: ""
      });
    } catch (saveError) {
      console.error(saveError);
      setError(saveError instanceof Error ? saveError.message : "Unable to create user.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateAccess = async (userId: string, role: UserRole, clinicKey: string) => {
    setError("");

    try {
      const response = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role, clinicKey })
      });
      const payload = (await response.json()) as { ok: boolean; users?: AppUser[]; message?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message ?? "Unable to update user access.");
      }

      setUsers(payload.users ?? []);
    } catch (saveError) {
      console.error(saveError);
      setError(saveError instanceof Error ? saveError.message : "Unable to update user access.");
    }
  };

  const removeUser = async (userId: string) => {
    setError("");

    try {
      const response = await fetch(`/api/users?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE"
      });
      const payload = (await response.json()) as { ok: boolean; users?: AppUser[]; message?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message ?? "Unable to delete user.");
      }

      setUsers(payload.users ?? []);
      setPendingDeleteUser(null);
    } catch (saveError) {
      console.error(saveError);
      setError(saveError instanceof Error ? saveError.message : "Unable to delete user.");
    }
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) 1fr", gap: 24, alignItems: "start" }}>
        <section
          style={{
            background: "#fff",
            border: "1.5px solid #E2E8F0",
            borderRadius: 16,
            padding: 22,
            boxShadow: "0 2px 12px rgba(15,23,42,0.05)"
          }}
        >
          <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800, color: "#0F172A" }}>Create user</h2>
          <p style={{ margin: "0 0 18px", color: "#64748B", fontSize: 13.5 }}>
            Add a new clinic member, clinic admin, or master admin account.
          </p>

          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>Username</label>
              <input
                className="management-input"
                value={form.username}
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="Username"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "11px 13px",
                  borderRadius: 10,
                  border: "1.5px solid #E2E8F0",
                  fontSize: 13.5,
                  color: "#0F172A"
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>Password</label>
              <input
                className="management-input"
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="Minimum 8 characters"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "11px 13px",
                  borderRadius: 10,
                  border: "1.5px solid #E2E8F0",
                  fontSize: 13.5,
                  color: "#0F172A"
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>Role</label>
              <select
                value={form.role}
                onChange={(event) =>
                  setForm((current) => {
                    const nextRole = event.target.value as UserRole | "";
                    return {
                      ...current,
                      role: nextRole,
                      clinicKey:
                        nextRole === "master_admin"
                          ? ""
                          : current.clinicKey || clinicOptions[0]?.key || ""
                    };
                  })
                }
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "11px 13px",
                  borderRadius: 10,
                  border: "1.5px solid #E2E8F0",
                  fontSize: 13.5,
                  background: "#fff",
                  color: form.role ? "#0F172A" : "#64748B"
                }}
              >
                <option value="" disabled>
                  Select a role
                </option>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>Clinic</label>
              <select
                value={form.role === "master_admin" ? allClinicsValue : form.clinicKey}
                disabled={form.role === "master_admin"}
                onChange={(event) => setForm((current) => ({ ...current, clinicKey: event.target.value }))}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "11px 13px",
                  borderRadius: 10,
                  border: "1.5px solid #E2E8F0",
                  fontSize: 13.5,
                  background: form.role === "master_admin" ? "#F8FAFC" : "#fff",
                  color: form.role === "master_admin" || form.clinicKey ? "#0F172A" : "#64748B",
                  cursor: form.role === "master_admin" ? "not-allowed" : "pointer"
                }}
              >
                {form.role === "master_admin" ? (
                  <option value={allClinicsValue}>All clinics</option>
                ) : (
                  <option value="" disabled>
                    Select a clinic
                  </option>
                )}
                {clinicOptions.map((clinic) => (
                  <option key={clinic.key} value={clinic.key}>
                    {clinic.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={createNewUser}
              disabled={isSaving}
              style={{
                padding: "11px 16px",
                borderRadius: 10,
                border: "none",
                background: "#0F172A",
                color: "#fff",
                fontSize: 13.5,
                fontWeight: 700,
                cursor: isSaving ? "not-allowed" : "pointer",
                opacity: isSaving ? 0.6 : 1
              }}
            >
              {isSaving ? "Creating..." : "Create user"}
            </button>
          </div>
        </section>

        <section
          style={{
            background: "#fff",
            border: "1.5px solid #E2E8F0",
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 2px 12px rgba(15,23,42,0.05)"
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "18px 20px",
              borderBottom: "1px solid #E2E8F0"
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#0F172A" }}>User management</h2>
              <p style={{ margin: "4px 0 0", color: "#64748B", fontSize: 13.5 }}>
                Adjust roles and remove accounts from the system.
              </p>
            </div>
            <button
              onClick={() => void loadUsers()}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #CBD5E1",
                background: "#fff",
                color: "#334155",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Refresh
            </button>
          </div>

          {error ? (
            <div style={{ margin: 20, padding: "12px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, color: "#B91C1C", fontSize: 13 }}>
              {error}
            </div>
          ) : null}

          {isLoading ? (
            <div style={{ padding: 24, color: "#64748B", fontSize: 13.5 }}>Loading users...</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 1fr 1fr 140px",
                  gap: 12,
                  padding: "12px 20px",
                  background: "#F8FAFC",
                  borderBottom: "1px solid #E2E8F0",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  color: "#94A3B8"
                }}
              >
                <div>User</div>
                <div>Role</div>
                <div>Clinic</div>
                <div>Actions</div>
              </div>

              {users.map((user) => (
                <div
                  key={user.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.2fr 1fr 1fr 140px",
                    gap: 12,
                    padding: "16px 20px",
                    borderBottom: "1px solid #F1F5F9",
                    alignItems: "center"
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{user.username}</div>
                    <div style={{ fontSize: 12, color: "#94A3B8" }}>{user.id === currentUserId ? "Current account" : ""}</div>
                  </div>

                  <select
                    value={user.role}
                    onChange={(event) => {
                      const nextRole = event.target.value as UserRole;
                      void updateAccess(
                        user.id,
                        nextRole,
                        nextRole === "master_admin" ? "" : user.clinicKey || clinicOptions[0]?.key || ""
                      );
                    }}
                    style={managementSelectStyle}
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>

                  <select
                    value={user.role === "master_admin" ? allClinicsValue : user.clinicKey ?? ""}
                    disabled={user.role === "master_admin"}
                    onChange={(event) => void updateAccess(user.id, user.role, event.target.value)}
                    style={{
                      ...managementSelectStyle,
                      background: user.role === "master_admin" ? "#F8FAFC" : "#fff",
                      color: "#0F172A",
                      cursor: user.role === "master_admin" ? "not-allowed" : "pointer"
                    }}
                  >
                    {user.role === "master_admin" && <option value={allClinicsValue}>All clinics</option>}
                    {clinicOptions.map((clinic) => (
                      <option key={clinic.key} value={clinic.key}>
                        {clinic.name}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => setPendingDeleteUser(user)}
                    disabled={user.id === currentUserId}
                    style={{
                      padding: "9px 12px",
                      borderRadius: 9,
                      border: "none",
                      background: user.id === currentUserId ? "#E2E8F0" : "#FEF2F2",
                      color: user.id === currentUserId ? "#94A3B8" : "#DC2626",
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: user.id === currentUserId ? "not-allowed" : "pointer"
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {pendingDeleteUser ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 50
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 420,
              background: "#fff",
              borderRadius: 16,
              padding: 24,
              boxShadow: "0 20px 40px rgba(15,23,42,0.2)"
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800, color: "#0F172A" }}>Delete user?</h3>
            <p style={{ margin: "0 0 20px", fontSize: 13.5, color: "#475569", lineHeight: 1.6 }}>
              Remove <strong>{pendingDeleteUser.username}</strong> from the system. This action cannot be undone.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setPendingDeleteUser(null)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #CBD5E1",
                  background: "#fff",
                  color: "#334155",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => void removeUser(pendingDeleteUser.id)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "#DC2626",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                Confirm delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── MAIN APP COMPONENT ─────────────────────────────────────────────────────
export default function ClinicReferralApp({ username, userId, role, clinicKey, clinics, servicesData, initialReferrals }: AppPageProps) {
  const CLINICS = clinics;
  const SERVICES_DATA = servicesData;
  const services = Object.keys(SERVICES_DATA);
  const clinicOptions = Object.entries(CLINICS)
    .map(([key, info]) => ({ key, name: info.name }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const canManageUsers = role === "master_admin";
  const sidebarClinicLabel = role === "master_admin" ? "" : clinicKey ? CLINICS[clinicKey]?.name ?? "Unknown clinic" : "No clinic assigned";
  const [section, setSection] = useState<"services" | "tracker" | "users">("tracker");
  const [activeService, setActiveService] = useState(services[0]);
   const [selectedEntry, setSelectedEntry] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [search] = useState("");
  const [trackerLaunchDraft, setTrackerLaunchDraft] = useState<ReferralFormDraft | null>(null);

  const filtered = services.filter((s) => s.toLowerCase().includes(search.toLowerCase()));
  const currentEntries = (SERVICES_DATA as Record<string, ServiceData>)[activeService]?.clinics || [];
  const currentEntry = selectedEntry ? currentEntries.find((e) => e.id === selectedEntry) : null;
  const currentInfo: ClinicInfo | null = currentEntry ? (CLINICS as Record<string, ClinicInfo>)[currentEntry.clinicKey] : null;

  const handleService = (s: string) => {
    setActiveService(s);
    setSelectedEntry(null);
    setSection("services");
  };

  const openReferralFormForClinic = (draft: ReferralFormDraft) => {
    setTrackerLaunchDraft({ ...draft });
    setSection("tracker");
  };

  return (
    <>
      <Head>
        <title>Student Clinic Referral System</title>
      </Head>
      <div
        style={{
          fontFamily: "'DM Sans','Segoe UI',sans-serif",
          display: "flex",
          height: "100vh",
          background: "#F8FAFC",
          overflow: "hidden"
        }}
      >
        {/* SIDEBAR */}
        <aside
          style={{
            width: sidebarOpen ? 252 : 64,
            minWidth: sidebarOpen ? 252 : 64,
            background: "#0F172A",
            display: "flex",
            flexDirection: "column",
            transition: "width 0.22s ease, min-width 0.22s ease",
            overflow: "hidden",
            boxShadow: "4px 0 20px rgba(0,0,0,0.18)",
            zIndex: 10
          }}
        >
          {/* Logo */}
          <div
            style={{
              padding: sidebarOpen ? "20px 16px 16px" : "20px 12px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
              display: "flex",
              alignItems: "center",
              justifyContent: sidebarOpen ? "space-between" : "center",
              gap: 8
            }}
          >
            {sidebarOpen && (
              <div>
                <div style={{ color: "#38BDF8", fontWeight: 800, fontSize: 13, letterSpacing: 0.8, textTransform: "uppercase" }}>
                  Student Clinic
                </div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10.5, marginTop: 1 }}>Referral System</div>
              </div>
            )}
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "none",
                borderRadius: 7,
                color: "rgba(255,255,255,0.5)",
                cursor: "pointer",
                padding: "5px 7px",
                display: "flex",
                alignItems: "center",
                flexShrink: 0
              }}
            >
              {sidebarOpen ? (
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
                </svg>
              ) : (
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M6 5l7 7-7 7" />
                </svg>
              )}
            </button>
          </div>

          {/* Referral Tracker nav button */}
          <div style={{ padding: "10px 8px 4px" }}>
            <button
              onClick={() => setSection("tracker")}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: sidebarOpen ? "10px 10px" : "10px 0",
                justifyContent: sidebarOpen ? "flex-start" : "center",
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                background: section === "tracker" ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.04)",
                color: section === "tracker" ? "#FCD34D" : "rgba(255,255,255,0.6)",
                fontWeight: section === "tracker" ? 700 : 500,
                fontSize: 13,
                transition: "all 0.13s",
                outline: "none",
                position: "relative"
              }}
            >
              {section === "tracker" && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 3,
                    height: 18,
                    borderRadius: 2,
                    background: "#FCD34D"
                  }}
                />
              )}
              <span style={{ fontSize: 17, flexShrink: 0 }}>📊</span>
              {sidebarOpen && <span>Referrals Tracker</span>}
            </button>
          </div>

          {canManageUsers && (
            <div style={{ padding: "4px 8px 4px" }}>
              <button
                onClick={() => setSection("users")}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: sidebarOpen ? "10px 10px" : "10px 0",
                  justifyContent: sidebarOpen ? "flex-start" : "center",
                  borderRadius: 10,
                  border: "none",
                  cursor: "pointer",
                  background: section === "users" ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.04)",
                  color: section === "users" ? "#6EE7B7" : "rgba(255,255,255,0.6)",
                  fontWeight: section === "users" ? 700 : 500,
                  fontSize: 13,
                  transition: "all 0.13s",
                  outline: "none",
                  position: "relative"
                }}
              >
                {section === "users" && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 3,
                      height: 18,
                      borderRadius: 2,
                      background: "#6EE7B7"
                    }}
                  />
                )}
                <span style={{ fontSize: 17, flexShrink: 0 }}>👥</span>
                {sidebarOpen && <span>User Management</span>}
              </button>
            </div>
          )}

          {/* Divider + label */}
          {sidebarOpen && (
            <div style={{ padding: "12px 16px 4px", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
              <span
                style={{
                  color: "rgba(255,255,255,0.25)",
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: 1.4,
                  textTransform: "uppercase",
                  whiteSpace: "nowrap"
                }}
              >
                Services
              </span>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
            </div>
          )}
          {!sidebarOpen && <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "4px 0" }} />}

          {/* Search */}
          {/* {sidebarOpen && section === "services" && (
            <div style={{ padding: "6px 12px 4px" }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search services…"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  color: "#fff",
                  padding: "7px 10px",
                  fontSize: 12,
                  outline: "none"
                }}
              />
            </div>
          )} */}

          {/* Service nav */}
          <nav className="hide-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "4px 8px 12px" }}>
            {filtered.map((s) => {
              const active = section === "services" && activeService === s;
              return (
                <button
                  key={s}
                  onClick={() => handleService(s)}
                  title={!sidebarOpen ? s : undefined}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    padding: sidebarOpen ? "9px 10px" : "9px 0",
                    justifyContent: sidebarOpen ? "flex-start" : "center",
                    marginBottom: 1,
                    borderRadius: 9,
                    border: "none",
                    cursor: "pointer",
                    background: active ? "rgba(56,189,248,0.13)" : "transparent",
                    color: active ? "#38BDF8" : "rgba(255,255,255,0.5)",
                    fontWeight: active ? 600 : 400,
                    fontSize: 13,
                    transition: "all 0.13s",
                    textAlign: "left",
                    outline: "none",
                    position: "relative"
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = "transparent";
                  }}
                >
                  {active && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 3,
                        height: 18,
                        borderRadius: 2,
                        background: "#38BDF8"
                      }}
                    />
                  )}
                  <span style={{ fontSize: 17, lineHeight: 1, flexShrink: 0 }}>
                    {(SERVICES_DATA as Record<string, ServiceData>)[s].icon}
                  </span>
                  {sidebarOpen && <span style={{ lineHeight: 1.3, flex: 1 }}>{s}</span>}
                  {sidebarOpen && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        background: active ? "rgba(56,189,248,0.2)" : "rgba(255,255,255,0.08)",
                        color: active ? "#38BDF8" : "rgba(255,255,255,0.3)",
                        borderRadius: 10,
                        padding: "1px 7px",
                        flexShrink: 0
                      }}
                    >
                      {(SERVICES_DATA as Record<string, ServiceData>)[s].clinics.length}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* User */}
          <div
            style={{
              padding: sidebarOpen ? "10px 16px" : "10px",
              borderTop: "1px solid rgba(255,255,255,0.07)",
              display: "flex",
              alignItems: "center",
              gap: 9,
              justifyContent: sidebarOpen ? "space-between" : "center"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg,#38BDF8,#818CF8)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 12,
                  flexShrink: 0
                }}
              >
                {username.charAt(0).toUpperCase()}
              </div>
              {sidebarOpen && (
                <div>
                  <div style={{ color: "#fff", fontSize: 12.5, fontWeight: 600 }}>{username}</div>
                  {sidebarClinicLabel ? <div style={{ color: "rgba(255,255,255,0.33)", fontSize: 10.5 }}>{sidebarClinicLabel}</div> : null}
                  <div style={{ color: "rgba(255,255,255,0.33)", fontSize: 10.5 }}>{ROLE_LABELS[role]}</div>
                </div>
              )}
            </div>
            {sidebarOpen && (
              <Link
                href="/logout"
                style={{
                  color: "rgba(255,255,255,0.5)",
                  fontSize: 11,
                  textDecoration: "none",
                  padding: "4px 8px",
                  borderRadius: 6,
                  transition: "all 0.15s",
                  whiteSpace: "nowrap"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.color = "rgba(255,255,255,0.8)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "rgba(255,255,255,0.5)";
                }}
              >
                Sign out
              </Link>
            )}
          </div>
        </aside>

        {/* MAIN */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* TRACKER SECTION */}
          {section === "tracker" && (
            <>
              <header
                style={{
                  background: "#fff",
                  borderBottom: "1px solid #E2E8F0",
                  padding: "14px 26px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexShrink: 0
                }}
              >
                <span style={{ fontSize: 22 }}>📊</span>
                <div>
                  <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0F172A" }}>Referrals Tracker</h1>
                  <p style={{ margin: 0, fontSize: 11.5, color: "#94A3B8", marginTop: 1 }}>
                    Log and review all cross-clinic patient referrals
                  </p>
                </div>
              </header>
              <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
                <ReferralTracker
                  clinics={CLINICS}
                  servicesData={SERVICES_DATA}
                  initialReferrals={initialReferrals}
                  role={role}
                  userClinicName={clinicKey ? CLINICS[clinicKey]?.name : undefined}
                  launchDraft={trackerLaunchDraft}
                />
              </div>
            </>
          )}

          {/* USERS SECTION */}
          {section === "users" && canManageUsers && (
            <>
              <header
                style={{
                  background: "#fff",
                  borderBottom: "1px solid #E2E8F0",
                  padding: "14px 26px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexShrink: 0
                }}
              >
                <span style={{ fontSize: 22 }}>👥</span>
                <div>
                  <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0F172A" }}>User Management</h1>
                  <p style={{ margin: 0, fontSize: 11.5, color: "#94A3B8", marginTop: 1 }}>
                    Create accounts, assign roles, and manage system access
                  </p>
                </div>
              </header>
              <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
                <UserManagement currentUserId={userId} clinicOptions={clinicOptions} />
              </div>
            </>
          )}

          {/* SPECIALTIES SECTION */}
          {section === "services" && (
            <>
              <header
                style={{
                  background: "#fff",
                  borderBottom: "1px solid #E2E8F0",
                  padding: "14px 26px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexShrink: 0
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{(SERVICES_DATA as Record<string, ServiceData>)[activeService]?.icon}</span>
                  <div>
                    <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0F172A" }}>
                      {activeService}
                      {currentInfo && (
                        <>
                          <span style={{ color: "#CBD5E1", margin: "0 8px" }}>/</span>
                          <span style={{ color: "#0EA5E9" }}>{currentInfo.name}</span>
                        </>
                      )}
                    </h1>
                    <p style={{ margin: 0, fontSize: 11.5, color: "#94A3B8", marginTop: 1 }}>
                      {currentInfo
                        ? `${currentEntry?.docs.length} documents required`
                        : `${currentEntries.length} clinic${currentEntries.length !== 1 ? "s" : ""} available`}
                    </p>
                  </div>
                </div>
                {currentInfo && (
                  <button
                    onClick={() => setSelectedEntry(null)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      background: "none",
                      border: "1px solid #E2E8F0",
                      borderRadius: 8,
                      padding: "6px 14px",
                      cursor: "pointer",
                      color: "#64748B",
                      fontSize: 12.5,
                      fontWeight: 500
                    }}
                  >
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to clinics
                  </button>
                )}
              </header>

              <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
                {/* CLINIC LIST */}
                {!currentInfo && (
                  <div>
                    <p style={{ margin: "0 0 20px", color: "#64748B", fontSize: 13.5 }}>
                      Select a clinic to view required referral documents for <strong>{activeService}</strong>.
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(295px, 1fr))", gap: 18 }}>
                      {currentEntries.map((entry) => {
                        const info = (CLINICS as Record<string, ClinicInfo>)[entry.clinicKey];
                        return (
                          <button
                            key={entry.id}
                            onClick={() => setSelectedEntry(entry.id)}
                            style={{
                              background: "#fff",
                              border: "1.5px solid #E2E8F0",
                              borderRadius: 14,
                              padding: "20px",
                              textAlign: "left",
                              cursor: "pointer",
                              transition: "all 0.16s",
                              boxShadow: "0 1px 4px rgba(0,0,0,0.05)"
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = "#38BDF8";
                              e.currentTarget.style.boxShadow = "0 6px 22px rgba(14,165,233,0.12)";
                              e.currentTarget.style.transform = "translateY(-2px)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = "#E2E8F0";
                              e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)";
                              e.currentTarget.style.transform = "translateY(0)";
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                              <div style={{ flex: 1, paddingRight: 8 }}>
                                <div style={{ fontWeight: 700, fontSize: 14.5, color: "#0F172A", marginBottom: 3 }}>
                                  {info.name}
                                </div>
                                <div style={{ color: "#64748B", fontSize: 11.5, display: "flex", alignItems: "center", gap: 4 }}>
                                  <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                    />
                                  </svg>
                                  {info.location}
                                </div>
                              </div>
                              <div
                                style={{
                                  background: "#F0F9FF",
                                  color: "#0369A1",
                                  fontSize: 10.5,
                                  fontWeight: 600,
                                  padding: "3px 9px",
                                  borderRadius: 20,
                                  whiteSpace: "nowrap",
                                  flexShrink: 0
                                }}
                              >
                                Est. {info.founded}
                              </div>
                            </div>
                            <div style={{ borderTop: "1px solid #F1F5F9", paddingTop: 11, marginBottom: 11 }}>
                              <div
                                style={{
                                  fontSize: 10,
                                  color: "#94A3B8",
                                  textTransform: "uppercase",
                                  letterSpacing: 0.8,
                                  marginBottom: 4,
                                  fontWeight: 700
                                }}
                              >
                                {activeService} schedule
                              </div>
                              <div style={{ fontSize: 12.5, color: "#334155", fontWeight: 500 }}>
                                {entry.notes || entry.status}
                              </div>
                            </div>
                            {info.contact && (
                              <div style={{ marginBottom: 11 }}>
                                <div
                                  style={{
                                    fontSize: 10,
                                    color: "#94A3B8",
                                    textTransform: "uppercase",
                                    letterSpacing: 0.8,
                                    marginBottom: 3,
                                    fontWeight: 700
                                  }}
                                >
                                  Contact
                                </div>
                                <div style={{ fontSize: 12.5, color: "#334155" }}>
                                  {info.contact}
                                  {info.phone && info.phone !== "—" && <span style={{ color: "#64748B" }}> · {info.phone}</span>}
                                </div>
                              </div>
                            )}
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 14 }}>
                              {info.tags.slice(0, 2).map((t) => (
                                <span
                                  key={t}
                                  style={{
                                    background: "#F8FAFC",
                                    border: "1px solid #E2E8F0",
                                    color: "#64748B",
                                    fontSize: 10.5,
                                    padding: "2px 8px",
                                    borderRadius: 10
                                  }}
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ color: "#94A3B8", fontSize: 11.5 }}>{entry.docs.length} docs required</div>
                              <div style={{ color: "#0EA5E9", fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                                View documents{" "}
                                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* DOCUMENTS VIEW */}
                {currentInfo && currentEntry && (
                  <div>
                    <div
                      style={{
                        background: "linear-gradient(135deg, #0F172A 0%, #1E3A5F 100%)",
                        borderRadius: 16,
                        padding: "22px 26px",
                        marginBottom: 24,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        flexWrap: "wrap",
                        gap: 16
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            color: "#38BDF8",
                            fontSize: 10.5,
                            fontWeight: 700,
                            letterSpacing: 1.2,
                            textTransform: "uppercase",
                            marginBottom: 5
                          }}
                        >
                          {activeService} · {currentEntry.notes || currentEntry.status}
                        </div>
                        <div style={{ color: "#fff", fontSize: 19, fontWeight: 700, marginBottom: 6 }}>{currentInfo.name}</div>
                        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12.5, display: "flex", flexWrap: "wrap", gap: 18 }}>
                          <span>📍 {currentInfo.location}</span>
                          {currentInfo.phone && currentInfo.phone !== "—" && <span>📞 {currentInfo.phone}</span>}
                          <span>👤 {currentInfo.contact}</span>
                          <span>🏥 Est. {currentInfo.founded}</span>
                        </div>
                      </div>
                      <div
                        style={{
                          background: "rgba(56,189,248,0.12)",
                          border: "1px solid rgba(56,189,248,0.25)",
                          borderRadius: 12,
                          padding: "12px 18px",
                          textAlign: "center",
                          flexShrink: 0
                        }}
                      >
                        <div style={{ color: "#38BDF8", fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{currentEntry.docs.length}</div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10.5, marginTop: 3 }}>Docs Required</div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
                      {Object.entries(docTypeStyles).map(([type, s]) => (
                        <div
                          key={type}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            background: s.bg,
                            color: s.color,
                            fontSize: 11.5,
                            fontWeight: 600,
                            padding: "4px 12px",
                            borderRadius: 20
                          }}
                        >
                          <DocIcon type={type as "form" | "auth" | "insurance"} />
                          {s.label}
                        </div>
                      ))}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {sortDocuments(currentEntry.docs).map((doc, i) => {
                        const s = docTypeStyles[doc.type];
                        const { previewUrl, downloadUrl } = getDocumentLinks(doc);
                        return (
                          <div
                            key={`${doc.name}-${doc.type}-${i}`}
                            style={{
                              background: "#fff",
                              border: "1.5px solid #E2E8F0",
                              borderLeft: `4px solid ${s.color}`,
                              borderRadius: 12,
                              padding: "16px 20px",
                              display: "flex",
                              alignItems: "center",
                              gap: 14,
                              boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
                            }}
                          >
                            <div
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius: 9,
                                background: s.bg,
                                color: s.color,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0
                              }}
                            >
                              <DocIcon type={doc.type} />
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 13.5, color: "#0F172A", marginBottom: 2 }}>{doc.name}</div>
                              <div style={{ color: "#94A3B8", fontSize: 12 }}>{doc.desc}</div>
                            </div>
                            <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                              <span
                                style={{
                                  background: s.bg,
                                  color: s.color,
                                  fontSize: 10.5,
                                  fontWeight: 600,
                                  padding: "3px 9px",
                                  borderRadius: 20
                                }}
                              >
                                {s.label}
                              </span>
                              {previewUrl && (
                                <a
                                  href={previewUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    background: "#F8FAFC",
                                    color: "#334155",
                                    border: "1px solid #E2E8F0",
                                    borderRadius: 8,
                                    padding: "6px 13px",
                                    fontSize: 11.5,
                                    fontWeight: 600,
                                    textDecoration: "none",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4
                                  }}
                                >
                                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H9m12 0A9 9 0 113 12a9 9 0 0118 0z" />
                                  </svg>
                                  Preview
                                </a>
                              )}
                              {downloadUrl && (
                                <a
                                  href={downloadUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    background: "#0F172A",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: 8,
                                    padding: "6px 13px",
                                    fontSize: 11.5,
                                    fontWeight: 600,
                                    textDecoration: "none",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4
                                  }}
                                >
                                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                    />
                                  </svg>
                                  Download
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div
                      style={{
                        marginTop: 24,
                        padding: "14px 18px",
                        background: "#FFF7ED",
                        border: "1px solid #FED7AA",
                        borderRadius: 12,
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start"
                      }}
                    >
                      <span style={{ fontSize: 17, flexShrink: 0 }}>⚠️</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12.5, color: "#92400E", marginBottom: 2 }}>
                          Before your appointment
                        </div>
                        <div style={{ color: "#B45309", fontSize: 12, lineHeight: 1.65 }}>
                          Ensure all required forms are completed prior to your visit. Contact the clinic coordinator directly if you have
                          questions — many clinics offer multilingual support.
                          {currentInfo.website && (
                            <span>
                              {" "}
                              Visit{" "}
                              <a href={currentInfo.website} target="_blank" rel="noreferrer" style={{ color: "#0EA5E9" }}>
                                {currentInfo.website}
                              </a>{" "}
                              for more info.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
                      <button
                        onClick={() =>
                          openReferralFormForClinic({
                            service: activeService,
                            receivingClinic: currentInfo.name
                          })
                        }
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "11px 18px",
                          background: "#0F172A",
                          border: "none",
                          borderRadius: 10,
                          color: "#fff",
                          fontSize: 13.5,
                          fontWeight: 700,
                          cursor: "pointer"
                        }}
                      >
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        Create Referral for This Clinic
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}
