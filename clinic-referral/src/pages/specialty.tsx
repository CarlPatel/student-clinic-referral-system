import Link from "next/link";
import { withIronSessionSsr } from "iron-session/next";
import { getClinics, getServices } from "@/lib/dataSource/postgres";
import { getSessionOptions } from "@/lib/auth/session";
import type { Clinic, Service } from "@/lib/types";

type ServicePageProps = {
  services: Service[];
  clinics: Clinic[];
  username: string;
};

export const getServerSideProps = withIronSessionSsr<ServicePageProps>(
  async (context) => {
    if (!context.req.session.isLoggedIn) {
      const nextPath = context.resolvedUrl ?? "/service";
      return {
        redirect: {
          destination: `/login?next=${encodeURIComponent(nextPath)}`,
          permanent: false
        }
      };
    }

    const [services, clinics] = await Promise.all([getServices(), getClinics()]);
    return { props: { services, clinics, username: context.req.session.username || "User" } };
  },
  getSessionOptions()
);

function groupClinicsByService(services: Service[], clinics: Clinic[]) {
  const map: Record<string, Clinic[]> = {};
  for (const service of services) map[service.id] = [];
  for (const c of clinics) {
    for (const serviceId of c.serviceIds) {
      if (!map[serviceId]) map[serviceId] = [];
      map[serviceId].push(c);
    }
  }
  for (const serviceId of Object.keys(map)) {
    map[serviceId].sort((a, b) => a.name.localeCompare(b.name));
  }
  return map;
}

export default function ServicePage({
  services,
  clinics,
  username
}: ServicePageProps) {
  const grouped = groupClinicsByService(services, clinics);

  return (
    <main className="service-page">
      <header className="page-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 className="page-title">Clinic Directory by Service</h1>
            <p className="page-user-info">Signed in as: <strong>{username}</strong></p>
          </div>
        </div>
        <p className="page-subtitle">
          Directory only — do not include patient-identifying info.
        </p>
        <div className="page-nav">
          <Link href="/clinic">Go to Clinic Page →</Link>
          <Link href="/logout">Sign out</Link>
        </div>
      </header>

      <div className="service-grid">
        {services
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((service) => {
            const clinicsForService = grouped[service.id] ?? [];
            return (
              <section
                key={service.id}
                className="service-card"
              >
                <h2 className="service-title">
                  {service.name}{" "}
                  <span className="service-count">
                    ({clinicsForService.length})
                  </span>
                </h2>

                {clinicsForService.length === 0 ? (
                  <p className="service-empty">No clinics listed yet.</p>
                ) : (
                  <ul className="service-list">
                    {clinicsForService.map((c) => (
                      <li key={c.id} className="service-list-item">
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
