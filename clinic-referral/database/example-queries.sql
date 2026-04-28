-- Student Clinic Referral System - canonical service schema examples

-- List clinics
SELECT clinic_id, clinic_key, name, location_label, phone, tags
FROM clinics
ORDER BY name;

-- List services
SELECT service_id, display_name, service_type, icon
FROM services
ORDER BY display_name;

-- Basic table counts
SELECT
    (SELECT COUNT(*) FROM clinics) AS total_clinics,
    (SELECT COUNT(*) FROM services) AS total_services,
    (SELECT COUNT(*) FROM clinic_services) AS total_clinic_services,
    (SELECT COUNT(*) FROM clinic_documents) AS total_clinic_documents,
    (SELECT COUNT(*) FROM clinic_service_documents) AS total_documents,
    (SELECT COUNT(*) FROM users) AS total_users,
    (SELECT COUNT(*) FROM referrals) AS total_referrals;

-- Clinics that provide a service
SELECT
    s.display_name AS service_name,
    c.name AS clinic_name,
    cs.status,
    cs.accepting_referrals,
    cs.notes
FROM clinic_services cs
JOIN services s ON s.service_id = cs.service_id
JOIN clinics c ON c.clinic_id = cs.clinic_id
WHERE s.display_name = 'Mental Health'
ORDER BY c.name;

-- Services available at each clinic
SELECT
    c.name AS clinic_name,
    COUNT(DISTINCT cs.service_id) AS service_count,
    STRING_AGG(DISTINCT s.display_name, ', ' ORDER BY s.display_name) AS services
FROM clinics c
LEFT JOIN clinic_services cs ON cs.clinic_id = c.clinic_id
LEFT JOIN services s ON s.service_id = cs.service_id
GROUP BY c.clinic_id, c.name
ORDER BY service_count DESC, c.name;

-- Clinic-wide documents
SELECT
    c.name AS clinic_name,
    d.doc_name,
    d.doc_type,
    d.doc_description,
    d.url,
    d.google_drive_file_id,
    d.sort_order
FROM clinic_documents d
JOIN clinics c ON c.clinic_id = d.clinic_id
ORDER BY c.name, d.sort_order NULLS LAST, d.doc_name;

-- Documents required for a clinic-service pairing
SELECT
    c.name AS clinic_name,
    s.display_name AS service_name,
    d.doc_name,
    d.doc_type,
    d.doc_description,
    d.url,
    d.google_drive_file_id,
    d.sort_order
FROM clinic_service_documents d
JOIN clinic_services cs ON cs.clinic_service_id = d.clinic_service_id
JOIN clinics c ON c.clinic_id = cs.clinic_id
JOIN services s ON s.service_id = cs.service_id
ORDER BY s.display_name, c.name, d.sort_order NULLS LAST, d.doc_name;

-- Referral tracker with display names
SELECT
    r.id,
    referring.name AS referring_clinic_name,
    receiving.name AS receiving_clinic_name,
    s.display_name AS service,
    r.referral_date,
    r.referral_time,
    r.status,
    r.preceptor,
    r.submitted_at
FROM referrals r
JOIN clinics referring ON referring.clinic_id = r.referring_clinic_id
JOIN clinics receiving ON receiving.clinic_id = r.receiving_clinic_id
JOIN clinic_services cs ON cs.clinic_service_id = r.clinic_service_id
JOIN services s ON s.service_id = cs.service_id
ORDER BY r.submitted_at DESC;

-- Find clinics by tag
SELECT clinic_id, name, tags
FROM clinics
WHERE tags @> ARRAY['In-house labs']::text[];

-- Verify foreign-key health
SELECT
    (SELECT COUNT(*)
     FROM users u
     WHERE u.clinic_key IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM clinics c WHERE c.clinic_key = u.clinic_key)) AS orphaned_users,
    (SELECT COUNT(*)
     FROM clinic_documents d
     WHERE NOT EXISTS (SELECT 1 FROM clinics c WHERE c.clinic_id = d.clinic_id)) AS orphaned_clinic_documents,
    (SELECT COUNT(*)
     FROM clinic_service_documents d
     WHERE NOT EXISTS (SELECT 1 FROM clinic_services cs WHERE cs.clinic_service_id = d.clinic_service_id)) AS orphaned_documents;
