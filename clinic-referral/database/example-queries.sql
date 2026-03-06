-- Example Queries for Student Clinic Referral System
-- Use these in the Neon SQL Editor to explore your data

-- ============================================================================
-- BASIC QUERIES
-- ============================================================================

-- List all clinics
SELECT clinic_id, name, location_label, phone 
FROM clinics 
ORDER BY name;

-- List all specialties with icons
SELECT specialty_id, display_name, icon 
FROM specialties 
ORDER BY display_name;

-- Count records in each table
SELECT 
    (SELECT COUNT(*) FROM clinics) as total_clinics,
    (SELECT COUNT(*) FROM specialties) as total_specialties,
    (SELECT COUNT(*) FROM specialty_clinics) as specialty_clinic_pairings,
    (SELECT COUNT(*) FROM specialty_documents) as total_documents;

-- ============================================================================
-- CLINICS & TAGS
-- ============================================================================

-- Get all tags for a specific clinic
SELECT c.name, ct.tag
FROM clinics c
JOIN clinic_tags ct ON c.clinic_id = ct.clinic_id
WHERE c.clinic_key = 'tepati'
ORDER BY ct.tag;

-- Find clinics with a specific tag
SELECT c.name, c.location_label
FROM clinics c
JOIN clinic_tags ct ON c.clinic_id = ct.clinic_id
WHERE ct.tag LIKE '%labs%'
ORDER BY c.name;

-- Clinics with their tag count
SELECT c.name, COUNT(ct.tag) as tag_count
FROM clinics c
LEFT JOIN clinic_tags ct ON c.clinic_id = ct.clinic_id
GROUP BY c.clinic_id, c.name
ORDER BY tag_count DESC;

-- ============================================================================
-- SPECIALTIES & CLINICS
-- ============================================================================

-- Which clinics offer Cardiology?
SELECT 
    c.name,
    c.location_label,
    sc.frequency,
    COUNT(sd.id) as required_documents
FROM specialty_clinics sc
JOIN clinics c ON sc.clinic_id = c.clinic_id
JOIN specialties s ON sc.specialty_id = s.specialty_id
LEFT JOIN specialty_documents sd ON sc.specialty_clinic_id = sd.specialty_clinic_id
WHERE s.display_name = 'Cardiology'
GROUP BY c.name, c.location_label, sc.frequency
ORDER BY c.name;

-- How many specialties does each clinic offer?
SELECT 
    c.name,
    COUNT(DISTINCT sc.specialty_id) as specialty_count,
    STRING_AGG(DISTINCT s.display_name, ', ' ORDER BY s.display_name) as specialties
FROM clinics c
JOIN specialty_clinics sc ON c.clinic_id = sc.clinic_id
JOIN specialties s ON sc.specialty_id = s.specialty_id
GROUP BY c.clinic_id, c.name
ORDER BY specialty_count DESC;

-- Specialties available at Clínica Tepati
SELECT s.display_name, s.icon, sc.frequency
FROM specialty_clinics sc
JOIN specialties s ON sc.specialty_id = s.specialty_id
JOIN clinics c ON sc.clinic_id = c.clinic_id
WHERE c.clinic_key = 'tepati'
ORDER BY s.display_name;

-- ============================================================================
-- DOCUMENTS
-- ============================================================================

-- All documents required for Dermatology at any clinic
SELECT 
    c.name as clinic_name,
    sd.doc_name,
    sd.doc_type,
    sd.doc_description
FROM specialty_documents sd
JOIN specialty_clinics sc ON sd.specialty_clinic_id = sc.specialty_clinic_id
JOIN specialties s ON sc.specialty_id = s.specialty_id
JOIN clinics c ON sc.clinic_id = c.clinic_id
WHERE s.display_name = 'Dermatology'
ORDER BY c.name, sd.doc_type, sd.doc_name;

-- Document count by type
SELECT doc_type, COUNT(*) as count
FROM specialty_documents
GROUP BY doc_type
ORDER BY count DESC;

-- Specialty-clinic pairings with most documents
SELECT 
    s.display_name,
    c.name,
    COUNT(sd.id) as document_count
