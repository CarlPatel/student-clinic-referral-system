import type { Clinic, Specialty } from "@/lib/types";
import { Pool } from "pg";

type DbClinicRow = {
  clinic_id: string;
  name: string;
  affiliation: string | null;
  location_label: string | null;
  phone: string | null;
  website: string | null;
  directory_address: string | null;
  directory_city: string | null;
  directory_state: string | null;
  directory_zip: string | null;
  directory_map_url: string | null;
  directory_email: string | null;
  directory_phone: string | null;
  directory_website: string | null;
  hours: string | null;
  eligibility: string | null;
  accepting_referrals: boolean | null;
  referral_notes: string | null;
  last_verified_at: string | null;
};

type DbSpecialtyRow = {
  specialty_id: string;
  display_name: string;
  description: string | null;
};

type DbClinicSpecialtyRow = {
  clinic_id: string;
  specialty_id: string;
};

type DbClinicReferralRow = {
  clinic_id: string;
  method: string;
};

type AppClinicRow = {
  clinic_id: string;
  clinic_key: string;
  name: string;
  location_label: string | null;
  phone: string | null;
  contact_person: string | null;
  founded: string | null;
  population: string | null;
  website: string | null;
  directory_address: string | null;
  directory_website: string | null;
};

type AppClinicTagRow = {
  clinic_id: string;
  tag: string;
};

type AppSpecialtyRow = {
  specialty_id: string;
  display_name: string;
  icon: string | null;
};

type AppSpecialtyClinicRow = {
  specialty_clinic_id: string;
  specialty_id: string;
  clinic_id: string;
  frequency: string | null;
};

type AppSpecialtyDocumentRow = {
  specialty_clinic_id: string;
  doc_name: string;
  doc_type: "form" | "auth" | "insurance";
  doc_description: string | null;
};

const globalForPool = globalThis as unknown as { __clinicPool?: Pool; __referralStatusReady?: boolean };

export function getPool(): Pool {
  if (globalForPool.__clinicPool) return globalForPool.__clinicPool;

  let connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL (or POSTGRES_URL) is required to read clinic data from PostgreSQL.");
  }

  // Add uselibpqcompat flag to suppress SSL deprecation warning
  if (connectionString.includes("sslmode=require") && !connectionString.includes("uselibpqcompat")) {
    connectionString += "&uselibpqcompat=true";
  }

  const useSsl = !connectionString.includes("localhost");
  globalForPool.__clinicPool = new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined
  });

  return globalForPool.__clinicPool;
}

async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

export async function getSpecialties(): Promise<Specialty[]> {
  const rows = await query<DbSpecialtyRow>(
    `
      SELECT specialty_id, display_name, description
      FROM specialties
      ORDER BY display_name ASC
    `
  );

  return rows.map((specialty) => ({
    id: specialty.specialty_id,
    name: specialty.display_name,
    description: specialty.description ?? undefined
  }));
}

export async function getClinics(): Promise<Clinic[]> {
  const [clinicRows, clinicSpecialtyRows, clinicReferralRows] = await Promise.all([
    query<DbClinicRow>(
      `
        SELECT
          clinic_id,
          name,
          affiliation,
          location_label,
          phone,
          website,
          directory_address,
          directory_city,
          directory_state,
          directory_zip,
          directory_map_url,
          directory_email,
          directory_phone,
          directory_website,
          hours,
          eligibility,
          accepting_referrals,
          referral_notes,
          last_verified_at
        FROM clinics
        ORDER BY name ASC
      `
    ),
    query<DbClinicSpecialtyRow>(
      `
        SELECT clinic_id, specialty_id
        FROM clinic_specialties
      `
    ),
    query<DbClinicReferralRow>(
      `
        SELECT clinic_id, method
        FROM clinic_referral_methods
      `
    )
  ]);

  const specialtyIdsByClinicId = new Map<string, string[]>();
  for (const row of clinicSpecialtyRows) {
    const list = specialtyIdsByClinicId.get(row.clinic_id) ?? [];
    list.push(row.specialty_id);
    specialtyIdsByClinicId.set(row.clinic_id, list);
  }

  const referralMethodsByClinicId = new Map<string, string[]>();
  for (const row of clinicReferralRows) {
    const list = referralMethodsByClinicId.get(row.clinic_id) ?? [];
    list.push(row.method);
    referralMethodsByClinicId.set(row.clinic_id, list);
  }

  return clinicRows.map((clinic) => ({
    id: clinic.clinic_id,
    name: clinic.name,
    affiliation: clinic.affiliation ?? undefined,
    specialtyIds: specialtyIdsByClinicId.get(clinic.clinic_id) ?? [],
    location: {
      address: clinic.directory_address ?? clinic.location_label ?? undefined,
      city: clinic.directory_city ?? undefined,
      state: clinic.directory_state ?? undefined,
      zip: clinic.directory_zip ?? undefined,
      mapUrl: clinic.directory_map_url ?? undefined
    },
    contact: {
      email: clinic.directory_email ?? undefined,
      phone: clinic.directory_phone ?? clinic.phone ?? undefined,
      website: clinic.directory_website ?? clinic.website ?? undefined
    },
    hours: clinic.hours ?? undefined,
    eligibility: clinic.eligibility ?? undefined,
    referral: {
      acceptingReferrals: clinic.accepting_referrals ?? undefined,
      howToRefer: referralMethodsByClinicId.get(clinic.clinic_id) ?? [],
      notes: clinic.referral_notes ?? undefined
    },
    lastVerifiedAt: clinic.last_verified_at ?? undefined
  }));
}

