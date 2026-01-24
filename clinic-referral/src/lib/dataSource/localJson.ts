import type { Clinic, Specialty } from "@/lib/types";

import specialties from "../../../data/specialties.json";
import clinics from "../../../data/clinics.json";

const typedSpecialties = specialties as Specialty[];
const typedClinics = clinics as Clinic[];

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