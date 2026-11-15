import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client.js';
import { QuotaBar } from '../../components/QuotaBar.jsx';

export function AdminResourcesPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/admin/resources')
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="p-4 rounded-xl bg-rose-50 text-rose-700 text-sm">{error}</div>;
  if (!data) return <div className="text-sm text-slate-500">Loading OpenNebula host & datastore status...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Server & Datastore Capacity</h1>
        <p className="text-sm text-slate-600 mt-1">Live capacity reported by OpenNebula 7.4.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-800">KVM Hosts</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.hosts.map((h) => (
            <div key={h.id} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-900">{h.name} (Host #{h.id})</span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                  {h.stateLabel} • {h.runningVms} VMs
                </span>
              </div>
              <QuotaBar label="Allocated RAM" used={h.allocatedMemoryMb} limit={h.totalMemoryMb} unit="MB" />
              <QuotaBar label="Allocated CPU" used={h.allocatedCpuUnits} limit={h.totalCpuUnits} unit="units" />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-800">Datastores</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.datastores.map((ds) => (
            <div key={ds.id} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-900">{ds.name} (#{ds.id})</span>
                <span className="text-xs font-mono text-slate-500">{ds.type}</span>
              </div>
              <QuotaBar
                label="Storage Used"
                used={Math.round(ds.usedMb / 1024)}
                limit={Math.round(ds.totalMb / 1024)}
                unit="GB"
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
