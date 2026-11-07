import { CatalogView } from "../components/catalog";
import { fetchMedia } from "../lib/media-api";
export const dynamic = "force-dynamic";
export default async function HomePage() {
  const { data, error } = await fetchMedia();
  return (
    <CatalogView
      key={JSON.stringify({ data, error })}
      initialItems={data?.items}
      initialNextCursor={data?.nextCursor}
      initialHasMore={data?.hasMore}
      error={error}
    />
  );
}
