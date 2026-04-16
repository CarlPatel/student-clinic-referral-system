import type { Clinic, Service } from "@/lib/types";
import { Pool } from "pg";

type DbClinicRow = {
  clinic_id: string;
  clinic_key: string;
  name: string;
  location_label: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  map_url: string | null;
  phone: string | null;
  contact_person: string | null;
  email: string | null;
  founded: Date | string | null;
  website: string | null;
  hours: string | null;
  accepting_referrals: boolean | null;
  referral_notes: string | null;
  last_verified_at: Date | string | null;
  tags: string[] | null;
  referral_methods: string[] | null;
};

type DbServiceRow = {
  service_id: string;
  display_name: string;
  description: string | null;
  icon: string | null;
  service_type: string | null;
};

type DbClinicServiceRow = {
  clinic_service_id: string;
  clinic_id: string;
  service_id: string;
  notes: string | null;
  accepting_referrals: boolean | null;
  status: string | null;
  last_verified_at: Date | string | null;
};

type DbClinicServiceDocumentRow = {
  clinic_service_id: string;
  doc_name: string;
  doc_type: "form" | "auth" | "insurance";
  doc_description: string | null;
};

const globalForPool = globalThis as unknown as { __clinicPool?: Pool };

export function getPool(): Pool {
  if (globalForPool.__clinicPool) return globalForPool.__clinicPool;

  let connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL (or POSTGRES_URL) is required to read clinic data from PostgreSQL.");
  }

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

function formatDbDate(value: Date | string | null): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().split("T")[0];
  return value;
}

function toTimeString(value: string): string {
  return value.length >= 5 ? value.slice(0, 5) : value;
}

export async function getServices(): Promise<Service[]> {
  const rows = await query<DbServiceRow>(
    `
      SELECT service_id, display_name, description, icon, service_type
      FROM services
      ORDER BY display_name ASC
    `
  );

  return rows.map((service) => ({
    id: service.service_id,
    name: service.display_name,
    description: service.description ?? undefined,
    icon: service.icon ?? undefined,
    serviceType: service.service_type ?? undefined
  }));
}

export async function getClinics(): Promise<Clinic[]> {
  const [clinicRows, clinicServiceRows] = await Promise.all([
    query<DbClinicRow>(
      `
        SELECT
          clinic_id,
          clinic_key,
          name,
          location_label,
          address,
          city,
          state,
          zip,
          map_url,
          phone,
          contact_person,
          email,
          founded,
          website,
          hours,
          accepting_referrals,
          referral_notes,
          last_verified_at,
          tags,
          referral_methods
        FROM clinics
        ORDER BY name ASC
      `
    ),
    query<Pick<DbClinicServiceRow, "clinic_id" | "service_id">>(
      `
        SELECT clinic_id, service_id
        FROM clinic_services
      `
    )
  ]);

  const serviceIdsByClinicId = new Map<string, string[]>();
  for (const row of clinicServiceRows) {
    const list = serviceIdsByClinicId.get(row.clinic_id) ?? [];
    list.push(row.service_id);
    serviceIdsByClinicId.set(row.clinic_id, list);
  }

  return clinicRows.map((clinic) => ({
    id: clinic.clinic_id,
    name: clinic.name,
    serviceIds: serviceIdsByClinicId.get(clinic.clinic_id) ?? [],
    tags: clinic.tags ?? [],
    location: {
      address: clinic.address ?? clinic.location_label ?? undefined,
      city: clinic.city ?? undefined,
      state: clinic.state ?? undefined,
      zip: clinic.zip ?? undefined,
      mapUrl: clinic.map_url ?? undefined
    },
    contact: {
      email: clinic.email ?? undefined,
      phone: clinic.phone ?? undefined,
      website: clinic.website ?? undefined
    },
    hours: clinic.hours ?? undefined,
    referral: {
      acceptingReferrals: clinic.accepting_referrals ?? undefined,
      howToRefer: clinic.referral_methods ?? [],
      notes: clinic.referral_notes ?? undefined
    },
    lastVerifiedAt: formatDbDate(clinic.last_verified_at)
  }));
}

