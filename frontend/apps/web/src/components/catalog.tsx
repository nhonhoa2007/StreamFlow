import type { MediaItem } from "@streamflow/contracts";

export function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "Unknown duration";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function CatalogView({
  items,
  error,
}: {
  items?: MediaItem[];
  error?: string;
}) {
  if (error) {
    return (
      <div
        data-testid="error-catalog"
        style={{
          padding: "1.5rem",
          borderRadius: "8px",
          backgroundColor: "#fef2f2",
          border: "1px solid #f87171",
          color: "#991b1b",
          marginTop: "1.5rem",
        }}
      >
        <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem" }}>Service Degraded</h3>
        <p style={{ margin: 0 }}>{error}</p>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div
        data-testid="empty-catalog"
        style={{
          padding: "3rem",
          textAlign: "center",
          backgroundColor: "#f8fafc",
          borderRadius: "8px",
          border: "1px dashed #cbd5e1",
          marginTop: "1.5rem",
        }}
      >
        <h3 style={{ margin: "0 0 0.5rem 0", color: "#475569" }}>No media items in catalog</h3>
        <p style={{ margin: 0, color: "#64748b" }}>
          Run <code>make db-seed</code> to populate sample audio and video items.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="media-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: "1.25rem",
        marginTop: "1.5rem",
      }}
    >
      {items.map((item) => (
        <article
          key={item.id}
          data-testid={`media-card-${item.slug}`}
          style={{
            padding: "1.25rem",
            backgroundColor: "#ffffff",
            borderRadius: "8px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            border: "1px solid #e2e8f0",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.75rem",
              }}
            >
              <span
                style={{
                  padding: "0.2rem 0.6rem",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  borderRadius: "9999px",
                  backgroundColor: item.type === "VIDEO" ? "#dbeafe" : "#fef3c7",
                  color: item.type === "VIDEO" ? "#1e40af" : "#92400e",
                }}
              >
                {item.type}
              </span>
              <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
                {formatDuration(item.durationMs)}
              </span>
            </div>
            <h3
              style={{
                margin: "0 0 0.5rem 0",
                fontSize: "1.1rem",
                color: "#0f172a",
              }}
            >
              {item.title}
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: "0.8rem",
                fontFamily: "monospace",
                color: "#94a3b8",
              }}
            >
              slug: {item.slug}
            </p>
          </div>
          <div
            style={{
              marginTop: "1rem",
              paddingTop: "0.75rem",
              borderTop: "1px solid #f1f5f9",
              fontSize: "0.8rem",
              color: "#64748b",
            }}
          >
            <em>Metadata only (M01)</em>
          </div>
        </article>
      ))}
    </div>
  );
}
