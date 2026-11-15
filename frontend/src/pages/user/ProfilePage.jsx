import { ExternalLink } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';

export function ProfilePage() {
  const { user } = useAuth();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Profile & Cloud Identity</h1>
        <p className="text-sm text-slate-600 mt-1">
          Your portal account is automatically mapped to an isolated OpenNebula user identity.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 text-sm">
        <div className="flex justify-between py-2 border-b border-slate-100">
          <span className="text-slate-500">Portal Username</span>
          <span className="font-semibold text-slate-900">@{user?.username}</span>
        </div>
        <div className="flex justify-between py-2 border-b border-slate-100">
          <span className="text-slate-500">Email Address</span>
          <span className="font-medium text-slate-900">{user?.email}</span>
        </div>
        <div className="flex justify-between py-2 border-b border-slate-100">
          <span className="text-slate-500">Account Status</span>
          <StatusBadge status={user?.accountStatus} />
        </div>
        <div className="flex justify-between py-2 border-b border-slate-100">
          <span className="text-slate-500">Mapped OpenNebula Username</span>
          <code className="font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
            {user?.opennebulaUsername || 'Not mapped'}
          </code>
        </div>
        <div className="flex justify-between py-2 border-b border-slate-100">
          <span className="text-slate-500">OpenNebula User ID</span>
          <span className="font-mono text-slate-800">{user?.opennebulaUserId ?? '—'}</span>
        </div>
        <div className="flex justify-between items-center pt-2">
          <span className="text-slate-500">Native OpenNebula Interface</span>
          <a
            href={user?.opennebulaUiUrl}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 hover:underline font-medium inline-flex items-center gap-1"
          >
            Open Sunstone ({user?.opennebulaUiUrl})
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