export async function getClinicById(id: string): Promise<Clinic | null> {
  const clinics = await getClinics();
  return clinics.find((clinic) => clinic.id === id) ?? null;
}

export async function getClinicsByService(serviceId: string): Promise<Clinic[]> {
  const clinics = await getClinics();
  return clinics.filter((clinic) => clinic.serviceIds.includes(serviceId));
}

export async function getAppData(): Promise<{
  clinics: Record<string, {
    id: string;
    name: string;
    location: string;
    phone: string;
    contact: string;
    founded: string;
    tags: string[];
    website: string | null;
  }>;
  servicesData: Record<string, {
    id: string;
    icon: string;
    serviceType: string;
    clinics: Array<{
      id: string;
      serviceId: string;
      clinicId: string;
      clinicKey: string;
      status: string;
      notes: string;
      acceptingReferrals: boolean;
      docs: Array<{
        name: string;
        type: "form" | "auth" | "insurance";
        desc: string;
      }>;
    }>;
  }>;
}> {
  const [clinicRows, serviceRows, clinicServiceRows, documentRows] = await Promise.all([
    query<DbClinicRow>(
      `
        SELECT
          clinic_id,
          clinic_key,
          name,
          location_label,
          address,
          city,
          state,
          zip,
          map_url,
          phone,
          contact_person,
          email,
          founded,
          website,
          hours,
          accepting_referrals,
          referral_notes,
          last_verified_at,
          tags,
          referral_methods
        FROM clinics
      `
    ),
    query<DbServiceRow>(
      `
        SELECT service_id, display_name, icon, service_type, description
        FROM services
      `
    ),
    query<DbClinicServiceRow>(
      `
        SELECT clinic_service_id, clinic_id, service_id, notes, accepting_referrals, status, last_verified_at
        FROM clinic_services
      `
    ),
    query<DbClinicServiceDocumentRow>(
      `
        SELECT clinic_service_id, doc_name, doc_type, doc_description
        FROM clinic_service_documents
      `
    )
  ]);

  const clinicIdToKey = new Map<string, string>();
  for (const row of clinicRows) {
    clinicIdToKey.set(row.clinic_id, row.clinic_key);
  }

  const clinics = Object.fromEntries(
    clinicRows.map((row) => [
      row.clinic_key,
      {
        id: row.clinic_id,
        name: row.name,
        location: row.location_label ?? row.address ?? "Location not listed",
        phone: row.phone ?? "-",
        contact: row.contact_person ?? "",
        founded: formatDbDate(row.founded) ?? "",
        tags: row.tags ?? [],
        website: row.website ?? null
      }
    ])
  );

  const docsByClinicServiceId = new Map<string, Array<{ name: string; type: "form" | "auth" | "insurance"; desc: string }>>();
  for (const row of documentRows) {
    const list = docsByClinicServiceId.get(row.clinic_service_id) ?? [];
    list.push({
      name: row.doc_name,
      type: row.doc_type,
      desc: row.doc_description ?? ""
    });
    docsByClinicServiceId.set(row.clinic_service_id, list);
  }

  const clinicServicesByServiceId = new Map<string, DbClinicServiceRow[]>();
  for (const row of clinicServiceRows) {
    const list = clinicServicesByServiceId.get(row.service_id) ?? [];
    list.push(row);
    clinicServicesByServiceId.set(row.service_id, list);
  }

  const servicesData = Object.fromEntries(
    serviceRows.map((service) => {
      const clinicEntries = (clinicServicesByServiceId.get(service.service_id) ?? [])
        .map((row) => {
          const clinicKey = clinicIdToKey.get(row.clinic_id);
          if (!clinicKey) return null;

          return {
            id: row.clinic_service_id,
            serviceId: row.service_id,
            clinicId: row.clinic_id,
            clinicKey,
            status: row.status ?? "active",
            notes: row.notes ?? "",
            acceptingReferrals: row.accepting_referrals ?? true,
            docs: docsByClinicServiceId.get(row.clinic_service_id) ?? []
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      return [
        service.display_name,
        {
          id: service.service_id,
          icon: service.icon ?? "🏥",
          serviceType: service.service_type ?? "service",
          clinics: clinicEntries
        }
      ];
    })
  );

  return { clinics, servicesData };
}

// ============================================================================
// REFERRAL FUNCTIONS
// ============================================================================

export type Referral = {
  id: number;
  referringClinicId: string;
  receivingClinicId: string;
  clinicServiceId: string;
  referringClinic: string;
  receivingClinic: string;
  service: string;
  date: string;
  time: string;
  status: "sent" | "received" | "scheduled" | "completed";
  preceptor: string;
  notes: string;
  submittedAt: string;
};

type DbReferralRow = {
  id: bigint;
  referring_clinic_id: string;
  receiving_clinic_id: string;
  clinic_service_id: string;
  referring_clinic_name: string;
  receiving_clinic_name: string;
  service_name: string;
  referral_date: Date | string;
  referral_time: string;
  status: Referral["status"];
  preceptor: string;
  notes: string | null;
  submitted_at: Date | string;
};

export async function saveReferral(referral: Referral): Promise<void> {
  const pool = getPool();
  await pool.query(
    `
      INSERT INTO referrals (
        id,
        referring_clinic_id,
        receiving_clinic_id,
        clinic_service_id,
        referral_date,
        referral_time,
        status,
        preceptor,
        notes,
        submitted_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        referring_clinic_id = EXCLUDED.referring_clinic_id,
        receiving_clinic_id = EXCLUDED.receiving_clinic_id,
        clinic_service_id = EXCLUDED.clinic_service_id,
        referral_date = EXCLUDED.referral_date,
        referral_time = EXCLUDED.referral_time,
        status = EXCLUDED.status,
        preceptor = EXCLUDED.preceptor,
        notes = EXCLUDED.notes,
        submitted_at = EXCLUDED.submitted_at,
        updated_at = CURRENT_TIMESTAMP
    `,
    [
      referral.id,
      referral.referringClinicId,
      referral.receivingClinicId,
      referral.clinicServiceId,
      referral.date,
      referral.time,
      referral.status,
      referral.preceptor,
      referral.notes || null,
      referral.submittedAt
    ]
  );
}

export async function getReferrals(): Promise<Referral[]> {
  const rows = await query<DbReferralRow>(
    `
      SELECT
        r.id,
        r.referring_clinic_id,
        r.receiving_clinic_id,
        r.clinic_service_id,
        referring.name AS referring_clinic_name,
        receiving.name AS receiving_clinic_name,
        s.display_name AS service_name,
        r.referral_date,
        r.referral_time,
        r.status,
        r.preceptor,
        r.notes,
        r.submitted_at
      FROM referrals r
      JOIN clinics referring ON referring.clinic_id = r.referring_clinic_id
      JOIN clinics receiving ON receiving.clinic_id = r.receiving_clinic_id
      JOIN clinic_services cs ON cs.clinic_service_id = r.clinic_service_id
      JOIN services s ON s.service_id = cs.service_id
      ORDER BY r.submitted_at DESC
    `
  );

  return rows.map((row) => ({
    id: Number(row.id),
    referringClinicId: row.referring_clinic_id,
    receivingClinicId: row.receiving_clinic_id,
    clinicServiceId: row.clinic_service_id,
    referringClinic: row.referring_clinic_name,
    receivingClinic: row.receiving_clinic_name,
    service: row.service_name,
    date: row.referral_date instanceof Date ? row.referral_date.toISOString().split("T")[0] : row.referral_date,
    time: toTimeString(row.referral_time),
    status: row.status,
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
  const pool = getPool();
  await pool.query("UPDATE referrals SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1", [id, status]);
}
