import { MediaDetails } from "../../../components/media-details";
import { fetchMedia, fetchMediaDetail } from "../../../lib/media-api";
export const dynamic = "force-dynamic";
export default async function DetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, related] = await Promise.all([
    fetchMediaDetail(id),
    fetchMedia(undefined, { limit: 8 }),
  ]);
  return (
    <MediaDetails
      item={detail.data}
      error={detail.error}
      related={related.data?.items.filter((item) => item.id !== id) ?? []}
    />
  );
}
