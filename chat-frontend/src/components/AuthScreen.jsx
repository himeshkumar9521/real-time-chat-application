import { useEffect, useState } from "react";
import { api } from "../api";
import {
  FiMessageCircle,
  FiMail,
  FiLock,
  FiUser,
  FiArrowRight,
} from "react-icons/fi";

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  useEffect(() => {
    if (window.location.pathname !== "/verify-email") return;
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setError("Verification token is missing.");
      return;
    }
    let active = true;
    api(`/api/user/email-verify?token=${encodeURIComponent(token)}`)
      .then((result) => {
        if (active)
          setSuccess(result.message || "Email verified. You can now sign in.");
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    window.history.replaceState({}, "", "/");
    return () => {
      active = false;
    };
  }, []);
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const update = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      if (mode === "register") {
        const result = await api("/api/user/register", {
          method: "POST",
          body: JSON.stringify(form),
        });
        setSuccess(
          result.message ||
            "Registration complete. Check your email to verify your account.",
        );
        setMode("login");
      } else {
        const result = await api("/api/user/log-in", {
          method: "POST",
          body: JSON.stringify({ email: form.email, password: form.password }),
        });
        onAuthenticated(result);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-layout">
      <section className="auth-visual">
        <div className="brand brand-light">
          <span className="brand-icon">
            <FiMessageCircle />
          </span>
          <span>chatter</span>
        </div>
        <div className="visual-copy">
          <div className="eyebrow">YOUR SPACE TO CONNECT</div>
          <h1>
            Good conversations
            <br />
            start <em>here.</em>
          </h1>
          <p>
            A calmer place for your teams, groups, and one-to-one conversations.
          </p>
          <div className="visual-bubbles">
            <span>Hey, how are you? 👋</span>
            <span className="bubble-right">Doing great! ✨</span>
            <span>Let's catch up soon.</span>
          </div>
        </div>
        <div className="visual-footer">
          Thoughtful conversations, beautifully simple.
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="mobile-brand">
            <span className="brand-icon">
              <FiMessageCircle />
            </span>{" "}
            chatter
          </div>
          <div className="eyebrow">
            {mode === "login" ? "WELCOME BACK" : "GET STARTED"}
          </div>
          <h2>
            {mode === "login" ? "Sign in to Chatter" : "Create your account"}
          </h2>
          <p className="muted">
            {mode === "login"
              ? "Pick up right where your conversations left off."
              : "Join the conversation. It only takes a moment."}
          </p>
          <div className="auth-tabs">
            <button
              className={mode === "login" ? "selected" : ""}
              onClick={() => {
                setMode("login");
                setError("");
                setSuccess("");
              }}>
              Sign in
            </button>
            <button
              className={mode === "register" ? "selected" : ""}
              onClick={() => {
                setMode("register");
                setError("");
                setSuccess("");
              }}>
              Create account
            </button>
          </div>
          <form onSubmit={submit} className="auth-form">
            {mode === "register" && (
              <label>
                Username
                <div className="input-wrap">
                  <FiUser />
                  <input
                    name="username"
                    value={form.username}
                    onChange={update}
                    placeholder="Your name"
                    minLength="2"
                    maxLength="30"
                    pattern="[A-Za-z]{2,30}"
                    required
                  />
                </div>
                <small>2–30 English letters, no spaces.</small>
              </label>
            )}
            <label>
              Email address
              <div className="input-wrap">
                <FiMail />
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={update}
                  placeholder="you@example.com"
                  required
                />
              </div>
            </label>
            <label>
              Password
              <div className="input-wrap">
                <FiLock />
                <input
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={update}
                  placeholder="Enter your password"
                  minLength={mode === "register" ? 8 : undefined}
                  required
                />
              </div>
            </label>
            {mode === "register" && (
              <label>
                Confirm password
                <div className="input-wrap">
                  <FiLock />
                  <input
                    type="password"
                    name="confirmPassword"
                    value={form.confirmPassword}
                    onChange={update}
                    placeholder="Repeat your password"
                    required
                  />
                </div>
                <small>
                  Use 8+ characters with uppercase, lowercase, number and
                  !@#$%^&*.
                </small>
              </label>
            )}
            {error && <div className="form-alert error">{error}</div>}
            {success && <div className="form-alert success">{success}</div>}
            <button className="primary-button full" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}{" "}
              <FiArrowRight />
            </button>
          </form>
          <p className="auth-legal">
            By continuing, you agree to keep conversations respectful and
            secure.
          </p>
        </div>
      </section>
    </main>
  );
}
