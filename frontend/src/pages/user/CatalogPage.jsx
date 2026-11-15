import { useEffect, useState } from "react";
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Terminal,
  ArrowRight,
} from "lucide-react";
import { apiFetch } from "../../api/client.js";

export function CatalogPage({ onNavigate }) {
  const [operatingSystems, setOperatingSystems] = useState([]);
  const [offerings, setOfferings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/catalog/operating-systems"),
      apiFetch("/api/catalog/offerings"),
    ])
      .then(([osData, offData]) => {
        setOperatingSystems(osData.operatingSystems);
        setOfferings(offData.offerings);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-sm text-slate-500">Loading catalog...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Operating Systems & VM Plans
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Every option below is pre-configured by your administrator for quick
          setup.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-800">
          1. Available Operating Systems
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {operatingSystems.map((os) => (
            <div
              key={os.id}
              className="bg-white border border-slate-200 rounded-xl p-5 flex items-start gap-4"
            >
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                <Terminal className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="font-semibold text-slate-900">{os.name}</div>
                <p className="text-sm text-slate-600">{os.description}</p>
                <div className="text-xs text-slate-500 pt-1">
                  Default SSH user:{" "}
                  <code className="bg-slate-100 px-1.5 py-0.5 rounded">
                    {os.defaultSshUser}
                  </code>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-800">
          2. Quick-Start VM Plans
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {offerings.map((plan) => (
            <div
              key={plan.id}
              className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                  {plan.workloadTag}
                </span>
                <h3 className="text-lg font-bold text-slate-900">
                  {plan.name}
                </h3>
                <p className="text-sm text-slate-600">{plan.description}</p>
                <div className="pt-3 space-y-2 text-sm text-slate-700 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-slate-400" />
                    <span>{plan.vcpu} vCPU</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MemoryStick className="w-4 h-4 text-slate-400" />
                    <span>{plan.memoryMb} MB RAM</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-slate-400" />
                    <span>{plan.rootDiskGb} GB Root Disk</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => onNavigate("create-vm")}
                className="w-full py-2 px-4 rounded-lg bg-slate-900 hover:bg-indigo-600 text-white text-sm font-medium inline-flex items-center justify-center gap-2 transition"
              >
                Use This Plan
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
