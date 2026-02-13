import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation() as any;
  const redirectTo = loc.state?.from ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }
    nav(redirectTo, { replace: true });
  }

  return (
    <div className="container" style={{ maxWidth: 520 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Bejelentkezés</h2>

        {err && (
          <div className="error" style={{ marginBottom: 12 }}>
            <b>Hiba:</b> {err}
          </div>
        )}

        <form onSubmit={onLogin} style={{ display: "grid", gap: 10 }}>
          <label>
            <div className="mini" style={{ marginTop: 0 }}>Email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              style={{
                width: "100%",
                padding: "12px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,.12)",
                background: "rgba(0,0,0,.18)",
                color: "white",
                outline: "none",
              }}
            />
          </label>

          <label>
            <div className="mini" style={{ marginTop: 0 }}>Jelszó</div>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              style={{
                width: "100%",
                padding: "12px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,.12)",
                background: "rgba(0,0,0,.18)",
                color: "white",
                outline: "none",
              }}
            />
          </label>

          <button className="btn" disabled={loading} type="submit" style={{ marginTop: 8 }}>
            {loading ? "Beléptetés…" : "Belépés"}
          </button>
        </form>
      </div>
    </div>
  );
}