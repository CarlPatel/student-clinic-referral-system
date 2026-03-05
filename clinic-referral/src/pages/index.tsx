import type { GetServerSideProps } from "next";
import { withIronSessionSsr } from "iron-session/next";
import { getSessionOptions } from "@/lib/auth/session";

export const getServerSideProps: GetServerSideProps = withIronSessionSsr(
  async (context) => {
    if (!context.req.session.isLoggedIn) {
      return {
        redirect: {
          destination: "/login",
          permanent: false
        }
      };
    }

    return {
      redirect: {
        destination: "/app",
        permanent: false
      }
    };
  },
  getSessionOptions()
);

export default function Home() {
  return null;
}