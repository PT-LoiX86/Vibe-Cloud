import { useEffect, useState } from "react";
import {
  KeyRound,
  Download,
  CheckCircle2,
  Sparkles,
  Sliders,
} from "lucide-react";
import { apiFetch } from "../../api/client.js";

export function CreateVmPage({ onNavigate }) {
  const [operatingSystems, setOperatingSystems] = useState([]);
  const [offerings, setOfferings] = useState([]);
  const [resources, setResources] = useState(null);

  const [mode, setMode] = useState("PRESET"); // 'PRESET' | 'CUSTOM'
  const [selectedOsId, setSelectedOsId] = useState("");
  const [selectedOfferingId, setSelectedOfferingId] = useState("");
  const [customConfig, setCustomConfig] = useState({
    vcpu: 1,
    memoryMb: 512,
    rootDiskGb: 2,
  });
  const [vmName, setVmName] = useState("");
  const [sshPublicKey, setSshPublicKey] = useState("");
  const [generatedKeyDownloaded, setGeneratedKeyDownloaded] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const [submitting, setSubmitting] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      apiFetch("/api/catalog/operating-systems"),
      apiFetch("/api/catalog/offerings"),
      apiFetch("/api/resources/me"),
    ]).then(([osData, offData, resData]) => {
      setOperatingSystems(osData.operatingSystems);
      setOfferings(offData.offerings);
      setResources(resData);
      if (osData.operatingSystems[0]) {
        const firstOs = osData.operatingSystems[0];
        setSelectedOsId(firstOs.id);
        const pol = firstOs.customPolicies?.[0];
        if (pol) {
          setCustomConfig({
            vcpu: pol.minVcpu,
            memoryMb: pol.minMemoryMb,
            rootDiskGb: pol.minDiskGb,
          });
        }
      }
      if (offData.offerings[0]) {
        setSelectedOfferingId(offData.offerings[0].id);
      }
    });
  }, []);

  const activeOs = operatingSystems.find((o) => o.id === selectedOsId);
  const customPolicy = activeOs?.customPolicies?.[0];

  const handleGenerateOneClickKey = async () => {
    setError("");
    setGeneratingKey(true);
    try {
      const res = await apiFetch("/api/vms/generate-ssh-key", {
        method: "POST",
        body: JSON.stringify({ vmName: vmName || "my-vm" }),
      });
      setSshPublicKey(res.publicKey);

      // Trigger automatic browser download of the private .pem file
      const blob = new Blob([res.privateKeyPem], {
        type: "application/x-pem-file",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setGeneratedKeyDownloaded(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await apiFetch("/api/vms", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey,
          mode,
          name: vmName,
          operatingSystemId: selectedOsId,
          vmOfferingId: mode === "PRESET" ? selectedOfferingId : null,
          customConfig: mode === "CUSTOM" ? customConfig : null,
          sshPublicKey,
        }),
      });
      onNavigate("activity");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const uq = resources?.userQuotas;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Create a Virtual Machine
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Choose a ready-made plan for fast setup or customize CPU, RAM, and
          disk within your quota.
        </p>
      </div>

      {uq && (
        <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-4 text-xs text-indigo-900 flex flex-wrap gap-4">
          <span>
            <strong>Quota Used:</strong> {uq.vms.used}/{uq.vms.limit ?? "∞"} VMs
          </span>
          <span>
            <strong>RAM:</strong> {uq.memoryMb.used}/{uq.memoryMb.limit ?? "∞"}{" "}
            MB
          </span>
          <span>
            <strong>Storage:</strong> {Math.round(uq.diskMb.used / 1024)}/
            {uq.diskMb.limit ? Math.round(uq.diskMb.limit / 1024) : "∞"} GB
          </span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: OS & Name */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold text-slate-900">
            Step 1 — Name & Operating System
          </h2>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Virtual Machine Name
            </label>
            <input
              type="text"
              required
              value={vmName}
              onChange={(e) => setVmName(e.target.value)}
              placeholder="e.g. web-lab-01"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <p className="text-xs text-slate-500 mt-1">
              Use letters, numbers, hyphens, or underscores (no spaces).
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Operating System
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {operatingSystems.map((os) => (
                <button
                  type="button"
                  key={os.id}
                  onClick={() => setSelectedOsId(os.id)}
                  className={`p-4 rounded-xl border text-left transition ${
                    selectedOsId === os.id
                      ? "border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="font-semibold text-sm text-slate-900">
                    {os.name}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 line-clamp-2">
                    {os.description}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Step 2: Sizing Mode */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">
              Step 2 — Choose Size
            </h2>
            <div className="inline-flex rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setMode("PRESET")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                  mode === "PRESET"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Quick Preset
              </button>
              <button
                type="button"
                onClick={() => setMode("CUSTOM")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                  mode === "CUSTOM"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600"
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                Custom Size
              </button>
            </div>
          </div>

          {mode === "PRESET" ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {offerings.map((plan) => (
                <button
                  type="button"
                  key={plan.id}
                  onClick={() => setSelectedOfferingId(plan.id)}
                  className={`p-4 rounded-xl border text-left transition ${
                    selectedOfferingId === plan.id
                      ? "border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="text-xs font-medium text-indigo-600">
                    {plan.workloadTag}
                  </div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {plan.name}
                  </div>
                  <div className="text-xs text-slate-600 mt-2 space-y-0.5">
                    <div>{plan.vcpu} vCPU</div>
                    <div>{plan.memoryMb} MB RAM</div>
                    <div>{plan.rootDiskGb} GB Disk</div>
                  </div>
                </button>
              ))}
            </div>
          ) : customPolicy ? (
            <div className="space-y-4 pt-1">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-slate-700">vCPU Cores</span>
                  <span className="font-semibold text-indigo-600">
                    {customConfig.vcpu} vCPU
                  </span>
                </div>
                <input
                  type="range"
                  min={customPolicy.minVcpu}
                  max={customPolicy.maxVcpu}
                  step={customPolicy.stepVcpu}
                  value={customConfig.vcpu}
                  onChange={(e) =>
                    setCustomConfig({
                      ...customConfig,
                      vcpu: Number(e.target.value),
                    })
                  }
                  className="w-full accent-indigo-600"
                />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-slate-700">
                    Memory (RAM)
                  </span>
                  <span className="font-semibold text-indigo-600">
                    {customConfig.memoryMb} MB
                  </span>
                </div>
                <input
                  type="range"
                  min={customPolicy.minMemoryMb}
                  max={customPolicy.maxMemoryMb}
                  step={customPolicy.stepMemoryMb}
                  value={customConfig.memoryMb}
                  onChange={(e) =>
                    setCustomConfig({
                      ...customConfig,
                      memoryMb: Number(e.target.value),
                    })
                  }
                  className="w-full accent-indigo-600"
                />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-slate-700">
                    Root Disk Size
                  </span>
                  <span className="font-semibold text-indigo-600">
                    {customConfig.rootDiskGb} GB
                  </span>
                </div>
                <input
                  type="range"
                  min={customPolicy.minDiskGb}
                  max={customPolicy.maxDiskGb}
                  step={customPolicy.stepDiskGb}
                  value={customConfig.rootDiskGb}
                  onChange={(e) =>
                    setCustomConfig({
                      ...customConfig,
                      rootDiskGb: Number(e.target.value),
                    })
                  }
                  className="w-full accent-indigo-600"
                />
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-500">
              Custom sizing is not configured for this OS.
            </div>
          )}
        </div>

        {/* Step 3: Low-tech friendly SSH Key Setup */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-indigo-600" />
                Step 3 — SSH Login Key
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Don&apos;t have an SSH key? Generate one automatically and save
                the downloaded{" "}
                <code className="bg-slate-100 px-1 rounded">.pem</code> file.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerateOneClickKey}
              disabled={generatingKey}
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition"
            >
              <Download className="w-3.5 h-3.5" />
              {generatingKey
                ? "Generating..."
                : "1-Click Generate & Download Key"}
            </button>
          </div>

          {generatedKeyDownloaded && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Private key downloaded! Keep that <strong>.pem</strong> file
                safe.
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Public Key (auto-filled or paste yours)
            </label>
            <textarea
              required
              rows={3}
              value={sshPublicKey}
              onChange={(e) => setSshPublicKey(e.target.value)}
              placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-xl transition disabled:opacity-50"
        >
          {submitting ? "Submitting Request..." : "Create Virtual Machine"}
        </button>
      </form>
    </div>
  );
}
