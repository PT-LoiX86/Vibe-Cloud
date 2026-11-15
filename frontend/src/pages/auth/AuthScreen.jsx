import { useState } from "react";
import {
  Cloud,
  Mail,
  Lock,
  User,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";

export function AuthScreen() {
  const { login } = useAuth();
  const [view, setView] = useState("login"); // 'login' | 'register' | 'verify'
  const [pendingEmail, setPendingEmail] = useState("");
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    identifier: "",
    code: "",
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const res = await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          username: form.username,
          email: form.email,
          password: form.password,
        }),
      });
      setPendingEmail(res.email);
      setNotice(res.message);
      setView("verify");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const targetEmail = pendingEmail || form.email;
      const res = await apiFetch("/api/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ email: targetEmail, code: form.code }),
      });
      setNotice(res.message);
      setForm((f) => ({ ...f, identifier: targetEmail, code: "" }));
      setView("login");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const res = await apiFetch("/api/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: pendingEmail || form.email }),
      });
      setNotice(res.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await login(form.identifier, form.password);
    } catch (err) {
      if (err.code === "EMAIL_NOT_VERIFIED" && err.data?.email) {
        setPendingEmail(err.data.email);
        setNotice(
          "Your email is not verified yet. Enter the 6-digit code sent to your inbox.",
        );
        setView("verify");
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-indigo-600 rounded-xl text-white">
            <Cloud className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Welcome to Vibe-Cloud!
            </h1>
            <p className="text-xs text-slate-500">
              Your simpler solution to Private IaaS for vibe-coders and
              developers.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {view === "login" && (
          <form onSubmit={handleLogin} className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">
              Sign in to your account
            </h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Username or Email
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  value={form.identifier}
                  onChange={(e) =>
                    setForm({ ...form, identifier: e.target.value })
                  }
                  placeholder="username or you@example.com"
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {busy ? "Signing in..." : "Sign In"}
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="pt-2 text-center text-sm text-slate-600">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setNotice("");
                  setView("register");
                }}
                className="text-indigo-600 font-semibold hover:underline"
              >
                Create an account
              </button>
            </div>
          </form>
        )}

        {view === "register" && (
          <form onSubmit={handleRegister} className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">
              Create your portal account
            </h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Username
              </label>
              <input
                type="text"
                required
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="e.g. loipt"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="you@gmail.com"
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Password (min 8 characters)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Choose a strong password"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-lg transition disabled:opacity-50"
            >
              {busy
                ? "Creating account..."
                : "Register & Send Verification Code"}
            </button>
            <div className="pt-2 text-center text-sm text-slate-600">
              Already registered?{" "}
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setNotice("");
                  setView("login");
                }}
                className="text-indigo-600 font-semibold hover:underline"
              >
                Sign in
              </button>
            </div>
          </form>
        )}

        {view === "verify" && (
          <form onSubmit={handleVerify} className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">
              Verify your email
            </h2>
            <p className="text-sm text-slate-600">
              We sent a 6-digit verification code to{" "}
              <span className="font-semibold">
                {pendingEmail || form.email}
              </span>
              .
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                6-Digit Code
              </label>
              <input
                type="text"
                required
                maxLength={6}
                value={form.code}
                onChange={(e) =>
                  setForm({ ...form, code: e.target.value.replace(/\D/g, "") })
                }
                placeholder="123456"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-center text-lg tracking-widest font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={busy || form.code.length !== 6}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-lg transition disabled:opacity-50"
            >
              {busy ? "Verifying..." : "Verify Email"}
            </button>
            <div className="flex justify-between items-center pt-2 text-xs text-slate-600">
              <button
                type="button"
                onClick={handleResend}
                disabled={busy}
                className="text-indigo-600 font-medium hover:underline"
              >
                Resend verification code
              </button>
              <button
                type="button"
                onClick={() => setView("login")}
                className="hover:underline"
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
