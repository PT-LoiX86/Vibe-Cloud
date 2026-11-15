import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { AuthScreen } from "./pages/auth/AuthScreen.jsx";
import { PendingActivationScreen } from "./pages/auth/PendingActivationScreen.jsx";
import { Layout } from "./components/Layout.jsx";
import { DashboardPage } from "./pages/user/DashboardPage.jsx";
import { CatalogPage } from "./pages/user/CatalogPage.jsx";
import { CreateVmPage } from "./pages/user/CreateVmPage.jsx";
import { ActivityPage } from "./pages/user/ActivityPage.jsx";
import { MyVmsPage } from "./pages/user/MyVmsPage.jsx";
import { ProfilePage } from "./pages/user/ProfilePage.jsx";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage.jsx";
import { AdminResourcesPage } from "./pages/admin/AdminResourcesPage.jsx";
import { AdminActivityPage } from "./pages/admin/AdminActivityPage.jsx";

function PortalShell() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");

  useEffect(() => {
    setActiveTab("dashboard");
  }, [user?.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
        Loading portal...
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (user.accountStatus !== "ACTIVE") {
    return <PendingActivationScreen />;
  }

  const isAdmin = user.role === "ADMIN";

  return (
    <Layout activeTab={activeTab} onNavigate={setActiveTab}>
      {activeTab === "dashboard" && <DashboardPage onNavigate={setActiveTab} />}
      {activeTab === "catalog" && <CatalogPage onNavigate={setActiveTab} />}
      {activeTab === "create-vm" && <CreateVmPage onNavigate={setActiveTab} />}
      {activeTab === "activity" && <ActivityPage onNavigate={setActiveTab} />}
      {activeTab === "my-vms" && <MyVmsPage onNavigate={setActiveTab} />}
      {activeTab === "profile" && <ProfilePage />}

      {activeTab === "admin-users" &&
        (isAdmin ? (
          <AdminUsersPage />
        ) : (
          <DashboardPage onNavigate={setActiveTab} />
        ))}
      {activeTab === "admin-resources" &&
        (isAdmin ? (
          <AdminResourcesPage />
        ) : (
          <DashboardPage onNavigate={setActiveTab} />
        ))}
      {activeTab === "admin-activity" &&
        (isAdmin ? (
          <AdminActivityPage />
        ) : (
          <DashboardPage onNavigate={setActiveTab} />
        ))}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PortalShell />
    </AuthProvider>
  );
}
