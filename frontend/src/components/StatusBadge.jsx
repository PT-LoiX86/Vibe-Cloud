const STYLES = {
  READY: "bg-emerald-50 text-emerald-700 border-emerald-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  RUNNING: "bg-emerald-50 text-emerald-700 border-emerald-200",
  UNDEPLOYED: "bg-slate-100 text-slate-700 border-slate-300",
  POWEROFF: "bg-slate-100 text-slate-700 border-slate-300",
  SUSPENDED: "bg-amber-50 text-amber-700 border-amber-200",
  TERMINATED: "bg-zinc-100 text-zinc-500 border-zinc-200",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  SUBMITTING: "bg-blue-50 text-blue-700 border-blue-200",
  PROVISIONING: "bg-indigo-50 text-indigo-700 border-indigo-200",
  IN_PROGRESS: "bg-indigo-50 text-indigo-700 border-indigo-200",
  PENDING_ADMIN_ACTIVATION: "bg-amber-50 text-amber-700 border-amber-200",
  PENDING_EMAIL_VERIFICATION: "bg-slate-100 text-slate-700 border-slate-200",
  FAILED: "bg-rose-50 text-rose-700 border-rose-200",
  ERROR: "bg-rose-50 text-rose-700 border-rose-200",
  REJECTED: "bg-rose-50 text-rose-700 border-rose-200",
};

const LABELS = {
  READY: "Ready",
  COMPLETED: "Completed",
  ACTIVE: "Running",
  RUNNING: "Running",
  UNDEPLOYED: "Stopped (Undeployed)",
  POWEROFF: "Powered Off",
  SUSPENDED: "Suspended",
  TERMINATED: "Terminated",
  PENDING: "Queued",
  SUBMITTING: "Submitting...",
  PROVISIONING: "Booting VM...",
  IN_PROGRESS: "In Progress...",
  PENDING_ADMIN_ACTIVATION: "Awaiting Admin Approval",
  PENDING_EMAIL_VERIFICATION: "Email Unverified",
  FAILED: "Failed",
  ERROR: "Error",
  REJECTED: "Rejected",
};

export const LIFECYCLE_ACTION_LABELS = {
  START: { verb: "Start", transitional: "Starting..." },
  STOP: { verb: "Stop", transitional: "Stopping..." },
  FORCE_STOP: { verb: "Force Stop", transitional: "Force Stopping..." },
  REBOOT: { verb: "Reboot", transitional: "Rebooting..." },
  FORCE_REBOOT: { verb: "Force Reboot", transitional: "Force Rebooting..." },
  TERMINATE: { verb: "Terminate", transitional: "Terminating..." },
};

export function StatusBadge({ status, customLabel = null }) {
  const style =
    STYLES[status] || "bg-slate-100 text-slate-700 border-slate-200";
  const label = customLabel || LABELS[status] || status;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${style}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
