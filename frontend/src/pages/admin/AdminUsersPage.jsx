import { useEffect, useState } from 'react';
import { UserCheck, UserX, Ban } from 'lucide-react';
import { apiFetch } from '../../api/client.js';
import { StatusBadge } from '../../components/StatusBadge.jsx';

export function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('PENDING_ADMIN_ACTIVATION');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    const query = filter ? `?status=${encodeURIComponent(filter)}` : '';
    apiFetch(`/api/admin/users${query}`).then((d) => setUsers(d.users));
  };

  useEffect(() => {
    load();
  }, [filter]);

  const handleAction = async (userId, action) => {
    setError('');
    setMessage('');
    setBusyId(userId);
    try {
      const res = await apiFetch(`/api/admin/users/${userId}/${action}`, {
        method: 'POST',
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Approvals & Accounts</h1>
          <p className="text-sm text-slate-600 mt-1">
            Activate verified users to provision their isolated OpenNebula identity and resource quota.
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

      {message && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">{message}</div>}
      {error && <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">OpenNebula ID</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-slate-500">No users match this filter.</td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-900">@{u.username}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={u.accountStatus} />
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-slate-600">
                    {u.opennebulaUsername ? `${u.opennebulaUsername} (#${u.opennebulaUserId})` : '—'}
                  </td>
                  <td className="px-5 py-4 text-right space-x-2">
                    {u.accountStatus === 'PENDING_ADMIN_ACTIVATION' && (
                      <>
                        <button
                          disabled={busyId === u.id}
                          onClick={() => handleAction(u.id, 'activate')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          {busyId === u.id ? 'Provisioning...' : 'Activate'}
                        </button>
                        <button
                          disabled={busyId === u.id}
                          onClick={() => handleAction(u.id, 'reject')}
                          className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </>
                    )}
                    {u.accountStatus === 'ACTIVE' && u.role !== 'ADMIN' && (
                      <button
                        disabled={busyId === u.id}
                        onClick={() => handleAction(u.id, 'suspend')}
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
    </div>
  );
}
