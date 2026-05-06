export function KpiStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {children}
    </div>
  )
}
