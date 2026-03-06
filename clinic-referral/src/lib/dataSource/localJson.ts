import type { Clinic, Specialty } from "@/lib/types";

import specialties from "../../../data/specialties.json";
import clinics from "../../../data/clinics.json";

type UnifiedClinic = {
  id: string;
  name: string;
  affiliation?: string;
  specialtyIds?: string[];
  location?: string;
  phone?: string;
  website?: string | null;
  directoryLocation?: {
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    mapUrl?: string;
  };
  directoryContact?: {
    email?: string;
    phone?: string;
    website?: string;
  };
  hours?: string;
  eligibility?: string;
  referral?: {
    acceptingReferrals?: boolean;
    howToRefer?: string[];
    notes?: string;
  };
  lastVerifiedAt?: string;
};

type UnifiedSpecialty = {
  id: string;
  name: string;
  description?: string;
};

const typedClinics = Object.values(clinics as Record<string, UnifiedClinic>).map((clinic) => ({
  id: clinic.id,
  name: clinic.name,
  affiliation: clinic.affiliation,
  specialtyIds: clinic.specialtyIds ?? [],
  location: clinic.directoryLocation ?? {
    address: clinic.location
  },
  contact: {
    email: clinic.directoryContact?.email,
    phone: clinic.directoryContact?.phone ?? clinic.phone,
    website: clinic.directoryContact?.website ?? clinic.website ?? undefined
  },
  hours: clinic.hours,
  eligibility: clinic.eligibility,
  referral: clinic.referral,
  lastVerifiedAt: clinic.lastVerifiedAt
})) as Clinic[];

const typedSpecialties = Object.values(
  specialties as Record<string, UnifiedSpecialty>
).map((specialty) => ({
  id: specialty.id,
  name: specialty.name,
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