import type { Clinic, Service } from "@/lib/types";

const localJsonDisabledMessage =
  "The local JSON data source has not been rebuilt for the canonical service schema. Use the PostgreSQL data source.";

export async function getServices(): Promise<Service[]> {
  throw new Error(localJsonDisabledMessage);
}

export async function getClinics(): Promise<Clinic[]> {
  throw new Error(localJsonDisabledMessage);
}

export async function getClinicById(_id: string): Promise<Clinic | null> {
  void _id;
  throw new Error(localJsonDisabledMessage);
}

export async function getClinicsByService(_serviceId: string): Promise<Clinic[]> {
  void _serviceId;
  throw new Error(localJsonDisabledMessage);
}