export async function getClinicById(id: string): Promise<Clinic | null> {
  const clinics = await getClinics();
  return clinics.find((clinic) => clinic.id === id) ?? null;
}

export async function getClinicsBySpecialty(specialtyId: string): Promise<Clinic[]> {
  const clinics = await getClinics();
  return clinics.filter((clinic) => clinic.specialtyIds.includes(specialtyId));
}

export async function getAppData(): Promise<{
  clinics: Record<string, {
    name: string;
    location: string;
    phone: string;
    contact: string;
    founded: string;
    population: string;
    tags: string[];
    website: string | null;
  }>;
  specialtiesData: Record<string, {
    icon: string;
    clinics: Array<{
      id: string;
      clinicKey: string;
      freq: string;
      docs: Array<{
        name: string;
        type: "form" | "auth" | "insurance";
        desc: string;
      }>;
    }>;
  }>;
}> {
  const [clinicRows, clinicTagRows, specialtyRows, specialtyClinicRows, specialtyDocumentRows] = await Promise.all([
    query<AppClinicRow>(
      `
        SELECT clinic_id, clinic_key, name, location_label, phone, contact_person, founded, population, website, directory_address, directory_website
        FROM clinics
      `
    ),
    query<AppClinicTagRow>(
      `
        SELECT clinic_id, tag
        FROM clinic_tags
      `
    ),
    query<AppSpecialtyRow>(
      `
        SELECT specialty_id, display_name, icon
        FROM specialties
      `
    ),
    query<AppSpecialtyClinicRow>(
      `
        SELECT specialty_clinic_id, specialty_id, clinic_id, frequency
        FROM specialty_clinics
      `
    ),
    query<AppSpecialtyDocumentRow>(
      `
        SELECT specialty_clinic_id, doc_name, doc_type, doc_description
        FROM specialty_documents
      `
    )
  ]);

  const clinicTagsById = new Map<string, string[]>();
  for (const row of clinicTagRows) {
    const list = clinicTagsById.get(row.clinic_id) ?? [];
    list.push(row.tag);
    clinicTagsById.set(row.clinic_id, list);
  }

  const clinicIdToKey = new Map<string, string>();
  for (const row of clinicRows) {
    clinicIdToKey.set(row.clinic_id, row.clinic_key);
  }

  const clinics = Object.fromEntries(
    clinicRows.map((row) => [
      row.clinic_key,
      {
        name: row.name,
        location: row.location_label ?? row.directory_address ?? "Location not listed",
        phone: row.phone ?? "—",
        contact: row.contact_person ?? "",
        founded: row.founded ?? "",
        population: row.population ?? "",
        tags: clinicTagsById.get(row.clinic_id) ?? [],
        website: row.website ?? row.directory_website ?? null
      }
    ])
  );

  const specialtyDocsByEntryId = new Map<string, Array<{ name: string; type: "form" | "auth" | "insurance"; desc: string }>>();
  for (const row of specialtyDocumentRows) {
    const list = specialtyDocsByEntryId.get(row.specialty_clinic_id) ?? [];
    list.push({
      name: row.doc_name,
      type: row.doc_type,
      desc: row.doc_description ?? ""
    });
    specialtyDocsByEntryId.set(row.specialty_clinic_id, list);
  }

  const specialtyClinicsById = new Map<string, AppSpecialtyClinicRow[]>();
  for (const row of specialtyClinicRows) {
    const list = specialtyClinicsById.get(row.specialty_id) ?? [];
    list.push(row);
    specialtyClinicsById.set(row.specialty_id, list);
  }

  const specialtiesData = Object.fromEntries(
    specialtyRows.map((specialty) => {
      const clinicEntries = (specialtyClinicsById.get(specialty.specialty_id) ?? [])
        .map((row) => {
          const clinicKey = clinicIdToKey.get(row.clinic_id);
          if (!clinicKey) return null;

          return {
            id: row.specialty_clinic_id,
            clinicKey,
            freq: row.frequency ?? "",
            docs: specialtyDocsByEntryId.get(row.specialty_clinic_id) ?? []
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      return [
        specialty.display_name,
        {
          icon: specialty.icon ?? "🏥",
          clinics: clinicEntries
        }
      ];
    })
  );

  return { clinics, specialtiesData };
}

// ============================================================================
// REFERRAL FUNCTIONS
// ============================================================================

export type Referral = {
  id: number;
  referringClinic: string;
  receivingClinic: string;
  date: string;
  time: string;
  specialty: string;
  status: "sent" | "received" | "scheduled" | "completed";
  preceptor: string;
  notes: string;
  submittedAt: string;
};

type DbReferralRow = {
  id: bigint;
  referring_clinic: string;
  receiving_clinic: string;
  date: Date | string;
  time: string;
  specialty: string;
  status: Referral["status"] | null;
  preceptor: string;
  notes: string | null;
  submitted_at: Date | string;
};

async function ensureReferralStatusColumn(): Promise<void> {
  if (globalForPool.__referralStatusReady) {
    return;
  }

  const pool = getPool();
  await pool.query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS status VARCHAR(20)`);
  await pool.query(`UPDATE referrals SET status = 'sent' WHERE status IS NULL`);
  await pool.query(`ALTER TABLE referrals ALTER COLUMN status SET DEFAULT 'sent'`);
  await pool.query(`ALTER TABLE referrals ALTER COLUMN status SET NOT NULL`);
  await pool.query(
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'referrals_status_check'
        ) THEN
          ALTER TABLE referrals
          ADD CONSTRAINT referrals_status_check
          CHECK (status IN ('sent', 'received', 'scheduled', 'completed'));
        END IF;
      END $$;
    `
  );
  globalForPool.__referralStatusReady = true;
}

export async function saveReferral(referral: Referral): Promise<void> {
  await ensureReferralStatusColumn();
  const pool = getPool();
  await pool.query(
    `
      INSERT INTO referrals (id, referring_clinic, receiving_clinic, date, time, specialty, status, preceptor, notes, submitted_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        referring_clinic = EXCLUDED.referring_clinic,
        receiving_clinic = EXCLUDED.receiving_clinic,
        date = EXCLUDED.date,
        time = EXCLUDED.time,
        specialty = EXCLUDED.specialty,
        status = EXCLUDED.status,
        preceptor = EXCLUDED.preceptor,
        notes = EXCLUDED.notes,
        submitted_at = EXCLUDED.submitted_at
    `,
    [
      referral.id,
      referral.referringClinic,
      referral.receivingClinic,
      referral.date,
      referral.time,
      referral.specialty,
      referral.status,
      referral.preceptor,
      referral.notes || null,
      referral.submittedAt
    ]
  );
}

export async function getReferrals(): Promise<Referral[]> {
  await ensureReferralStatusColumn();
  const rows = await query<DbReferralRow>(
    `
      SELECT id, referring_clinic, receiving_clinic, date, time, specialty, status, preceptor, notes, submitted_at
      FROM referrals
      ORDER BY submitted_at DESC
    `
  );

  return rows.map((row) => ({
    id: Number(row.id),
    referringClinic: row.referring_clinic,
    receivingClinic: row.receiving_clinic,
    date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date,
    time: row.time,
    specialty: row.specialty,
    status: row.status ?? "sent",
    preceptor: row.preceptor,
    notes: row.notes || "",
    submittedAt: row.submitted_at instanceof Date ? row.submitted_at.toISOString() : row.submitted_at
  }));
}

export async function deleteReferral(id: number): Promise<void> {
  const pool = getPool();
  await pool.query("DELETE FROM referrals WHERE id = $1", [id]);
}

export async function updateReferralStatus(id: number, status: Referral["status"]): Promise<void> {
  await ensureReferralStatusColumn();
  const pool = getPool();
  await pool.query("UPDATE referrals SET status = $2 WHERE id = $1", [id, status]);
}
