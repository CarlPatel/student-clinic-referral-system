import type { Clinic, Specialty } from "@/lib/types";

import specialties from "../../../data/specialties.json";
import clinics from "../../../data/clinics.json";

type UnifiedClinic = {
  clinic_id: string;
  clinic_key: string;
  name: string;
  affiliation?: string;
  location_label?: string | null;
  phone?: string;
  website?: string | null;
  directory_address?: string | null;
  directory_city?: string | null;
  directory_state?: string | null;
  directory_zip?: string | null;
  directory_map_url?: string | null;
  directory_email?: string | null;
  directory_phone?: string | null;
  directory_website?: string | null;
  hours?: string;
  eligibility?: string;
  accepting_referrals?: boolean | null;
  referral_notes?: string | null;
  last_verified_at?: string | null;
};

type UnifiedSpecialty = {
  specialty_id: string;
  display_name: string;
  description?: string;
};

type FlatClinicSpecialty = {
  clinic_id: string;
  specialty_id: string;
};

type FlatClinicReferralMethod = {
  clinic_id: string;
  method: string;
};

type FlatClinicsData = {
  clinics: UnifiedClinic[];
  clinic_specialties: FlatClinicSpecialty[];
  clinic_referral_methods: FlatClinicReferralMethod[];
};

type FlatSpecialtiesData = {
  specialties: UnifiedSpecialty[];
};

const clinicsData = clinics as FlatClinicsData;
const specialtiesData = specialties as FlatSpecialtiesData;

const specialtyIdsByClinicId = new Map<string, string[]>();
for (const row of clinicsData.clinic_specialties) {
  const list = specialtyIdsByClinicId.get(row.clinic_id) ?? [];
  list.push(row.specialty_id);
  specialtyIdsByClinicId.set(row.clinic_id, list);
}

const referralMethodsByClinicId = new Map<string, string[]>();
for (const row of clinicsData.clinic_referral_methods) {
  const list = referralMethodsByClinicId.get(row.clinic_id) ?? [];
  list.push(row.method);
  referralMethodsByClinicId.set(row.clinic_id, list);
}

const typedClinics = clinicsData.clinics.map((clinic) => ({
  id: clinic.clinic_id,
  name: clinic.name,
  affiliation: clinic.affiliation,
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
    phone: clinic.directory_phone ?? clinic.phone,
    website: clinic.directory_website ?? clinic.website ?? undefined
  },
  hours: clinic.hours,
  eligibility: clinic.eligibility,
  referral: {
    acceptingReferrals: clinic.accepting_referrals ?? undefined,
    howToRefer: referralMethodsByClinicId.get(clinic.clinic_id) ?? [],
    notes: clinic.referral_notes ?? undefined
  },
  lastVerifiedAt: clinic.last_verified_at ?? undefined
})) as Clinic[];

const typedSpecialties = specialtiesData.specialties.map((specialty) => ({
  id: specialty.specialty_id,
  name: specialty.display_name,
  description: specialty.description
})) as Specialty[];

export async function getSpecialties(): Promise<Specialty[]> {
  return typedSpecialties;
}

export async function getClinics(): Promise<Clinic[]> {
  return typedClinics;
}

export async function getClinicById(id: string): Promise<Clinic | null> {
  return typedClinics.find(c => c.id === id) ?? null;
}

export async function getClinicsBySpecialty(specialtyId: string): Promise<Clinic[]> {
  return typedClinics.filter(c => c.specialtyIds.includes(specialtyId));
}