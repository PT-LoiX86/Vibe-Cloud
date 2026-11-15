import {
  Cloud,
  LayoutDashboard,
  Layers,
  PlusCircle,
  Activity,
  Server,
  UserCheck,
  HardDrive,
  LogOut,
  User,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

export function Layout({ activeTab, onNavigate, children }) {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const navItems = [
    { id: "dashboard", label: "Overview", icon: LayoutDashboard },
    { id: "catalog", label: "OS & VM Plans", icon: Layers },
    { id: "create-vm", label: "Create a VM", icon: PlusCircle },
    { id: "activity", label: "Provisioning Status", icon: Activity },
    { id: "my-vms", label: "My VMs", icon: Server },
    { id: "profile", label: "My Profile", icon: User },
  ];

  const adminItems = [
    { id: "admin-users", label: "User Approvals", icon: UserCheck },
    { id: "admin-resources", label: "Server Capacity", icon: HardDrive },
    { id: "admin-activity", label: "All Deployments", icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-slate-900 text-slate-100 flex flex-col shrink-0">
        <div className="p-5 border-b border-slate-800 flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-lg">
            <Cloud className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-semibold text-sm tracking-wide">
              Vibe-Cloud
            </div>
            <div className="text-xs text-slate-400">VMs Self-Service</div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Workspace
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  active
                    ? "bg-indigo-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}

          {isAdmin && (
            <>
              <div className="pt-4 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Administration
              </div>
              {adminItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                      active
                        ? "bg-indigo-600 text-white"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </button>
                );
              })}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="text-xs text-slate-400 truncate">{user?.email}</div>
          <div className="text-sm font-medium text-white mb-3">
            @{user?.username}
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 md:p-8 max-w-6xl w-full mx-auto">
        {children}
      </main>
    </div>
  );
}
