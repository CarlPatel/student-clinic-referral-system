import type { Clinic, Service } from "@/lib/types";

export interface DataSource {
  getServices(): Promise<Service[]>;
  getClinics(): Promise<Clinic[]>;
  getClinicById(id: string): Promise<Clinic | null>;
  getClinicsByService(serviceId: string): Promise<Clinic[]>;
}
