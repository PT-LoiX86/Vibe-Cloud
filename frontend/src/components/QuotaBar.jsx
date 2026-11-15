export function QuotaBar({ label, used, limit, unit = '' }) {
  const hasLimit = limit !== null && limit !== undefined && limit > 0;
  const pct = hasLimit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const barColor = pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-indigo-600';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span className="text-xs font-semibold text-slate-600">
          {used} {unit} / {hasLimit ? `${limit} ${unit}` : 'Unlimited'}
        </span>
      </div>
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full transition-all duration-300 ${barColor}`} style={{ width: `${hasLimit ? pct : 10}%` }} />
      </div>
    </div>
  );
}
