import { useEffect, useState, useCallback } from "react";
import { UserCheck, UserX, Ban, SlidersHorizontal } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import { StatusBadge } from "../../components/StatusBadge.jsx";

export function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState("PENDING_ADMIN_ACTIVATION");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [quotaModalUser, setQuotaModalUser] = useState(null);
  const [quotaForm, setQuotaForm] = useState({
    quotaMaxVms: 2,
    quotaMaxMemoryMb: 3072,
    quotaMaxCpu: 2,
    quotaMaxDiskGb: 20,
  });

  const load = useCallback(() => {
    const query = filter ? `?status=${encodeURIComponent(filter)}` : "";
    apiFetch(`/api/admin/users${query}`).then((d) => setUsers(d.users));
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAction = async (userId, action) => {
    setError("");
    setMessage("");
    setBusyId(userId);
    try {
      const res = await apiFetch(`/api/admin/users/${userId}/${action}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setMessage(res.message);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const openQuotaModal = (u) => {
    setQuotaForm({
      quotaMaxVms: u.quotaMaxVms ?? 2,
      quotaMaxMemoryMb: u.quotaMaxMemoryMb ?? 3072,
      quotaMaxCpu: u.quotaMaxCpu ?? 2,
      quotaMaxDiskGb: u.quotaMaxDiskGb ?? 20,
    });
    setQuotaModalUser(u);
  };

  const saveQuota = async (e) => {
    e.preventDefault();
    if (!quotaModalUser) return;
    setError("");
    setMessage("");
    setBusyId(quotaModalUser.id);
    try {
      const res = await apiFetch(
        `/api/admin/users/${quotaModalUser.id}/quota`,
        {
          method: "PUT",
          body: JSON.stringify({
            quotaMaxVms: Number(quotaForm.quotaMaxVms),
            quotaMaxMemoryMb: Number(quotaForm.quotaMaxMemoryMb),
            quotaMaxCpu: Number(quotaForm.quotaMaxCpu),
            quotaMaxDiskGb: Number(quotaForm.quotaMaxDiskGb),
          }),
        },
      );
      setMessage(res.message);
      setQuotaModalUser(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            User Approvals &amp; Quotas
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Activate verified users and synchronize resource allowances across
            PostgreSQL and OpenNebula.
          </p>
        </div>

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm"
        >
          <option value="PENDING_ADMIN_ACTIVATION">Awaiting Activation</option>
          <option value="ACTIVE">Active Users</option>
          <option value="PENDING_EMAIL_VERIFICATION">Unverified Email</option>
          <option value="">All Accounts</option>
        </select>
      </div>

      {message && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
          {message}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Quota Allowance</th>
              <th className="px-5 py-3">OpenNebula ID</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-8 text-center text-slate-500"
                >
                  No users match this filter.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-900">
                      @{u.username}
                    </div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={u.accountStatus} />
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-600">
                    {u.quotaMaxVms} VMs • {u.quotaMaxMemoryMb} MB •{" "}
                    {u.quotaMaxCpu} CPU • {u.quotaMaxDiskGb} GB
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-slate-600">
                    {u.opennebulaUsername
                      ? `${u.opennebulaUsername} (#${u.opennebulaUserId})`
                      : "—"}
                  </td>
                  <td className="px-5 py-4 text-right space-x-2">
                    {u.role !== "ADMIN" && (
                      <button
                        type="button"
                        disabled={busyId === u.id}
                        onClick={() => openQuotaModal(u)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        Quota
                      </button>
                    )}

                    {u.accountStatus === "PENDING_ADMIN_ACTIVATION" && (
                      <>
                        <button
                          disabled={busyId === u.id}
                          onClick={() => handleAction(u.id, "activate")}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          {busyId === u.id ? "Provisioning..." : "Activate"}
                        </button>
                        <button
                          disabled={busyId === u.id}
                          onClick={() => handleAction(u.id, "reject")}
                          className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </>
                    )}
                    {u.accountStatus === "ACTIVE" && u.role !== "ADMIN" && (
                      <button
                        disabled={busyId === u.id}
                        onClick={() => handleAction(u.id, "suspend")}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        Suspend
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Quota Modal */}
      {quotaModalUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={saveQuota}
            className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Edit Resource Quota — @{quotaModalUser.username}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Updates PostgreSQL limits and pushes immediately to OpenNebula.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Max VMs
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  required
                  value={quotaForm.quotaMaxVms}
                  onChange={(e) =>
                    setQuotaForm({ ...quotaForm, quotaMaxVms: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Max Memory (MB)
                </label>
                <input
                  type="number"
                  min={256}
                  max={16384}
                  step={256}
                  required
                  value={quotaForm.quotaMaxMemoryMb}
                  onChange={(e) =>
                    setQuotaForm({
                      ...quotaForm,
                      quotaMaxMemoryMb: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Max CPU Units
                </label>
                <input
                  type="number"
                  min={0.5}
                  max={16}
                  step={0.5}
                  required
                  value={quotaForm.quotaMaxCpu}
                  onChange={(e) =>
                    setQuotaForm({ ...quotaForm, quotaMaxCpu: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Max Storage (GB)
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  required
                  value={quotaForm.quotaMaxDiskGb}
                  onChange={(e) =>
                    setQuotaForm({
                      ...quotaForm,
                      quotaMaxDiskGb: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setQuotaModalUser(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyId === quotaModalUser.id}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
              >
                {busyId === quotaModalUser.id
                  ? "Syncing..."
                  : "Save & Sync Quota"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
