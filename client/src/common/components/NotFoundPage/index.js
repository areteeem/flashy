import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <main style={{ display: "grid", minHeight: "100vh", padding: "2rem", placeItems: "center" }}>
      <section style={{ width: "100%", maxWidth: "36rem" }}>
        <p style={{ color: "var(--primary)", fontWeight: 700 }}>404</p>
        <h1>Page not found</h1>
        <p>The page you&apos;re looking for doesn&apos;t exist or may have been moved.</p>
        <Link to="/">Go home</Link>
      </section>
    </main>
  );
}
