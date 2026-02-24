import Head from "next/head";
import { useRouter } from "next/router";
import { useState, type FormEvent } from "react";
import { withIronSessionSsr } from "iron-session/next";
import { getSessionOptions } from "@/lib/auth/session";

type LoginPageProps = {
  nextPath: string;
};

export const getServerSideProps = withIronSessionSsr<LoginPageProps>(
  async (context) => {
    if (context.req.session.isLoggedIn) {
      return {
        redirect: {
          destination: "/specialty",
          permanent: false
        }
      };
    }

    const rawNext =
      typeof context.query.next === "string" && context.query.next.trim().length > 0
        ? context.query.next
        : "/specialty";
    const nextPath = rawNext.startsWith("/") ? rawNext : "/specialty";

    return {
      props: {
        nextPath
      }
    };
  },
  getSessionOptions()
);

export default function LoginPage({ nextPath }: LoginPageProps) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
      });

      const payload = (await response.json()) as { ok: boolean; message?: string };

      if (!response.ok || !payload.ok) {
        setError(payload.message ?? "Unable to sign in.");
        setIsSubmitting(false);
        return;
      }

      await router.push(nextPath);
    } catch (error) {
      console.error("Login request failed", error);
      setError("Unable to sign in.");
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Sign in</title>
      </Head>
      <main className="auth-page">
        <section className="auth-card">
          <h1 className="auth-title">Clinic Referral Access</h1>
          <p className="auth-subtitle">Sign in with your username and password.</p>
          <p className="auth-demo">Demo: alice, bob, charlie (all use password: password123)</p>

          <form onSubmit={handleSubmit} className="auth-form">
            <label className="auth-label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="auth-input"
              placeholder="alice, bob, charlie"
              required
            />

            <label className="auth-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="auth-input"
              placeholder="Your password"
              required
            />

            {error ? <p className="auth-error">{error}</p> : null}

            <button
              type="submit"
              className="auth-button"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </section>
      </main>
    </>
  );
}
