-- Student Clinic Referral System - PostgreSQL Schema
-- Vercel Neon Database Setup

-- Drop existing tables if they exist (in reverse dependency order)
DROP TABLE IF EXISTS specialty_documents CASCADE;
DROP TABLE IF EXISTS specialty_clinics CASCADE;
DROP TABLE IF EXISTS clinic_specialties CASCADE;
DROP TABLE IF EXISTS clinic_referral_methods CASCADE;
DROP TABLE IF EXISTS clinic_tags CASCADE;
DROP TABLE IF EXISTS specialties CASCADE;
DROP TABLE IF EXISTS clinics CASCADE;

-- ============================================================================
-- MAIN TABLES
-- ============================================================================

-- Clinics Table
CREATE TABLE clinics (
    clinic_id VARCHAR(100) PRIMARY KEY,
    clinic_key VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    affiliation VARCHAR(255),
    location_label VARCHAR(255),
    phone VARCHAR(50),
    contact_person VARCHAR(100),
    founded VARCHAR(10),
    population TEXT,
    website VARCHAR(500),
    directory_address VARCHAR(500),
    directory_city VARCHAR(100),
    directory_state VARCHAR(50),
    directory_zip VARCHAR(20),
    directory_map_url VARCHAR(500),
    directory_email VARCHAR(255),
    directory_phone VARCHAR(50),
    directory_website VARCHAR(500),
    hours VARCHAR(255),
    eligibility TEXT,
    accepting_referrals BOOLEAN DEFAULT true,
    referral_notes TEXT,
    last_verified_at VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Specialties Table
CREATE TABLE specialties (
    specialty_id VARCHAR(100) PRIMARY KEY,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- JUNCTION & DETAIL TABLES
-- ============================================================================

-- Clinic Tags (many-to-many relationship)
CREATE TABLE clinic_tags (
    id SERIAL PRIMARY KEY,
    clinic_id VARCHAR(100) NOT NULL REFERENCES clinics(clinic_id) ON DELETE CASCADE,
    tag VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(clinic_id, tag)
);

-- Clinic Referral Methods
CREATE TABLE clinic_referral_methods (
    id SERIAL PRIMARY KEY,
    clinic_id VARCHAR(100) NOT NULL REFERENCES clinics(clinic_id) ON DELETE CASCADE,
    method TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Clinic-Specialty Junction Table (which specialties each clinic offers)
CREATE TABLE clinic_specialties (
    id SERIAL PRIMARY KEY,
    clinic_id VARCHAR(100) NOT NULL REFERENCES clinics(clinic_id) ON DELETE CASCADE,
    specialty_id VARCHAR(100) NOT NULL REFERENCES specialties(specialty_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(clinic_id, specialty_id)
);

-- Specialty-Clinic Details (specialty view with frequency information)
CREATE TABLE specialty_clinics (
    specialty_clinic_id VARCHAR(100) PRIMARY KEY,
    specialty_id VARCHAR(100) NOT NULL REFERENCES specialties(specialty_id) ON DELETE CASCADE,
    clinic_id VARCHAR(100) NOT NULL REFERENCES clinics(clinic_id) ON DELETE CASCADE,
    frequency VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(specialty_id, clinic_id)
);

-- Specialty Documents (required documents for each specialty-clinic pairing)
CREATE TABLE specialty_documents (
    id SERIAL PRIMARY KEY,
    specialty_clinic_id VARCHAR(100) NOT NULL REFERENCES specialty_clinics(specialty_clinic_id) ON DELETE CASCADE,
    doc_name VARCHAR(500) NOT NULL,
    doc_type VARCHAR(20) NOT NULL CHECK (doc_type IN ('form', 'auth', 'insurance')),
    doc_description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Clinics indexes
CREATE INDEX idx_clinics_clinic_key ON clinics(clinic_key);
CREATE INDEX idx_clinics_name ON clinics(name);
CREATE INDEX idx_clinics_accepting_referrals ON clinics(accepting_referrals);

-- Specialties indexes
CREATE INDEX idx_specialties_display_name ON specialties(display_name);

-- Clinic tags indexes
CREATE INDEX idx_clinic_tags_clinic_id ON clinic_tags(clinic_id);
CREATE INDEX idx_clinic_tags_tag ON clinic_tags(tag);

-- Clinic referral methods indexes
CREATE INDEX idx_clinic_referral_methods_clinic_id ON clinic_referral_methods(clinic_id);

-- Clinic specialties indexes
CREATE INDEX idx_clinic_specialties_clinic_id ON clinic_specialties(clinic_id);
CREATE INDEX idx_clinic_specialties_specialty_id ON clinic_specialties(specialty_id);

-- Specialty clinics indexes
CREATE INDEX idx_specialty_clinics_specialty_id ON specialty_clinics(specialty_id);
CREATE INDEX idx_specialty_clinics_clinic_id ON specialty_clinics(clinic_id);

-- Specialty documents indexes
CREATE INDEX idx_specialty_documents_specialty_clinic_id ON specialty_documents(specialty_clinic_id);
CREATE INDEX idx_specialty_documents_doc_type ON specialty_documents(doc_type);

-- ============================================================================
-- HELPFUL VIEWS (OPTIONAL)
-- ============================================================================

-- View: Complete clinic information with aggregated tags
CREATE VIEW v_clinics_with_tags AS
SELECT 
    c.*,
    ARRAY_AGG(DISTINCT ct.tag) FILTER (WHERE ct.tag IS NOT NULL) as tags
FROM clinics c
LEFT JOIN clinic_tags ct ON c.clinic_id = ct.clinic_id
GROUP BY c.clinic_id;

-- View: Specialties with clinic counts
CREATE VIEW v_specialties_with_counts AS
SELECT 
    s.*,
    COUNT(DISTINCT sc.clinic_id) as clinic_count
FROM specialties s
LEFT JOIN specialty_clinics sc ON s.specialty_id = sc.specialty_id
GROUP BY s.specialty_id;

-- View: Complete specialty-clinic information with documents
CREATE VIEW v_specialty_clinics_full AS
SELECT 
    sc.specialty_clinic_id,
    s.display_name as specialty_name,
    s.icon as specialty_icon,
    c.name as clinic_name,
    c.clinic_key,
    sc.frequency,
    COUNT(sd.id) as document_count
FROM specialty_clinics sc
JOIN specialties s ON sc.specialty_id = s.specialty_id
JOIN clinics c ON sc.clinic_id = c.clinic_id
LEFT JOIN specialty_documents sd ON sc.specialty_clinic_id = sd.specialty_clinic_id
GROUP BY sc.specialty_clinic_id, s.display_name, s.icon, c.name, c.clinic_key, sc.frequency;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE clinics IS 'Main clinic information and directory';
COMMENT ON TABLE specialties IS 'Medical specialties offered across clinics';
COMMENT ON TABLE clinic_tags IS 'Descriptive tags for each clinic (e.g., "In-house labs")';
COMMENT ON TABLE clinic_referral_methods IS 'How to make referrals to each clinic';
COMMENT ON TABLE clinic_specialties IS 'Junction table: which specialties each clinic offers';
COMMENT ON TABLE specialty_clinics IS 'Specialty-centric view with frequency and additional details';
COMMENT ON TABLE specialty_documents IS 'Required documents for specialty-clinic pairings';

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================

SELECT 'Database schema created successfully!' as status;
