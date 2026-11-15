import { useEffect, useState, useCallback } from "react";
import {
  RefreshCw,
  Server,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from "lucide-react";
import { apiFetch } from "../../api/client.js";
import {
  StatusBadge,
  LIFECYCLE_ACTION_LABELS,
} from "../../components/StatusBadge.jsx";

export function ActivityPage({ onNavigate }) {
  const [provisionOps, setProvisionOps] = useState([]);
  const [lifecycleOps, setLifecycleOps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState({});
  const [copiedId, setCopiedId] = useState(null);

  const load = useCallback(() => {
    Promise.all([
      apiFetch("/api/provisioning-operations"),
      apiFetch("/api/lifecycle-operations"),
    ])
      .then(([provData, lifeData]) => {
        setProvisionOps(provData.operations || []);
        setLifecycleOps(lifeData.operations || []);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [load]);

  const toggleExpand = (id) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyError = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Provisioning &amp; Activity Status
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Completed builds move automatically to My VMs and clear from this
            list once ready or after termination.
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
      ) : (
        <>
          {/* Section 1: Active & Failed VM Creation Requests */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-slate-800">
              Active &amp; Failed Builds
            </h2>
            {provisionOps.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
                <p className="text-sm text-slate-600">
                  No active or failed VM builds. Ready virtual machines appear
                  directly in My VMs.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => onNavigate("my-vms")}
                    className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium inline-flex items-center gap-1.5"
                  >
                    <Server className="w-4 h-4" />
                    Go to My VMs
                  </button>
                  <button
                    onClick={() => onNavigate("create-vm")}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
                  >
                    Create a VM
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {provisionOps.map((op) => {
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
                                  Show less{" "}
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </>
                              ) : (
                                <>
                                  See more{" "}
                                  <ChevronDown className="w-3.5 h-3.5" />
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
                                  onClick={() =>
                                    copyError(op.id, fullDiagnostic)
                                  }
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
          </section>

          {/* Section 2: Power & Lifecycle Operations */}
          {lifecycleOps.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-slate-800">
                Lifecycle Actions History
              </h2>
              <div className="space-y-3">
                {lifecycleOps.map((op) => {
                  const isExpanded = Boolean(expandedIds[op.id]);
                  const summaryLine = op.failureMessage
                    ? op.failureMessage.split("\n")[0]
                    : "";
                  const actionLabel =
                    LIFECYCLE_ACTION_LABELS[op.action]?.verb || op.action;

                  return (
                    <div
                      key={op.id}
                      className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {actionLabel}
                          </span>
                          <span className="font-semibold text-sm text-slate-900">
                            {op.virtualMachine?.name ||
                              `VM #${op.opennebulaVmId}`}
                          </span>
                          <span className="text-xs font-mono text-slate-500">
                            #{op.opennebulaVmId}
                          </span>
                          <StatusBadge status={op.status} />
                        </div>
                        <span className="text-xs text-slate-500">
                          {new Date(op.createdAt).toLocaleString()}
                        </span>
                      </div>

                      {op.failureMessage && (
                        <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-2.5 space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <span className="break-words">{summaryLine}</span>
                            <button
                              type="button"
                              onClick={() => toggleExpand(op.id)}
                              className="font-semibold underline inline-flex items-center gap-0.5 shrink-0"
                            >
                              {isExpanded ? (
                                <>
                                  Less <ChevronUp className="w-3 h-3" />
                                </>
                              ) : (
                                <>
                                  See more <ChevronDown className="w-3 h-3" />
                                </>
                              )}
                            </button>
                          </div>
                          {isExpanded && (
                            <pre className="p-2 rounded bg-slate-900 text-rose-200 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                              {`Code: ${op.failureCode || "UNKNOWN"}\n${op.failureMessage}`}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
