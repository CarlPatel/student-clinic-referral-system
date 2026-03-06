# Database Setup for Vercel Neon PostgreSQL

This directory contains SQL schema and import scripts for the Student Clinic Referral System database.

## Prerequisites

- Vercel/Neon PostgreSQL database
- Node.js installed
- Database connection string from Vercel

## Getting Your Database Connection String

1. Go to your Vercel project dashboard
2. Navigate to **Storage** tab
3. Find your Neon PostgreSQL database
4. Copy the connection string (it should look like):
   ```
   postgres://username:password@ep-xxx-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

## Setup Instructions

### Option 1: Using Vercel/Neon Dashboard (Recommended)

1. **Create the schema:**
   - Open your Neon database dashboard
   - Go to the SQL Editor
   - Copy and paste the contents of `schema.sql`
   - Click **Run** to execute

2. **Import the data:**
   ```bash
   # Install pg dependency
   npm install pg
   
   # Set your database connection string and run import
   DATABASE_URL="your-connection-string-here" node database/import.js
   ```

### Option 2: Using psql CLI

If you have `psql` installed:

```bash
# Create schema
psql "$DATABASE_URL" -f database/schema.sql

# Import data
npm install pg
DATABASE_URL="your-connection-string-here" node database/import.js
```

### Option 3: Environment Variable

Add to your `.env.local`:
```
DATABASE_URL="postgres://username:password@host/db?sslmode=require"
```

Then run:
```bash
npm install pg
node database/import.js
```

## Database Schema Overview

The database consists of 7 tables:

### Core Tables
- **`clinics`** - Main clinic information (name, location, contact, etc.)
- **`specialties`** - Medical specialties (Cardiology, Dermatology, etc.)

### Relationship Tables
- **`clinic_tags`** - Tags/features for each clinic (e.g., "In-house labs")
- **`clinic_referral_methods`** - How to refer patients to each clinic
- **`clinic_specialties`** - Junction table: which clinics offer which specialties
- **`specialty_clinics`** - Specialty-clinic pairings with frequency info
- **`specialty_documents`** - Required documents for each specialty-clinic combo

### Helpful Views (Created Automatically)
- **`v_clinics_with_tags`** - Clinics with aggregated tags array
- **`v_specialties_with_counts`** - Specialties with clinic counts
- **`v_specialty_clinics_full`** - Complete specialty-clinic info with document counts

## Verifying the Import

After running the import script, you should see output like:

```
📊 Final counts:
   Clinics: 13
   Specialties: 14
   Clinic Tags: 90
   Referral Methods: 13
   Clinic-Specialty Links: 140
   Specialty-Clinic Pairings: 81
   Documents: 600+
```

You can also verify in the Neon dashboard:
```sql
-- Check clinic count
SELECT COUNT(*) FROM clinics;

-- Check specialties
SELECT display_name, icon FROM specialties ORDER BY display_name;

-- Check documents for a specific specialty-clinic
SELECT 
    s.display_name,
    c.name,
    sd.doc_name,
    sd.doc_type
FROM specialty_documents sd
JOIN specialty_clinics sc ON sd.specialty_clinic_id = sc.specialty_clinic_id
JOIN specialties s ON sc.specialty_id = s.specialty_id
JOIN clinics c ON sc.clinic_id = c.clinic_id
WHERE s.display_name = 'Cardiology'
LIMIT 10;
```

## Connecting from Your Next.js App

Install the Vercel Postgres package:
```bash
npm install @vercel/postgres
```

Example usage:
```typescript
import { sql } from '@vercel/postgres';

export async function getClinics() {
  const { rows } = await sql`
    SELECT * FROM v_clinics_with_tags
    WHERE accepting_referrals = true
    ORDER BY name
  `;
  return rows;
}
```

## Troubleshooting

### SSL Connection Error
Make sure your connection string includes `?sslmode=require` at the end.

### Permission Denied
Ensure your database user has CREATE and INSERT permissions.

### Connection Timeout
Check that your IP is allowlisted in Neon's connection settings (or use Vercel's environment variables which are pre-configured).

### Import Already Ran
The import script clears existing data before inserting. It's safe to run multiple times.

## Next Steps

After setting up the database:

1. Update your Next.js app to query PostgreSQL instead of JSON files
2. Replace `src/lib/dataSource/localJson.ts` with a PostgreSQL version
3. Add environment variable to your Vercel deployment
4. Test locally with `.env.local` first
5. Deploy to Vercel

## Maintenance

To update data:
1. Modify the JSON files in `data/`
2. Re-run the import script
3. Or manually update via SQL in the Neon dashboard

## Schema Diagram

```
┌─────────────┐
│  clinics    │──┬──> clinic_tags
│             │  ├──> clinic_referral_methods  
│             │  └──> clinic_specialties ───┐
└─────────────┘                             │
                                            ├──> specialty_clinics ──> specialty_documents
┌─────────────┐                             │
│ specialties │─────────────────────────────┘
└─────────────┘
```
