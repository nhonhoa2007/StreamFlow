import { CatalogView } from "../components/catalog";
import { fetchMedia } from "../lib/media-api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { data, error } = await fetchMedia();

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h2
          style={{
            margin: "0 0 0.25rem 0",
            fontSize: "1.75rem",
            color: "#0f172a",
          }}
        >
          Media Catalog
        </h2>
        <p style={{ margin: 0, color: "#64748b", fontSize: "0.95rem" }}>
          Metadata catalog served via NestJS Fastify and PostgreSQL with Keyset Pagination.
        </p>
      </div>

      <CatalogView
        initialItems={data?.items}
        initialNextCursor={data?.nextCursor}
        initialHasMore={data?.hasMore}
        error={error}
      />
    </div>
  );
}
