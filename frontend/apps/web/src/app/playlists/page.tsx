import { PlaylistList } from "../../components/playlist-list";

export default function PlaylistsPage() {
  return (
    <div className="page-content">
      <p className="eyebrow mb-3">Your collection</p>
      <h1 className="page-title">Playlists</h1>
      <p className="mb-9 mt-4 text-sm text-sf-text-muted">
        Keep the titles you want to return to in one place.
      </p>
      <PlaylistList />
    </div>
  );
}
