import type { GetServerSideProps } from "next";
import { withIronSessionSsr } from "iron-session/next";
import { getSessionOptions } from "@/lib/auth/session";

export const getServerSideProps: GetServerSideProps = withIronSessionSsr(
  async (context) => {
    context.req.session.destroy();

    return {
      redirect: {
        destination: "/login",
        permanent: false
      }
    };
  },
  getSessionOptions()
);

export default function LogoutPage() {
  return null;
}
