export type Specialty = {
  id: string;
  name: string;
  description?: string;
};

export type UserRole = "clinic_member" | "clinic_admin" | "master_admin";

export type AppUser = {
  id: string;
  username: string;
  role: UserRole;
  clinicKey: string;
};

export type Clinic = {
  id: string;
  name: string;
  affiliation?: string;
  specialtyIds: string[];

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
  eligibility?: string;

  referral?: {
    acceptingReferrals?: boolean;
    howToRefer?: string[];
    notes?: string;
  };

  lastVerifiedAt?: string;
};
