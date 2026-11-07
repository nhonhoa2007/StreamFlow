import { PlaylistDetail } from "../../../components/playlist-detail";

export default async function PlaylistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="page-content">
      <PlaylistDetail id={id} />
    </div>
  );
}
