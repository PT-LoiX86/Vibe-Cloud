import { useEffect, useState } from "react";
import { Server, Copy, Check, RefreshCw } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import { StatusBadge } from "../../components/StatusBadge.jsx";

export function MyVmsPage({ onNavigate }) {
  const [vms, setVms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);

  const load = () => {
    setLoading(true);
    apiFetch("/api/vms")
      .then((d) => setVms(d.virtualMachines))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const copyCommand = (id, cmd) => {
    navigator.clipboard.writeText(cmd);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            My Virtual Machines
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Your successfully created virtual machines will be shown here.
          </p>
        </div>
        <button
          onClick={load}
          className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Sync Status
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">Loading your VMs...</div>
      ) : vms.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
          <Server className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm text-slate-600">
            No ready VMs yet. Check Provisioning Status if you just created one.
          </p>
          <button
            onClick={() => onNavigate("create-vm")}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium"
          >
            Create a VM
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {vms.map((vm) => {
            const sshUser = vm.operatingSystem?.defaultSshUser || "root";
            const ip = vm.ipAddress || "<assigning-ip>";
            const sshCmd = `chmod 600 ${vm.name}-key.pem && ssh -i ${vm.name}-key.pem ${sshUser}@${ip}`;

            return (
              <div
                key={vm.id}
                className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-slate-900">
                      {vm.name}
                    </h2>
                    <StatusBadge status={vm.runtimeState || "RUNNING"} />
                    <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      ID #{vm.opennebulaVmId}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {vm.operatingSystem?.name} • {vm.vcpu} vCPU • {vm.memoryMb}{" "}
                    MB RAM • {vm.rootDiskGb} GB Disk
                  </div>
                </div>

                <div className="bg-slate-900 text-slate-100 rounded-xl p-3.5 flex items-center justify-between gap-3">
                  <div className="overflow-x-auto">
                    <div className="text-[11px] text-slate-400 mb-0.5">
                      Quick SSH Connect
                    </div>
                    <code className="text-xs font-mono text-emerald-400 whitespace-nowrap">
                      {sshCmd}
                    </code>
                  </div>
                  <button
                    onClick={() => copyCommand(vm.id, sshCmd)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium inline-flex items-center gap-1.5 shrink-0"
                  >
                    {copiedId === vm.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedId === vm.id ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
