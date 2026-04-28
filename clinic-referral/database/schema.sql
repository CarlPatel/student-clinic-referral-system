-- Student Clinic Referral System - PostgreSQL Schema
-- Canonical destructive schema reset.

-- Drop existing tables if they exist, in reverse dependency order.
DROP TABLE IF EXISTS referrals CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS clinic_documents CASCADE;
DROP TABLE IF EXISTS clinic_service_documents CASCADE;
DROP TABLE IF EXISTS clinic_services CASCADE;
DROP TABLE IF EXISTS services CASCADE;
DROP TABLE IF EXISTS clinics CASCADE;

-- Drop obsolete legacy tables from older schema versions.
DROP TABLE IF EXISTS specialty_documents CASCADE;
DROP TABLE IF EXISTS specialty_clinics CASCADE;
DROP TABLE IF EXISTS clinic_specialties CASCADE;
DROP TABLE IF EXISTS clinic_referral_methods CASCADE;
DROP TABLE IF EXISTS clinic_tags CASCADE;
DROP TABLE IF EXISTS specialties CASCADE;

-- ============================================================================
-- CORE TABLES
-- ============================================================================

CREATE TABLE clinics (
    clinic_id VARCHAR(100) PRIMARY KEY,
    clinic_key VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,

    -- General info
    location_label VARCHAR(255),
    address VARCHAR(500),
    city VARCHAR(100),
    state VARCHAR(50),
    zip VARCHAR(20),
    map_url VARCHAR(500),
    phone VARCHAR(50),
    contact_person VARCHAR(100),
    email VARCHAR(255),
    founded DATE,
    website VARCHAR(500),

    -- Operational info
    hours VARCHAR(255),
    accepting_referrals BOOLEAN NOT NULL DEFAULT true,
    referral_notes TEXT,
    last_verified_at DATE,

    -- Merged legacy repeatable fields
    tags TEXT[] NOT NULL DEFAULT '{}',
    referral_methods TEXT[] NOT NULL DEFAULT '{}',

    -- System
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE services (
    service_id VARCHAR(100) PRIMARY KEY,
    display_name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    icon VARCHAR(50),
    service_type VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE clinic_services (
    clinic_service_id VARCHAR(100) PRIMARY KEY,
    clinic_id VARCHAR(100) NOT NULL REFERENCES clinics(clinic_id) ON DELETE CASCADE,
    service_id VARCHAR(100) NOT NULL REFERENCES services(service_id) ON DELETE CASCADE,
    notes TEXT,
    accepting_referrals BOOLEAN NOT NULL DEFAULT true,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    last_verified_at DATE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(clinic_id, service_id)
);

CREATE TABLE clinic_service_documents (
    id SERIAL PRIMARY KEY,
    clinic_service_id VARCHAR(100) NOT NULL REFERENCES clinic_services(clinic_service_id) ON DELETE CASCADE,
    doc_name VARCHAR(500) NOT NULL,
    doc_type VARCHAR(50) NOT NULL,
    doc_description TEXT,
    url TEXT,
    google_drive_file_id TEXT,
    sort_order INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE clinic_documents (
    id SERIAL PRIMARY KEY,
    clinic_id VARCHAR(100) NOT NULL REFERENCES clinics(clinic_id) ON DELETE CASCADE,
    doc_name VARCHAR(500) NOT NULL,
    doc_type VARCHAR(50) NOT NULL,
    doc_description TEXT,
    url TEXT,
    google_drive_file_id TEXT,
    sort_order INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id UUID PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('clinic_member', 'clinic_admin', 'master_admin')),
    clinic_key VARCHAR(50) REFERENCES clinics(clinic_key) ON DELETE SET NULL ON UPDATE CASCADE,

    -- Auth
    salt VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE referrals (
    id BIGINT PRIMARY KEY,
    referring_clinic_id VARCHAR(100) NOT NULL REFERENCES clinics(clinic_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    receiving_clinic_id VARCHAR(100) NOT NULL REFERENCES clinics(clinic_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    clinic_service_id VARCHAR(100) NOT NULL REFERENCES clinic_services(clinic_service_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    referral_date DATE NOT NULL,
    referral_time TIME NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'received', 'scheduled', 'completed')),
    preceptor VARCHAR(255) NOT NULL,
    notes TEXT,
    submitted_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_clinics_clinic_key ON clinics(clinic_key);
CREATE INDEX idx_clinics_name ON clinics(name);
CREATE INDEX idx_clinics_accepting_referrals ON clinics(accepting_referrals);
CREATE INDEX idx_clinics_tags ON clinics USING GIN (tags);

CREATE INDEX idx_services_display_name ON services(display_name);
CREATE INDEX idx_services_service_type ON services(service_type);

CREATE INDEX idx_clinic_services_clinic_id ON clinic_services(clinic_id);
CREATE INDEX idx_clinic_services_service_id ON clinic_services(service_id);
CREATE INDEX idx_clinic_services_status ON clinic_services(status);
CREATE INDEX idx_clinic_services_accepting_referrals ON clinic_services(accepting_referrals);

CREATE INDEX idx_clinic_service_documents_clinic_service_id ON clinic_service_documents(clinic_service_id);
CREATE INDEX idx_clinic_service_documents_doc_type ON clinic_service_documents(doc_type);
CREATE INDEX idx_clinic_service_documents_sort_order ON clinic_service_documents(clinic_service_id, sort_order, doc_name);
CREATE UNIQUE INDEX idx_clinic_service_documents_unique_sort_order
    ON clinic_service_documents(clinic_service_id, sort_order)
    WHERE sort_order IS NOT NULL;

CREATE INDEX idx_clinic_documents_clinic_id ON clinic_documents(clinic_id);
CREATE INDEX idx_clinic_documents_sort_order ON clinic_documents(clinic_id, sort_order, doc_name);
CREATE UNIQUE INDEX idx_clinic_documents_unique_sort_order
    ON clinic_documents(clinic_id, sort_order)
    WHERE sort_order IS NOT NULL;

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_clinic_key ON users(clinic_key);

CREATE INDEX idx_referrals_referring_clinic_id ON referrals(referring_clinic_id);
CREATE INDEX idx_referrals_receiving_clinic_id ON referrals(receiving_clinic_id);
CREATE INDEX idx_referrals_clinic_service_id ON referrals(clinic_service_id);
CREATE INDEX idx_referrals_status ON referrals(status);
CREATE INDEX idx_referrals_submitted_at ON referrals(submitted_at DESC);
CREATE INDEX idx_referrals_referral_date ON referrals(referral_date);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE clinics IS 'Canonical clinic directory and clinic-level referral metadata';
COMMENT ON TABLE services IS 'Generalized service and specialty categories offered by clinics';
COMMENT ON TABLE clinic_services IS 'Canonical clinic-to-service relationship';
COMMENT ON TABLE clinic_service_documents IS 'Documents required for a clinic-service relationship';
COMMENT ON TABLE clinic_documents IS 'Clinic-wide documents required for an entire clinic';
COMMENT ON TABLE users IS 'Application users for login and role-based access';
COMMENT ON TABLE referrals IS 'Referral tracking linked to clinics and clinic services';

-- Existing database migration:
-- CREATE TABLE IF NOT EXISTS clinic_documents (
--     id SERIAL PRIMARY KEY,
--     clinic_id VARCHAR(100) NOT NULL REFERENCES clinics(clinic_id) ON DELETE CASCADE,
--     doc_name VARCHAR(500) NOT NULL,
--     doc_type VARCHAR(50) NOT NULL,
--     doc_description TEXT,
--     url TEXT,
--     google_drive_file_id TEXT,
--     sort_order INTEGER,
--     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
--     updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
-- );
-- CREATE INDEX IF NOT EXISTS idx_clinic_documents_clinic_id ON clinic_documents(clinic_id);
-- CREATE INDEX IF NOT EXISTS idx_clinic_documents_sort_order ON clinic_documents(clinic_id, sort_order, doc_name);
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_documents_unique_sort_order
--     ON clinic_documents(clinic_id, sort_order)
--     WHERE sort_order IS NOT NULL;

SELECT 'Database schema created successfully!' AS status;
