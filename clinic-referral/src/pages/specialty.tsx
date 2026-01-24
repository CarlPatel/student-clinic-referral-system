import Link from "next/link";
import { getClinics, getSpecialties } from "@/lib/dataSource/localJson";
import type { Clinic, Specialty } from "@/lib/types";

export async function getStaticProps() {
  const [specialties, clinics] = await Promise.all([getSpecialties(), getClinics()]);
  return { props: { specialties, clinics } };
}

function groupClinicsBySpecialty(specialties: Specialty[], clinics: Clinic[]) {
  const map: Record<string, Clinic[]> = {};
  for (const s of specialties) map[s.id] = [];
  for (const c of clinics) {
    for (const sid of c.specialtyIds) {
      if (!map[sid]) map[sid] = [];
      map[sid].push(c);
    }
  }
  for (const sid of Object.keys(map)) {
    map[sid].sort((a, b) => a.name.localeCompare(b.name));
  }
  return map;
}

export default function SpecialtyPage({
  specialties,
  clinics
}: {
  specialties: Specialty[];
  clinics: Clinic[];
}) {
  const grouped = groupClinicsBySpecialty(specialties, clinics);

  return (
    <main className="specialty-page">
      <header className="page-header">
        <h1 className="page-title">Clinic Directory by Specialty</h1>
        <p className="page-subtitle">
          Directory only — do not include patient-identifying info.
        </p>
        <div className="page-nav">
          <Link href="/clinic">Go to Clinic Page →</Link>
        </div>
      </header>

      <div className="specialty-grid">
        {specialties
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((s) => {
            const clinicsForSpecialty = grouped[s.id] ?? [];
            return (
              <section
                key={s.id}
                className="specialty-card"
              >
                <h2 className="specialty-title">
                  {s.name}{" "}
                  <span className="specialty-count">
                    ({clinicsForSpecialty.length})
                  </span>
                </h2>

                {clinicsForSpecialty.length === 0 ? (
                  <p className="specialty-empty">No clinics listed yet.</p>
                ) : (
                  <ul className="specialty-list">
                    {clinicsForSpecialty.map((c) => (
                      <li key={c.id} className="specialty-list-item">
                        {/* This link opens the clinic page with that clinic expanded */}
                        <Link href={`/clinic?open=${encodeURIComponent(c.id)}`}>{c.name}</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
      </div>
    </main>
  );
}