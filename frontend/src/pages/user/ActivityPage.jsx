import { useEffect, useState } from "react";
import {
  RefreshCw,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from "lucide-react";
import { apiFetch } from "../../api/client.js";
import { StatusBadge } from "../../components/StatusBadge.jsx";

export function ActivityPage({ onNavigate }) {
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState({});
  const [copiedId, setCopiedId] = useState(null);

  const load = () => {
    apiFetch("/api/provisioning-operations")
      .then((d) => setOperations(d.operations))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, []);

  const toggleExpand = (id) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyError = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Provisioning Status
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Live progress of your VM creation requests (refreshes automatically
            every 3 seconds).
          </p>
        </div>
        <button
          onClick={load}
          className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">Loading operations...</div>
      ) : operations.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
          <p className="text-sm text-slate-600">
            You haven&apos;t requested any virtual machines yet.
          </p>
          <button
            onClick={() => onNavigate("create-vm")}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium"
          >
            Create Your First VM
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {operations.map((op) => {
            const isExpanded = Boolean(expandedIds[op.id]);
            const summaryLine = op.failureMessage
              ? op.failureMessage.split("\n")[0]
              : "";
            const fullDiagnostic = op.failureMessage
              ? `Operation ID: ${op.id}\nFailure Code: ${op.failureCode || "UNKNOWN"}\nOpenNebula VM ID: ${op.opennebulaVmId ?? "N/A"}\n\n${op.failureMessage}`
              : "";

            return (
              <div
                key={op.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-bold text-slate-900">
                        {op.requestedName}
                      </span>
                      <StatusBadge status={op.status} />
                      {op.opennebulaVmId !== null && (
                        <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          ONE VM #{op.opennebulaVmId}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-600">
                      {op.operatingSystem?.name} • {op.vcpu} vCPU •{" "}
                      {op.memoryMb} MB RAM • {op.rootDiskGb} GB Disk (
                      {op.requestMode})
                    </div>
                  </div>

                  {op.status === "READY" && (
                    <button
                      onClick={() => onNavigate("my-vms")}
                      className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
                    >
                      View in My VMs
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {op.failureMessage && (
                  <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="break-words">
                        <strong>Reason:</strong> {summaryLine}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleExpand(op.id)}
                        className="text-rose-700 hover:text-rose-950 font-semibold inline-flex items-center gap-1 shrink-0 underline"
                      >
                        {isExpanded ? (
                          <>
                            Show less <ChevronUp className="w-3.5 h-3.5" />
                          </>
                        ) : (
                          <>
                            See more <ChevronDown className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="pt-2 border-t border-rose-200/80 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">
                            Full Error &amp; Diagnostic Log
                          </span>
                          <button
                            type="button"
                            onClick={() => copyError(op.id, fullDiagnostic)}
                            className="px-2 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-900 text-[11px] font-medium inline-flex items-center gap-1"
                          >
                            {copiedId === op.id ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            {copiedId === op.id ? "Copied" : "Copy log"}
                          </button>
                        </div>
                        <pre className="p-2.5 rounded bg-slate-900 text-rose-200 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
                          {fullDiagnostic}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
