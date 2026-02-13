import { useNavigate } from "react-router-dom";

type Props = {
  deviceId: string;
  name?: string | null;
  location?: string | null;

  animal: string | null;
  day: number | null;
  temp: number | null;
  hum: number | null;

  // ✅ ESP küldi (device_state-ből)
  targetTemp?: number | null;
  tolTemp?: number | null;
  targetHum?: number | null;
  tolHum?: number | null;

  updatedAt: string | null;
};

function fmt(n: number | null | undefined, digits = 1) {
  if (n == null || Number.isNaN(n)) return "-";
  return n.toFixed(digits);
}

export default function DeviceCard({
  deviceId,
  name,
  location,
  animal,
  day,
  temp,
  hum,
  targetTemp,
  tolTemp,
  targetHum,
  tolHum,
  updatedAt,
}: Props) {
  const nav = useNavigate();

  const updatedMs = updatedAt ? new Date(updatedAt).getTime() : 0;
  const online = !!updatedMs && Date.now() - updatedMs < 3 * 60 * 1000;

  // fallback, ha még NULL a device_state-ben
  const tTarget = targetTemp ?? 37.8;
  const tTol = tolTemp ?? 0.5;
  const tMin = tTarget - tTol;
  const tMax = tTarget + tTol;

  const hTarget = targetHum ?? 55.0;
  const hTol = tolHum ?? 5.0;
  const hMin = hTarget - hTol;
  const hMax = hTarget + hTol;

  // ✅ pontos hibák összeállítása (vegyesen is)
  const issues: string[] = [];
  if (online) {
    if (temp != null && !Number.isNaN(temp)) {
      if (temp < tMin) issues.push("Hő alacsony");
      else if (temp > tMax) issues.push("Hő magas");
    }
    if (hum != null && !Number.isNaN(hum)) {
      if (hum < hMin) issues.push("Pára alacsony");
      else if (hum > hMax) issues.push("Pára magas");
    }
  }

  // pill
  let pillClass = "pill ok";
  let pillText = "OK";

  if (!online) {
    pillClass = "pill offline";
    pillText = "Offline";
  } else if (issues.length > 0) {
    const hasTempIssue = issues.some((x) => x.startsWith("Hő"));
    pillClass = hasTempIssue ? "pill alert" : "pill warn";
    pillText = issues.join(" + ");
  }

  return (
    <button
      type="button"
      className="card cardBtn"
      onClick={() => nav(`/device/${encodeURIComponent(deviceId)}`)}
    >
      <div className="row">
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {name || deviceId}
            {location && (
              <span style={{ fontWeight: 400, opacity: 0.7 }}> ({location})</span>
            )}
          </div>

          <div className="mini" style={{ marginTop: 4 }}>
            ID: <b style={{ color: "var(--text)" }}>{deviceId}</b>
          </div>

          <div className="mini" style={{ marginTop: 4 }}>
            Állat: <b style={{ color: "var(--text)" }}>{animal ?? "-"}</b> • Nap:{" "}
            <b style={{ color: "var(--text)" }}>{day ?? "-"}</b>
          </div>

          {/* ✅ opcionális: kártyán is látszódjon a sáv (hogy tuti egyezzen) */}
          <div className="mini" style={{ marginTop: 4, opacity: 0.85 }}>
            Cél T: <b>{fmt(tTarget)} ± {fmt(tTol)} °C</b> • Cél H:{" "}
            <b>{fmt(hTarget, 0)} ± {fmt(hTol, 0)} %</b>
          </div>
        </div>

        <span className={pillClass}>{pillText}</span>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="label">Hőmérséklet</div>
          <div className="value">🌡 {fmt(temp)} °C</div>
        </div>
        <div className="kpi">
          <div className="label">Páratartalom</div>
          <div className="value">💧 {fmt(hum)} %</div>
        </div>
      </div>

      <div className="mini">
        Frissítve: {updatedAt ? new Date(updatedAt).toLocaleString() : "-"} • Részletek →
      </div>
    </button>
  );
}