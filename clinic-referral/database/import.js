/**
 * Data import is intentionally disabled.
 *
 * The application now uses the canonical service schema. Seed/import logic has
 * not been rebuilt for that schema yet, and this step should not import or
 * migrate data.
 */

console.error("Data import is not implemented for the canonical service schema yet.");
console.error("Create schema with database/schema.sql, then add a new import script in a separate seed-data step.");
process.exit(1);
