export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/specialty",
      permanent: false
    }
  };
}

export default function Home() {
  return null;
}