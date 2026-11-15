import { useEffect, useState, useCallback, useRef } from "react";
import {
  Server,
  Copy,
  Check,
  RefreshCw,
  Play,
  Square,
  RotateCw,
  Trash2,
  PowerOff,
  AlertTriangle,
  ShieldCheck,
  Terminal,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  Activity,
  Cpu,
  MemoryStick,
  HardDrive,
} from "lucide-react";
import { apiFetch } from "../../api/client.js";
import {
  StatusBadge,
  LIFECYCLE_ACTION_LABELS,
} from "../../components/StatusBadge.jsx";

export function MyVmsPage({ onNavigate }) {
  const [vms, setVms] = useState([]);
  const [selectedVmId, setSelectedVmId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [includeTerminated, setIncludeTerminated] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [terminalOs, setTerminalOs] = useState("linux"); // 'linux' | 'windows'
  const [submittingVmId, setSubmittingVmId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [openPowerMenu, setOpenPowerMenu] = useState(null); // 'reboot' | 'stop' | null
  const [confirmModal, setConfirmModal] = useState(null); // { vm, action }
  const [confirmNameInput, setConfirmNameInput] = useState("");
  const powerMenuRef = useRef(null);

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      const query = includeTerminated ? "?includeTerminated=true" : "";
      apiFetch(`/api/vms${query}`)
        .then((d) => setVms(d.virtualMachines || []))
        .catch((err) => setActionError(err.message))
        .finally(() => {
          if (!silent) setLoading(false);
        });
    },
    [includeTerminated],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  // Poll every 3s while any VM has a lifecycle transition in progress, otherwise every 15s
  useEffect(() => {
    const hasActiveTransition = vms.some((v) => Boolean(v.activeOperation));
    const interval = hasActiveTransition ? 3000 : 15000;
    const timer = setInterval(() => load(true), interval);
    return () => clearInterval(timer);
  }, [vms, load]);

  // Return to the list if the selected VM is terminated and hidden by the filter
  useEffect(() => {
    if (selectedVmId && !loading && !vms.some((v) => v.id === selectedVmId)) {
      setSelectedVmId(null);
      setOpenPowerMenu(null);
    }
  }, [vms, selectedVmId, loading]);

  // Close Reboot / Stop dropdown when clicking outside
  useEffect(() => {
    if (!openPowerMenu) return;
    const handleClickOutside = (e) => {
      if (powerMenuRef.current && !powerMenuRef.current.contains(e.target)) {
        setOpenPowerMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openPowerMenu]);

  const copyCommand = (id, cmd) => {
    navigator.clipboard.writeText(cmd);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const dispatchAction = async (vm, action) => {
    setActionError("");
    setSubmittingVmId(vm.id);
    try {
      await apiFetch(`/api/vms/${vm.id}/actions`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      await load(true);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSubmittingVmId(null);
      setConfirmModal(null);
      setConfirmNameInput("");
    }
  };

  const requestAction = (vm, action) => {
    setOpenPowerMenu(null);
    if (["FORCE_STOP", "FORCE_REBOOT", "TERMINATE"].includes(action)) {
      setConfirmNameInput("");
      setConfirmModal({ vm, action });
      return;
    }
    dispatchAction(vm, action);
  };

  const buildSshCommand = (vm) => {
    const sshUser = vm.operatingSystem?.defaultSshUser || "root";
    const ip = vm.ipAddress || "<assigning-ip>";
    const keyFile = `${vm.name}-key.pem`;

    if (terminalOs === "windows") {
      return `ssh -i "$HOME\\Downloads\\${keyFile}" ${sshUser}@${ip}`;
    }
    return `chmod 600 ${keyFile} && ssh -i ${keyFile} ${sshUser}@${ip}`;
  };

  const selectedVm = vms.find((v) => v.id === selectedVmId) || null;

  const renderConfirmModal = () => {
    if (!confirmModal) return null;
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {confirmModal.action === "TERMINATE"
                  ? `Permanently Terminate "${confirmModal.vm.name}"?`
                  : `Confirm ${LIFECYCLE_ACTION_LABELS[confirmModal.action]?.verb} on "${confirmModal.vm.name}"`}
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                {confirmModal.action === "TERMINATE"
                  ? "This will permanently delete the virtual machine, wipe its root disk, and release your quota. This action cannot be undone."
                  : "Forcing an immediate power action without graceful guest shutdown may cause unsaved data loss inside the VM."}
              </p>
            </div>
          </div>

          {confirmModal.action === "TERMINATE" && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Type{" "}
                <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                  {confirmModal.vm.name}
                </code>{" "}
                to confirm:
              </label>
              <input
                type="text"
                value={confirmNameInput}
                onChange={(e) => setConfirmNameInput(e.target.value)}
                placeholder={confirmModal.vm.name}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setConfirmModal(null);
                setConfirmNameInput("");
              }}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                submittingVmId === confirmModal.vm.id ||
                (confirmModal.action === "TERMINATE" &&
                  confirmNameInput !== confirmModal.vm.name)
              }
              onClick={() =>
                dispatchAction(confirmModal.vm, confirmModal.action)
              }
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold"
            >
              {submittingVmId === confirmModal.vm.id
                ? "Submitting..."
                : `Confirm ${LIFECYCLE_ACTION_LABELS[confirmModal.action]?.verb}`}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Detail View when a specific VM is clicked
  if (selectedVm) {
    const activeOp = selectedVm.activeOperation;
    const isBusy = Boolean(activeOp) || submittingVmId === selectedVm.id;
    const isTerminated = selectedVm.status === "TERMINATED";
    const isStopped = ["UNDEPLOYED", "POWEROFF", "SUSPENDED"].includes(
      selectedVm.status,
    );
    const isActive = selectedVm.status === "ACTIVE";
    const sshCmd = buildSshCommand(selectedVm);

    const badgeStatus = activeOp ? activeOp.status : selectedVm.status;
    const badgeLabel = activeOp
      ? LIFECYCLE_ACTION_LABELS[activeOp.action]?.transitional
      : null;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setSelectedVmId(null);
              setOpenPowerMenu(null);
              setActionError("");
            }}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to My VMs
          </button>

          <button
            type="button"
            onClick={() => load(true)}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sync Status
          </button>
        </div>

        {actionError && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
            {actionError}
          </div>
        )}

        {/* VM Header & Hardware Specs */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold text-slate-900">
                  {selectedVm.name}
                </h1>
                <StatusBadge status={badgeStatus} customLabel={badgeLabel} />
                <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                  ONE ID #{selectedVm.opennebulaVmId}
                </span>
                {selectedVm.hasManagedKey && !isTerminated && (
                  <span
                    title={`Portal Key Vault Fingerprint: ${selectedVm.keyFingerprint}`}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full"
                  >
                    <ShieldCheck className="w-3 h-3" />
                    Console Key Ready
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {selectedVm.operatingSystem?.name}
                {selectedVm.ipAddress && isActive && (
                  <>
                    {" "}
                    • IP Address:{" "}
                    <code className="font-mono text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
                      {selectedVm.ipAddress}
                    </code>
                  </>
                )}
                {selectedVm.lastSyncedAt && (
                  <>
                    {" "}
                    • Last synced:{" "}
                    {new Date(selectedVm.lastSyncedAt).toLocaleTimeString()}
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
            <div className="bg-slate-50 rounded-xl p-3.5 flex items-center gap-3">
              <Cpu className="w-5 h-5 text-indigo-600 shrink-0" />
              <div>
                <div className="text-[11px] text-slate-500">Compute</div>
                <div className="text-sm font-bold text-slate-900">
                  {selectedVm.vcpu} vCPU ({selectedVm.cpuCapacity} units)
                </div>
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3.5 flex items-center gap-3">
              <MemoryStick className="w-5 h-5 text-indigo-600 shrink-0" />
              <div>
                <div className="text-[11px] text-slate-500">Memory</div>
                <div className="text-sm font-bold text-slate-900">
                  {selectedVm.memoryMb} MB RAM
                </div>
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3.5 flex items-center gap-3">
              <HardDrive className="w-5 h-5 text-indigo-600 shrink-0" />
              <div>
                <div className="text-[11px] text-slate-500">Root Storage</div>
                <div className="text-sm font-bold text-slate-900">
                  {selectedVm.rootDiskGb} GB Disk
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Lifecycle & Power Controls Card */}
        {!isTerminated && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Power &amp; Lifecycle Controls
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isStopped
                  ? "This VM is stopped and its RAM/CPU are released back to the host while preserving your disk data."
                  : "Manage instance power states or permanently terminate this virtual machine."}
              </p>
            </div>

            {activeOp && (
              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-800 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>
                  Operation in progress:{" "}
                  <strong>
                    {LIFECYCLE_ACTION_LABELS[activeOp.action]?.transitional ||
                      activeOp.action}
                  </strong>
                  . Controls will re-enable automatically once OpenNebula
                  confirms the new state.
                </span>
              </div>
            )}

            <div
              ref={powerMenuRef}
              className="flex flex-wrap items-center gap-2.5"
            >
              {isStopped && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => requestAction(selectedVm, "START")}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  Start VM
                </button>
              )}

              {isActive && (
                <>
                  {/* Reboot Dropdown Button */}
                  <div className="relative">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        setOpenPowerMenu((prev) =>
                          prev === "reboot" ? null : "reboot",
                        )
                      }
                      aria-expanded={openPowerMenu === "reboot"}
                      className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      Reboot
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${
                          openPowerMenu === "reboot" ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {openPowerMenu === "reboot" && !isBusy && (
                      <div className="absolute left-0 mt-1.5 w-56 rounded-xl bg-white border border-slate-200 shadow-lg py-1.5 z-20">
                        <button
                          type="button"
                          onClick={() => requestAction(selectedVm, "REBOOT")}
                          className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-start gap-2.5"
                        >
                          <RotateCw className="w-3.5 h-3.5 text-slate-600 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-xs font-semibold text-slate-900">
                              Reboot
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            requestAction(selectedVm, "FORCE_REBOOT")
                          }
                          className="w-full px-3.5 py-2 text-left hover:bg-rose-50/70 flex items-start gap-2.5 border-t border-slate-100"
                        >
                          <RotateCw className="w-3.5 h-3.5 text-rose-600 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-xs font-semibold text-rose-700">
                              Force Reboot
                            </div>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Stop Dropdown Button */}
                  <div className="relative">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        setOpenPowerMenu((prev) =>
                          prev === "stop" ? null : "stop",
                        )
                      }
                      aria-expanded={openPowerMenu === "stop"}
                      className="px-3.5 py-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-800 text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Square className="w-3.5 h-3.5" />
                      Stop
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${
                          openPowerMenu === "stop" ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {openPowerMenu === "stop" && !isBusy && (
                      <div className="absolute left-0 mt-1.5 w-60 rounded-xl bg-white border border-slate-200 shadow-lg py-1.5 z-20">
                        <button
                          type="button"
                          onClick={() => requestAction(selectedVm, "STOP")}
                          className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-start gap-2.5"
                        >
                          <Square className="w-3.5 h-3.5 text-amber-700 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-xs font-semibold text-slate-900">
                              Stop
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            requestAction(selectedVm, "FORCE_STOP")
                          }
                          className="w-full px-3.5 py-2 text-left hover:bg-rose-50/70 flex items-start gap-2.5 border-t border-slate-100"
                        >
                          <PowerOff className="w-3.5 h-3.5 text-rose-600 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-xs font-semibold text-rose-700">
                              Force Stop
                            </div>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}

              <button
                type="button"
                disabled={isBusy}
                onClick={() => requestAction(selectedVm, "TERMINATE")}
                className="px-3.5 py-2 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 text-xs font-semibold inline-flex items-center gap-1.5 sm:ml-auto"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Terminate
              </button>
            </div>
          </div>
        )}

        {/* SSH Connection Helper for Running VMs */}
        {isActive && !isTerminated && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-indigo-600" />
                  Local Terminal SSH Command
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Run this command in your terminal from the folder containing
                  your downloaded{" "}
                  <code className="bg-slate-100 px-1 rounded">.pem</code> key.
                </p>
              </div>
              <div className="inline-flex rounded-lg bg-slate-100 p-1 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setTerminalOs("linux")}
                  className={`px-3 py-1 rounded-md transition ${
                    terminalOs === "linux"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600"
                  }`}
                >
                  Linux
                </button>
                <button
                  type="button"
                  onClick={() => setTerminalOs("windows")}
                  className={`px-3 py-1 rounded-md transition ${
                    terminalOs === "windows"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600"
                  }`}
                >
                  Windows
                </button>
              </div>
            </div>

            <div className="bg-slate-900 text-slate-100 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <code className="text-xs font-mono text-emerald-400 overflow-x-auto whitespace-nowrap">
                {sshCmd}
              </code>
              <button
                type="button"
                onClick={() => copyCommand(selectedVm.id, sshCmd)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium inline-flex items-center gap-1.5 shrink-0"
              >
                {copiedId === selectedVm.id ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copiedId === selectedVm.id ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {/* VM Status & Monitoring Slot (Slice 2 Target) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-600" />
                VM Status &amp; Resource Monitoring
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Current runtime state:{" "}
                <strong className="text-slate-700">{selectedVm.status}</strong>{" "}
                ({selectedVm.lcmState || "N/A"})
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center space-y-1">
            <div className="text-xs font-semibold text-slate-700">
              Live &amp; All-Time Telemetry Charts (Slice 2)
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              CPU utilization, memory usage, network throughput, disk I/O
              charts, and the All-Time Status history viewer will render here
              for this VM.
            </p>
          </div>
        </div>

        {renderConfirmModal()}
      </div>
    );
  }

  // List View of User's Virtual Machines
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            My Virtual Machines
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Click on a virtual machine to manage power actions, view SSH
            details, or monitor resource usage.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeTerminated}
              onChange={(e) => setIncludeTerminated(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Show terminated
          </label>

          <button
            onClick={() => load(false)}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sync Status
          </button>
        </div>
      </div>

      {actionError && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          {actionError}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Loading your VMs...</div>
      ) : vms.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
          <Server className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm text-slate-600">
            No virtual machines found. Check Provisioning Status if you just
            created one.
          </p>
          <button
            onClick={() => onNavigate("create-vm")}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium"
          >
            Create a VM
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {vms.map((vm) => {
            const activeOp = vm.activeOperation;
            const isTerminated = vm.status === "TERMINATED";
            const isActive = vm.status === "ACTIVE";

            const badgeStatus = activeOp ? activeOp.status : vm.status;
            const badgeLabel = activeOp
              ? LIFECYCLE_ACTION_LABELS[activeOp.action]?.transitional
              : null;

            return (
              <button
                key={vm.id}
                type="button"
                onClick={() => {
                  setActionError("");
                  setOpenPowerMenu(null);
                  setSelectedVmId(vm.id);
                }}
                className={`w-full text-left bg-white border rounded-2xl p-5 flex items-center justify-between gap-4 transition cursor-pointer ${
                  isTerminated
                    ? "border-slate-200 opacity-70 hover:opacity-90"
                    : "border-slate-200 hover:border-indigo-300 hover:shadow-xs"
                }`}
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="text-base font-bold text-slate-900 truncate">
                      {vm.name}
                    </h2>
                    <StatusBadge
                      status={badgeStatus}
                      customLabel={badgeLabel}
                    />
                    <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      ONE ID #{vm.opennebulaVmId}
                    </span>
                    {vm.hasManagedKey && !isTerminated && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                        <ShieldCheck className="w-3 h-3" />
                        Console Key Ready
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {vm.operatingSystem?.name} • {vm.vcpu} vCPU • {vm.memoryMb}{" "}
                    MB RAM • {vm.rootDiskGb} GB Disk
                    {vm.ipAddress && isActive && (
                      <>
                        {" "}
                        • IP:{" "}
                        <code className="font-mono text-slate-700">
                          {vm.ipAddress}
                        </code>
                      </>
                    )}
                  </div>
                </div>

                <div className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 shrink-0">
                  <span>Manage</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {renderConfirmModal()}
    </div>
  );
}
