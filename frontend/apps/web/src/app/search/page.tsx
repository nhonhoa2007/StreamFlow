import { SearchSurface } from "../../components/search-surface";
import { fetchMedia, searchMedia } from "../../lib/media-api";
import { readSearchState } from "../../lib/search-state";
export const dynamic = "force-dynamic";
export default async function SearchPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const {
    query,
    type,
    classification,
    sort,
    minDurationMs,
    maxDurationMs,
    publishedAfter,
    publishedBefore,
  } = readSearchState(await searchParams);
  const result = query
    ? await searchMedia(query, type, undefined, {
        classification,
        limit: 20,
        sort,
        minDurationMs,
        maxDurationMs,
        publishedAfter,
        publishedBefore,
      })
    : await fetchMedia(undefined, {
        type,
        classification,
        limit: 20,
        sort,
        minDurationMs,
        maxDurationMs,
        publishedAfter,
        publishedBefore,
      });
  return (
    <SearchSurface
      query={query}
      type={type}
      classification={classification}
      sort={sort}
      minDurationMs={minDurationMs}
      maxDurationMs={maxDurationMs}
      publishedAfter={publishedAfter}
      publishedBefore={publishedBefore}
      items={result.data?.items ?? []}
      error={result.error}
      nextCursor={result.data?.nextCursor}
      hasMore={result.data?.hasMore}
    />
  );
}
