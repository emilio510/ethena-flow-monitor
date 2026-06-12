export function KpiStrip({
  children,
  columns = 4,
}: {
  children: React.ReactNode
  columns?: 2 | 3 | 4 | 6
}) {
  const cls =
    columns === 6
      ? "md:grid-cols-3 lg:grid-cols-6"
      : columns === 4
        ? "md:grid-cols-2 lg:grid-cols-4"
        : columns === 3
          ? "grid-cols-2 md:grid-cols-3"
          : "grid-cols-2"
  return (
    <div className={`grid grid-cols-2 gap-3 ${cls}`}>{children}</div>
  )
}
