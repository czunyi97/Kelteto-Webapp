import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { AlertRow } from "../lib/alerts";

export default function AlertsLog({ deviceId }: { deviceId: string }) {
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

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

  useEffect(() => {
    load();
    // csak akkor frissítünk, ha nyitva van a fül (a parent fogja kezelni),
    // de egy egyszerű 20 mp-es frissítés itt is oké:
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [deviceId]);

  return (
    <div style={{ background: "#1e293b", borderRadius: 14, padding: 14, border: "1px solid rgba(255,255,255,.08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Riasztás napló</h3>
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
      </div>

      {loading && <p style={{ marginTop: 12 }}>Betöltés…</p>}
      {!loading && err && (
        <div style={{ background: "#7f1d1d", padding: 12, borderRadius: 12, marginTop: 12 }}>
          <b>Hiba:</b> {err}
        </div>
      )}

      {!loading && !err && rows.length === 0 && (
        <div style={{ marginTop: 12, opacity: 0.85 }}>
          Nincs riasztás naplózva ennél az eszköznél.
        </div>
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
                <span style={{ opacity: 0.85, fontSize: 12 }}>
                  {new Date(r.ts).toLocaleString()}
                </span>
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