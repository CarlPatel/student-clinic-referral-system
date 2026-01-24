import type { Clinic, Specialty } from "@/lib/types";

export interface DataSource {
  getSpecialties(): Promise<Specialty[]>;
  getClinics(): Promise<Clinic[]>;
  getClinicById(id: string): Promise<Clinic | null>;
  getClinicsBySpecialty(specialtyId: string): Promise<Clinic[]>;
}