import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState, useRef } from "react";
import { withIronSessionSsr } from "iron-session/next";
import { getClinics, getSpecialties } from "@/lib/dataSource/postgres";
import { getSessionOptions } from "@/lib/auth/session";
import type { Clinic, Specialty } from "@/lib/types";

type ClinicPageProps = {
    clinics: Clinic[];
    specialties: Specialty[];
    username: string;
};

export const getServerSideProps = withIronSessionSsr<ClinicPageProps>(
    async (context) => {
        if (!context.req.session.isLoggedIn) {
            const nextPath = context.resolvedUrl ?? "/clinic";
            return {
                redirect: {
                    destination: `/login?next=${encodeURIComponent(nextPath)}`,
                    permanent: false
                }
            };
        }

        const [clinics, specialties] = await Promise.all([getClinics(), getSpecialties()]);
        return { props: { clinics, specialties, username: context.req.session.username || "User" } };
    },
    getSessionOptions()
);

function buildMailto(clinic: Clinic) {
    const email = clinic.contact?.email;
    if (!email) return null;

    const subject = `Referral inquiry — ${clinic.name}`;
    const body =
        `Hello ${clinic.name} team,\n\n` +
        `We are reaching out with a referral inquiry.\n\n` +
        `Requested specialty/service:\n` +
        `Urgency:\n` +
        `Best way to coordinate:\n\n` +
        `(Please do not include patient-identifying info.)\n`;

    return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function Tag({ label }: { label: string }) {
    return <span className="tag">{label}</span>;
}

export default function ClinicPage({
    clinics,
    specialties,
    username
}: ClinicPageProps) {
    const router = useRouter();
    const initialOpenClinicId = typeof router.query.open === "string" ? router.query.open : null;
    const clinicRefs = useRef<Record<string, HTMLElement | null>>({});
    const hasAutoScrolled = useRef(false);
    // openClinicId controls which clinic is expanded (accordion behavior)
    const [openClinicId, setOpenClinicId] = useState<string | null>(initialOpenClinicId);

    useEffect(() => {
        // Only auto-scroll if:
        // 1) There is an ?open= param
        // 2) We have not already auto-scrolled
        if (hasAutoScrolled.current) return;

        const openFromQuery =
            typeof router.query.open === "string" ? router.query.open : null;

        if (!openFromQuery || openFromQuery !== openClinicId) return;

        const el = clinicRefs.current[openFromQuery];
        if (!el) return;

        hasAutoScrolled.current = true;

        requestAnimationFrame(() => {
            el.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        });
    }, [openClinicId, router.query.open]);

    const specialtyNameById = useMemo(() => {
        const map: Record<string, string> = {};
        for (const s of specialties) map[s.id] = s.name;
        return map;
    }, [specialties]);

    return (
        <main className="clinic-page">
            <header className="page-header">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                        <h1 className="page-title">Clinics</h1>
                        <p className="page-user-info">Signed in as: <strong>{username}</strong></p>
                    </div>
                </div>
                <p className="page-subtitle">
                    Click a clinic to expand details. Directory only — do not include patient-identifying info.
                </p>
                <div className="page-nav">
                    <Link href="/specialty">← Back to Specialty Page</Link>
                    <Link href="/logout">Sign out</Link>
                </div>
            </header>

            <div className="clinic-list">
                {clinics
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((clinic) => {
                        const isOpen = openClinicId === clinic.id;
                        const mailto = buildMailto(clinic);

                        return (
                            <section
                                key={clinic.id}
                                ref={(el) => {
                                    clinicRefs.current[clinic.id] = el;
                                }}
                                className="clinic-card"
                            >
                                {/* Header row (click to open/close) */}
                                <button
                                    onClick={() => setOpenClinicId(isOpen ? null : clinic.id)}
                                    className="clinic-toggle"
                                >
                                    <div className="clinic-header">
                                        {/* Left: name + tags takes remaining space */}
                                        <div className="clinic-header-left">
                                            {/* Clinic name */}
                                            <div className="clinic-name" title={clinic.name}>
                                                {clinic.name}
                                            </div>

                                            {/* Specialty tags */}
                                            <div className="clinic-tags">
                                                {clinic.specialtyIds.map((sid) => (
                                                    <Tag key={sid} label={specialtyNameById[sid] ?? sid} />
                                                ))}
                                            </div>
                                        </div>

                                        {/* Right: view/hide */}
                                        <div className="clinic-toggle-indicator">
                                            {isOpen ? "Hide ▲" : "View ▼"}
                                        </div>
                                    </div>
                                </button>

                                {/* Expanded content */}
                                {isOpen ? (
                                    <div className="clinic-details">
                                        {clinic.location?.address || clinic.location?.city ? (
                                            <p className="clinic-location">
                                                <b>Location:</b>{" "}
                                                {clinic.location?.address ? `${clinic.location.address}, ` : ""}
                                                {clinic.location?.city ?? ""}
                                                {clinic.location?.state ? `, ${clinic.location.state}` : ""}
                                                {clinic.location?.zip ? ` ${clinic.location.zip}` : ""}
                                            </p>
                                        ) : null}

                                        {clinic.hours ? (
                                            <p className="clinic-hours">
                                                <b>Hours:</b> {clinic.hours}
                                            </p>
                                        ) : null}

                                        {clinic.eligibility ? (
                                            <p className="clinic-eligibility">
                                                <b>Eligibility:</b> {clinic.eligibility}
                                            </p>
                                        ) : null}

                                        {clinic.lastVerifiedAt ? (
                                            <p className="clinic-verified">
                                                <b>Last verified:</b> {clinic.lastVerifiedAt}
                                            </p>
                                        ) : null}

                                        <h3 className="section-title">Contact</h3>
                                        <ul className="contact-list">
                                            {clinic.contact?.email ? <li>Email: {clinic.contact.email}</li> : null}
                                            {clinic.contact?.phone ? <li>Phone: {clinic.contact.phone}</li> : null}
                                            {clinic.contact?.website ? (
                                                <li>
                                                    Website:{" "}
                                                    <a href={clinic.contact.website} target="_blank" rel="noreferrer">
                                                        {clinic.contact.website}
                                                    </a>
                                                </li>
                                            ) : null}
                                        </ul>

                                        {mailto ? (
                                            <p className="mailto">
                                                <a href={mailto}>Draft referral email</a>
                                            </p>
                                        ) : null}

                                        <h3 className="section-title">How to Refer</h3>
                                        <ul className="referral-list">
                                            {(clinic.referral?.howToRefer ?? []).map((step, i) => (
                                                <li key={i} className="referral-step">
                                                    {step}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : null}
                            </section>
                        );
                    })}
            </div>
        </main>
    );
}
