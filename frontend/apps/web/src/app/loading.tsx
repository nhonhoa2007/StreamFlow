export default function Loading() {
  return (
    <div
      data-testid="loading-skeleton"
      style={{
        padding: "2rem",
        textAlign: "center",
        color: "#64748b",
      }}
    >
      <p style={{ margin: 0, fontSize: "1.1rem" }}>Loading media catalog...</p>
    </div>
  );
}
