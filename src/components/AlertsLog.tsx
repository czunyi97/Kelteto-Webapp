import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { AlertRow } from "../lib/alerts";

function huLabel(code: string, fallback: string) {
  switch (code) {
    case "TEMP_HIGH_WARN":
      return "Hő magas";
    case "TEMP_HIGH_CRIT":
      return "Hő nagyon magas";
    case "TEMP_LOW_WARN":
      return "Hő alacsony";
    case "TEMP_LOW_CRIT":
      return "Hő nagyon alacsony";

    case "HUM_HIGH_WARN":
      return "Pára magas";
    case "HUM_HIGH_CRIT":
      return "Pára nagyon magas";
    case "HUM_LOW_WARN":
      return "Pára alacsony";
    case "HUM_LOW_CRIT":
      return "Pára nagyon alacsony";

    default:
      return fallback || "Riasztás";
  }
}

function levelBg(level?: string | null) {
  switch ((level ?? "").toLowerCase()) {
    case "red":
      return "#7f1d1d";
    case "yellow":
      return "#854d0e";
    case "purple":
      return "#6b21a8";
    case "blue":
      return "#1e40af";

    // visszafelé kompatibilitás
    case "alert":
      return "#7f1d1d";
    case "warning":
      return "#854d0e";

    default:
      return "#334155";
  }
}

function fmtValue(code?: string | null, value?: number | null) {
  if (value == null) return "";
  const c = (code ?? "").toUpperCase();
  const isHum = c.startsWith("HUM_");
  // ha szeretnéd 1 tizedesre:
  // const v = Math.round(value * 10) / 10;
  const v = value;
  return isHum ? `${v} %` : `${v} °C`;
}

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
          {rows.map((r) => {
            const title = huLabel(r.code ?? "", r.message ?? "");
            const valueStr = fmtValue(r.code, (r.value as unknown as number) ?? null);

            return (
              <div
                key={r.id}
                style={{
                  padding: 14,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,.10)",
                  background: levelBg(r.level),
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 20,
                    fontWeight: 700,
                    color: "white",
                    gap: 14,
                  }}
                >
                  <span style={{ whiteSpace: "nowrap" }}>{title}</span>

                  <span style={{ whiteSpace: "nowrap" }}>
                    {r.value != null ? valueStr : ""}
                  </span>

                  <span style={{ whiteSpace: "nowrap" }}>
                    {new Date(r.ts).toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}