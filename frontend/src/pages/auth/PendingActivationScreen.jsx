import { Clock, LogOut, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';

export function PendingActivationScreen() {
  const { user, logout, refreshMe } = useAuth();

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-5">
        <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
          <Clock className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <StatusBadge status={user?.accountStatus} />
          <h1 className="text-xl font-bold text-slate-900">Your email is verified!</h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Hello <span className="font-semibold">@{user?.username}</span>, your account is currently awaiting administrator activation. Once approved, your OpenNebula workspace will be created automatically and you will be able to launch virtual machines.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={refreshMe}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Check Approval Status
          </button>
          <button
            onClick={logout}
            className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium inline-flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
