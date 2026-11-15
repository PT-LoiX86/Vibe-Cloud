import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import { StatusBadge } from "../../components/StatusBadge.jsx";

export function AdminActivityPage() {
  const [operations, setOperations] = useState([]);
  const [expandedIds, setExpandedIds] = useState({});

  useEffect(() => {
    apiFetch("/api/admin/provisioning-operations").then((d) =>
      setOperations(d.operations),
    );
  }, []);

  const toggleExpand = (id) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          All User Deployments
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Inspect provisioning operations and diagnose errors across all users.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">VM Name &amp; Diagnostics</th>
              <th className="px-5 py-3">Owner</th>
              <th className="px-5 py-3">Resources</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {operations.map((op) => {
              const isExpanded = Boolean(expandedIds[op.id]);
              const summaryLine = op.failureMessage
                ? op.failureMessage.split("\n")[0]
                : "";

              return (
                <tr key={op.id} className="align-top">
                  <td className="px-5 py-4 max-w-md">
                    <div className="font-semibold text-slate-900">
                      {op.requestedName}
                    </div>
                    {op.opennebulaVmId !== null && (
                      <div className="text-xs font-mono text-slate-500">
                        ONE VM #{op.opennebulaVmId}
                      </div>
                    )}
                    {op.failureMessage && (
                      <div className="mt-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5 space-y-1.5">
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
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-600">
                    @{op.user?.username}
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-600">
                    {op.vcpu} vCPU • {op.memoryMb} MB • {op.rootDiskGb} GB
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={op.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
