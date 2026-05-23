interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string; // optional left-border accent colour
}

/**
 * Single-metric summary card used in dashboards.
 */
export function StatCard({ label, value, sub, accent }: StatCardProps) {
  return (
    <div
      className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"
      style={accent ? { borderLeftWidth: 3, borderLeftColor: accent } : undefined}
    >
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
        {label}
      </p>
      <p className="text-2xl font-semibold text-gray-900 leading-none">{value}</p>
      {sub && (
        <p className="text-xs text-gray-400 mt-1.5">{sub}</p>
      )}
    </div>
  );
}
