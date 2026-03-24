/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Import JSON data into PostgreSQL database
 * For Vercel Neon database
 * 
 * Usage:
 *   npm install pg
 *   node database/import.js
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Load schema and JSON data
const schema = fs.readFileSync(path.join(__dirname, './schema.sql'), 'utf8');
const clinicsData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/clinics.json'), 'utf8'));
const specialtiesData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/specialties.json'), 'utf8'));

// Database connection - set your Vercel Neon connection string
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  console.error('❌ Error: DATABASE_URL or POSTGRES_URL environment variable not set');
  console.log('\nPlease set your Vercel Neon database connection string:');
  console.log('  export DATABASE_URL="postgres://user:pass@host/db?sslmode=require"');
  console.log('\nOr run with:');
  console.log('  DATABASE_URL="your-connection-string" node database/import.js');
  process.exit(1);
}

async function importData() {
  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false // Vercel Neon requires SSL
    }
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected successfully\n');

    // Run schema to create tables
    console.log('🏗️  Creating database schema...');
    await client.query(schema);
    console.log('✅ Schema created/updated\n');

    // Import clinics
    console.log('📋 Importing clinics...');
    for (const clinic of clinicsData.clinics) {
      await client.query(
        `INSERT INTO clinics (
          clinic_id, clinic_key, name, affiliation, location_label, phone, 
          contact_person, founded, population, website, directory_address,
          directory_city, directory_state, directory_zip, directory_map_url,
          directory_email, directory_phone, directory_website, hours,
          eligibility, accepting_referrals, referral_notes, last_verified_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
        [
          clinic.clinic_id, clinic.clinic_key, clinic.name, clinic.affiliation,
          clinic.location_label, clinic.phone, clinic.contact_person, clinic.founded,
          clinic.population, clinic.website, clinic.directory_address, clinic.directory_city,
          clinic.directory_state, clinic.directory_zip, clinic.directory_map_url,
          clinic.directory_email, clinic.directory_phone, clinic.directory_website,
          clinic.hours, clinic.eligibility, clinic.accepting_referrals,
          clinic.referral_notes, clinic.last_verified_at
        ]
      );
    }
    console.log(`✅ Imported ${clinicsData.clinics.length} clinics\n`);

    // Import specialties (MUST BE BEFORE clinic_specialties due to foreign key)
    console.log('🩺 Importing specialties...');
    for (const specialty of specialtiesData.specialties) {
      await client.query(
        'INSERT INTO specialties (specialty_id, display_name, description, icon) VALUES ($1, $2, $3, $4)',
        [specialty.specialty_id, specialty.display_name, specialty.description, specialty.icon]
      );
    }
    console.log(`✅ Imported ${specialtiesData.specialties.length} specialties\n`);

    // Import clinic tags
    console.log('🏷️  Importing clinic tags...');
    for (const tag of clinicsData.clinic_tags) {
      await client.query(
        'INSERT INTO clinic_tags (clinic_id, tag) VALUES ($1, $2)',
        [tag.clinic_id, tag.tag]
      );
    }
    console.log(`✅ Imported ${clinicsData.clinic_tags.length} clinic tags\n`);

    // Import clinic referral methods
    console.log('📞 Importing clinic referral methods...');
    for (const method of clinicsData.clinic_referral_methods) {
      await client.query(
        'INSERT INTO clinic_referral_methods (clinic_id, method) VALUES ($1, $2)',
        [method.clinic_id, method.method]
      );
    }
    console.log(`✅ Imported ${clinicsData.clinic_referral_methods.length} referral methods\n`);

    // Import clinic specialties (NOW specialties exist for foreign key)
    console.log('🔗 Importing clinic-specialty relationships...');
    for (const cs of clinicsData.clinic_specialties) {
      try {
        await client.query(
          'INSERT INTO clinic_specialties (clinic_id, specialty_id) VALUES ($1, $2)',
          [cs.clinic_id, cs.specialty_id]
        );
      } catch (err) {
        console.error(`Failed inserting clinic_specialty: clinic_id="${cs.clinic_id}", specialty_id="${cs.specialty_id}"`);
        
        // Check if specialty exists
        const check = await client.query('SELECT specialty_id FROM specialties WHERE specialty_id = $1', [cs.specialty_id]);
        console.error(`Specialty exists in DB: ${check.rows.length > 0 ? 'YES' : 'NO'}`);
        
        // Show all specialty IDs in database
        const all = await client.query('SELECT specialty_id FROM specialties ORDER BY specialty_id');
        console.error('All specialty IDs in database:', all.rows.map(r => r.specialty_id));
        
        throw err;
      }
    }
    console.log(`✅ Imported ${clinicsData.clinic_specialties.length} clinic-specialty relationships\n`);

    // Import specialty clinics
    console.log('🏥 Importing specialty-clinic details...');
    for (const sc of specialtiesData.specialty_clinics) {
      await client.query(
        'INSERT INTO specialty_clinics (specialty_clinic_id, specialty_id, clinic_id, frequency) VALUES ($1, $2, $3, $4)',
        [sc.specialty_clinic_id, sc.specialty_id, sc.clinic_id, sc.frequency]
      );
    }
    console.log(`✅ Imported ${specialtiesData.specialty_clinics.length} specialty-clinic pairings\n`);

    // Import specialty documents
    console.log('📄 Importing specialty documents...');
    for (const doc of specialtiesData.specialty_documents) {
      await client.query(
        'INSERT INTO specialty_documents (specialty_clinic_id, doc_name, doc_type, doc_description) VALUES ($1, $2, $3, $4)',
        [doc.specialty_clinic_id, doc.doc_name, doc.doc_type, doc.doc_description]
      );
    }
    console.log(`✅ Imported ${specialtiesData.specialty_documents.length} documents\n`);

    // Verification queries
    console.log('🔍 Verifying import...');
    const counts = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM clinics) as clinics,
        (SELECT COUNT(*) FROM specialties) as specialties,
        (SELECT COUNT(*) FROM clinic_tags) as clinic_tags,
        (SELECT COUNT(*) FROM clinic_referral_methods) as referral_methods,
        (SELECT COUNT(*) FROM clinic_specialties) as clinic_specialties,
        (SELECT COUNT(*) FROM specialty_clinics) as specialty_clinics,
        (SELECT COUNT(*) FROM specialty_documents) as documents
    `);
    
    console.log('📊 Final counts:');
    console.log(`   Clinics: ${counts.rows[0].clinics}`);
    console.log(`   Specialties: ${counts.rows[0].specialties}`);
    console.log(`   Clinic Tags: ${counts.rows[0].clinic_tags}`);
    console.log(`   Referral Methods: ${counts.rows[0].referral_methods}`);
    console.log(`   Clinic-Specialty Links: ${counts.rows[0].clinic_specialties}`);
    console.log(`   Specialty-Clinic Pairings: ${counts.rows[0].specialty_clinics}`);
    console.log(`   Documents: ${counts.rows[0].documents}`);
    
    console.log('\n✅ Import completed successfully!');

  } catch (error) {
    console.error('❌ Error during import:', error);
    throw error;
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the import
importData().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
