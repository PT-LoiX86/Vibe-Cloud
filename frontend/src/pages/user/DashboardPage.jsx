import { useEffect, useState } from "react";
import { PlusCircle, Server, Activity, Layers } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { QuotaBar } from "../../components/QuotaBar.jsx";

export function DashboardPage({ onNavigate }) {
  const { user } = useAuth();
  const [resources, setResources] = useState(null);
  const [vmCount, setVmCount] = useState(0);
  const [pendingOps, setPendingOps] = useState(0);

  useEffect(() => {
    apiFetch("/api/resources/me")
      .then(setResources)
      .catch(() => {});
    apiFetch("/api/vms")
      .then((d) => setVmCount(d.virtualMachines.length))
      .catch(() => {});
    apiFetch("/api/provisioning-operations")
      .then((d) =>
        setPendingOps(
          d.operations.filter((o) =>
            ["PENDING", "SUBMITTING", "PROVISIONING"].includes(o.status),
          ).length,
        ),
      )
      .catch(() => {});
  }, []);

  const uq = resources?.userQuotas;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome back, @{user?.username}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Ready to launch ready-to-use virtual machines in just a few clicks?
          </p>
        </div>
        <button
          onClick={() => onNavigate("create-vm")}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl inline-flex items-center gap-2 shrink-0 transition"
        >
          <PlusCircle className="w-4 h-4" />
          Launch New VM
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          onClick={() => onNavigate("my-vms")}
          className="bg-white border border-slate-200 hover:border-indigo-300 rounded-xl p-5 text-left transition"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-sm font-medium">Ready Virtual Machines</span>
            <Server className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-3xl font-bold text-slate-900">{vmCount}</div>
          <div className="text-xs text-slate-500 mt-1">
            View SSH details & status
          </div>
        </button>

        <button
          onClick={() => onNavigate("activity")}
          className="bg-white border border-slate-200 hover:border-indigo-300 rounded-xl p-5 text-left transition"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-sm font-medium">In-Progress Builds</span>
            <Activity className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="text-3xl font-bold text-slate-900">{pendingOps}</div>
          <div className="text-xs text-slate-500 mt-1">
            Track live creation status
          </div>
        </button>

        <button
          onClick={() => onNavigate("catalog")}
          className="bg-white border border-slate-200 hover:border-indigo-300 rounded-xl p-5 text-left transition"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-sm font-medium">OS & VM Catalog</span>
            <Layers className="w-5 h-5 text-amber-600" />
          </div>
          <div className="text-lg font-bold text-slate-900 mt-1">
            Browse Plans
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Pre-tested OS & compute presets
          </div>
        </button>
      </div>

      {uq && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-slate-800">
            Your Resource Allowance
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <QuotaBar
              label="Virtual Machines"
              used={uq.vms.used}
              limit={uq.vms.limit}
              unit="VMs"
            />
            <QuotaBar
              label="Memory (RAM)"
              used={uq.memoryMb.used}
              limit={uq.memoryMb.limit}
              unit="MB"
            />
            <QuotaBar
              label="Compute (CPU)"
              used={uq.cpu.used}
              limit={uq.cpu.limit}
              unit="units"
            />
            <QuotaBar
              label="Storage"
              used={Math.round(uq.diskMb.used / 1024)}
              limit={
                uq.diskMb.limit ? Math.round(uq.diskMb.limit / 1024) : null
              }
              unit="GB"
            />
          </div>
        </div>
      )}
    </div>
  );
}
