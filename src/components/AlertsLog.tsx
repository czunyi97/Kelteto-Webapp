import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { AlertRow } from "../lib/alerts";

export default function AlertsLog({ deviceId }: { deviceId: string }) {
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [busyClear, setBusyClear] = useState(false);
  const [showClear, setShowClear] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  async function load() {
    setLoading(true);
    setErr("");

    const { data, error } = await supabase
      .from("alerts")
      .select("id, device_id, ts, level, code, message, value")
      .eq("device_id", deviceId)
      .order("ts", { ascending: false })
      .limit(200);

    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as AlertRow[]);
    setLoading(false);
  }

  async function clearAlerts() {
    // Dupla biztosítás: UI + backend (itt legalább UI-s)
    if (confirmText.trim().toUpperCase() !== "TÖRLÉS") {
      setErr('Megerősítés kell: írd be pontosan, hogy "TÖRLÉS".');
      return;
    }

    setBusyClear(true);
    setErr("");

    const { error } = await supabase.from("alerts").delete().eq("device_id", deviceId);

    if (error) {
      setErr(error.message);
      setBusyClear(false);
      return;
    }

    setRows([]);
    setConfirmText("");
    setShowClear(false);
    setBusyClear(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [deviceId]);

  return (
    <div
      style={{
        background: "#1e293b",
        borderRadius: 14,
        padding: 14,
        border: "1px solid rgba(255,255,255,.08)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Riasztás napló</h3>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={load}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,.15)",
              background: "#111827",
              color: "white",
              cursor: "pointer",
            }}
          >
            Frissítés
          </button>

          <button
            onClick={() => {
              setErr("");
              setConfirmText("");
              setShowClear(true);
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,.15)",
              background: "#7f1d1d",
              color: "white",
              cursor: "pointer",
            }}
            title="Riasztási napló törlése"
          >
            Törlés
          </button>
        </div>
      </div>

      {/* ✅ Törlés megerősítő doboz */}
      {showClear && (
        <div
          style={{
            marginTop: 12,
            borderRadius: 12,
            padding: 12,
            border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(0,0,0,.18)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Riasztási napló törlése</div>
          <div style={{ opacity: 0.9, fontSize: 13, marginBottom: 10 }}>
            Ez törli az eszköz összes riasztását. Nem visszavonható.
            <br />
            Megerősítéshez írd be: <b>TÖRLÉS</b>
          </div>

          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder='Írd be: TÖRLÉS'
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,.15)",
              background: "#111827",
              color: "white",
              outline: "none",
            }}
          />

          <div style={{ display: "flex", gap: 10, marginTop: 10, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => {
                setShowClear(false);
                setConfirmText("");
                setErr("");
              }}
              disabled={busyClear}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,.15)",
                background: "#111827",
                color: "white",
                cursor: "pointer",
                opacity: busyClear ? 0.7 : 1,
              }}
            >
              Mégse
            </button>

            <button
              type="button"
              onClick={clearAlerts}
              disabled={busyClear}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,.15)",
                background: "#7f1d1d",
                color: "white",
                cursor: "pointer",
                opacity: busyClear ? 0.7 : 1,
              }}
            >
              {busyClear ? "Törlés…" : "Végleges törlés"}
            </button>
          </div>
        </div>
      )}

      {loading && <p style={{ marginTop: 12 }}>Betöltés…</p>}
      {!loading && err && (
        <div style={{ background: "#7f1d1d", padding: 12, borderRadius: 12, marginTop: 12 }}>
          <b>Hiba:</b> {err}
        </div>
      )}

      {!loading && !err && rows.length === 0 && (
        <div style={{ marginTop: 12, opacity: 0.85 }}>Nincs riasztás naplózva ennél az eszköznél.</div>
      )}

      {!loading && !err && rows.length > 0 && (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {rows.map((r) => (
            <div
              key={r.id}
              style={{
                padding: 12,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,.08)",
                background: r.level === "alert" ? "#7f1d1d" : "#854d0e",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <b>{r.message}</b>
                <span style={{ opacity: 0.85, fontSize: 12 }}>{new Date(r.ts).toLocaleString()}</span>
              </div>
              <div style={{ marginTop: 6, opacity: 0.9, fontSize: 13 }}>
                Kód: {r.code} {r.value != null ? ` • Érték: ${r.value}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}