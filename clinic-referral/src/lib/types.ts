export type Service = {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  serviceType?: string;
};

export type ClinicServiceDocument = {
  name: string;
  type: "form" | "auth" | "insurance";
  desc: string | null;
  url: string;
  googleDriveFileId: string | null;
  sortOrder: number;
};

export type UserRole = "clinic_member" | "clinic_admin" | "master_admin";

export type AppUser = {
  id: string;
  username: string;
  role: UserRole;
  clinicKey: string | null;
};

export type Clinic = {
  id: string;
  name: string;
  serviceIds: string[];
  tags: string[];

  location?: {
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    mapUrl?: string;
  };

  contact?: {
    email?: string;
    phone?: string;
    website?: string;
  };

  hours?: string;

  referral?: {
    acceptingReferrals?: boolean;
    howToRefer?: string[];
    notes?: string;
  };

  lastVerifiedAt?: string;
};