FROM specialty_clinics sc
JOIN specialties s ON sc.specialty_id = s.specialty_id
JOIN clinics c ON sc.clinic_id = c.clinic_id
LEFT JOIN specialty_documents sd ON sc.specialty_clinic_id = sd.specialty_clinic_id
GROUP BY s.display_name, c.name
ORDER BY document_count DESC
LIMIT 20;

-- ============================================================================
-- REFERRAL INFORMATION
-- ============================================================================

-- Get referral methods for clinics
SELECT c.name, cr.method
FROM clinics c
JOIN clinic_referral_methods cr ON c.clinic_id = cr.clinic_id
ORDER BY c.name;

-- Clinics accepting referrals with contact info
SELECT 
    name,
    location_label,
    phone,
    contact_person,
    website
FROM clinics
WHERE accepting_referrals = true
ORDER BY name;

-- ============================================================================
-- USING VIEWS
-- ============================================================================

-- Clinics with aggregated tags (using view)
SELECT name, location_label, tags
FROM v_clinics_with_tags
WHERE 'In-house labs' = ANY(tags)
ORDER BY name;

-- Specialty clinic counts (using view)
SELECT display_name, icon, clinic_count
FROM v_specialties_with_counts
ORDER BY clinic_count DESC;

-- Full specialty-clinic information (using view)
SELECT 
    specialty_name,
    clinic_name,
    frequency,
    document_count
FROM v_specialty_clinics_full
WHERE specialty_name = 'Mental Health'
ORDER BY clinic_name;

-- ============================================================================
-- ADVANCED QUERIES
-- ============================================================================

-- Find clinics that offer multiple specialties, with all their info
SELECT 
    c.name,
    c.location_label,
    c.phone,
    c.website,
    COUNT(DISTINCT sc.specialty_id) as specialty_count,
    ARRAY_AGG(DISTINCT s.display_name ORDER BY s.display_name) as specialties,
    ARRAY_AGG(DISTINCT ct.tag) FILTER (WHERE ct.tag IS NOT NULL) as tags
FROM clinics c
LEFT JOIN specialty_clinics sc ON c.clinic_id = sc.clinic_id
LEFT JOIN specialties s ON sc.specialty_id = s.specialty_id
LEFT JOIN clinic_tags ct ON c.clinic_id = ct.clinic_id
GROUP BY c.clinic_id, c.name, c.location_label, c.phone, c.website
HAVING COUNT(DISTINCT sc.specialty_id) > 5
ORDER BY specialty_count DESC;

-- Search for clinics or specialties by keyword
SELECT 
    'Clinic' as type,
    name as title,
    location_label as info
FROM clinics
WHERE name ILIKE '%health%' OR population ILIKE '%health%'
UNION ALL
SELECT 
    'Specialty' as type,
    display_name as title,
    description as info
FROM specialties
WHERE display_name ILIKE '%health%' OR description ILIKE '%health%'
ORDER BY type, title;

-- Monthly clinic schedule (from founded dates)
SELECT 
    name,
    founded,
    hours,
    contact_person
FROM clinics
WHERE hours IS NOT NULL
ORDER BY founded;

-- ============================================================================
-- DATA VALIDATION QUERIES
-- ============================================================================

-- Check for clinics without specialties
SELECT c.name
FROM clinics c
LEFT JOIN specialty_clinics sc ON c.clinic_id = sc.clinic_id
WHERE sc.specialty_clinic_id IS NULL;

-- Check for orphaned specialty-clinic links
SELECT sc.specialty_clinic_id
FROM specialty_clinics sc
LEFT JOIN specialty_documents sd ON sc.specialty_clinic_id = sd.specialty_clinic_id
WHERE sd.id IS NULL;

-- Verify foreign key relationships
SELECT 
    (SELECT COUNT(*) FROM clinic_tags ct 
     WHERE NOT EXISTS (SELECT 1 FROM clinics c WHERE c.clinic_id = ct.clinic_id)) as orphaned_tags,
    (SELECT COUNT(*) FROM specialty_documents sd
     WHERE NOT EXISTS (SELECT 1 FROM specialty_clinics sc WHERE sc.specialty_clinic_id = sd.specialty_clinic_id)) as orphaned_docs;
