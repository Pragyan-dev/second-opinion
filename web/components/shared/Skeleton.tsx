export function Skeleton({ width = "100%", height = 16, label = "Loading" }: { width?: number | string; height?: number | string; label?: string }) {
  return <div className="skeleton" role="status" aria-label={label} style={{ width, height, maxWidth: "100%" }} />;
}
