# Database Setup for Vercel Neon PostgreSQL

This directory contains the canonical PostgreSQL schema for the Student Clinic Referral System.

## Current Status

The schema has been reset to the generalized service model. Data import has not been rebuilt yet, so `database/import.js` intentionally exits without importing data.

## Tables

The canonical schema contains exactly these application tables:

- `clinics` - clinic directory, contact details, operational details, tags, and referral methods
- `services` - generalized service categories
- `clinic_services` - which clinics provide which services
- `clinic_documents` - clinic-wide documents required for an entire clinic
- `clinic_service_documents` - documents required for a clinic-service relationship
- `users` - login and role-based access records
- `referrals` - referral tracker records linked by foreign keys

## Setup

Create a fresh database schema from:

```bash
psql "$DATABASE_URL" -f database/schema.sql
```

Or paste `database/schema.sql` into the Neon SQL editor.

## Important

Do not run `database/import.js` for this schema yet. Seed/import logic should be rebuilt in a separate data migration step.

## Relationships

```text
clinics
  ├─ clinic_documents
  ├─ clinic_services ── services
  │      └─ clinic_service_documents
  ├─ users via users.clinic_key -> clinics.clinic_key
  └─ referrals via referrals.referring_clinic_id and referrals.receiving_clinic_id

referrals
  └─ clinic_services via referrals.clinic_service_id
```

## Example Queries

See `database/example-queries.sql` for queries that match the canonical service schema.
