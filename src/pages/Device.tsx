import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import Chart24h from "../components/Chart24h";
import ChartDailyAvg from "../components/ChartDailyAvg";
import AlertsLog from "../components/AlertsLog";

type AnimalRow = { id: string; name_hu: string | null };
type AnimalJoin = { name_hu: string | null } | null;

type StateRow = {
  device_id: string;
  animal_type: string | null;
  day: number | null;
  temp: number | null;
  hum: number | null;

  // ✅ ESP küldi: target + tol
  target_temp: number | null;
  tol_temp: number | null;
  target_hum: number | null;
  tol_hum: number | null;

  updated_at: string | null;

  // ✅ JOIN-ból jönhet (device_state.animal_type -> animals.id)
  animals?: AnimalJoin;
};

type MeasurementRow = {
  ts: string;
  temp: number | null;
  hum: number | null;
};

type DailyAvgRow = {
  day: string; // YYYY-MM-DD
  temp_avg: number | null;
  hum_avg: number | null;
};

function fmt(n: number | null, digits = 1) {
  if (n == null || Number.isNaN(n)) return "-";
  return n.toFixed(digits);
}

export default function Device() {
  const nav = useNavigate();
  const { deviceId } = useParams<{ deviceId: string }>();

  const [tab, setTab] = useState<"overview" | "alerts">("overview");
  const [chartMode, setChartMode] = useState<"24h" | "daily">("24h");
  const [dailyRange, setDailyRange] = useState<7 | 21 | 28>(7);

  const [state, setState] = useState<StateRow | null>(null);
  const [rows24h, setRows24h] = useState<MeasurementRow[]>([]);
  const [dailyAvg, setDailyAvg] = useState<DailyAvgRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // ✅ Állat fordító cache (id -> magyar név), realtime esetére is
  const [animalMap, setAnimalMap] = useState<Record<string, string>>({});

  // Online/offline pill frissítéshez
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // ✅ animals tábla betöltése egyszer (ha RLS engedi a selectet)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("animals").select("id, name_hu");
      if (cancelled) return;
      if (error) {
        // nem blokkoljuk az oldalt, csak fallback lesz az animal_type
        console.warn("[animals select]", error.message);
        return;
      }
      const rows = (data ?? []) as AnimalRow[];
      const map: Record<string, string> = {};
      for (const r of rows) {
        if (r.id) map[r.id] = r.name_hu ?? r.id;
      }
      setAnimalMap(map);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const since24hIso = useMemo(
    () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    []
  );

  const sinceDailyIso = useMemo(() => {
    return new Date(Date.now() - dailyRange * 24 * 60 * 60 * 1000).toISOString();
  }, [dailyRange]);

  // ✅ állat megjelenítési név (JOIN -> cache -> fallback)
  const animalLabel =
    state?.animals?.name_hu ??
    (state?.animal_type ? animalMap[state.animal_type] : undefined) ??
    state?.animal_type ??
    "-";

  // 1) állapot + 24h mérések (page load / device váltás)
  useEffect(() => {
    if (!deviceId) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr("");

      const s = await supabase
        .from("device_state")
        .select(`
          device_id,
          animal_type,
          day,
          temp,
          hum,
          target_temp,
          tol_temp,
          target_hum,
          tol_hum,
          updated_at,
          animals ( name_hu )
        `)
        .eq("device_id", deviceId)
        .maybeSingle();

      if (cancelled) return;

      if (s.error) {
        setErr(s.error.message);
        setLoading(false);
        return;
      }
      setState((s.data ?? null) as StateRow | null);

      const m = await supabase
        .from("measurements")
        .select("ts, temp, hum")
        .eq("device_id", deviceId)
        .gte("ts", since24hIso)
        .order("ts", { ascending: true });

      if (cancelled) return;

      if (m.error) {
        setErr(m.error.message);
        setLoading(false);
        return;
      }

      setRows24h((m.data ?? []) as MeasurementRow[]);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [deviceId, since24hIso]);

  // 1/b) realtime: device_state élő frissítés
  useEffect(() => {
    if (!deviceId) return;

    const ch = supabase
      .channel(`device_state:${deviceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "device_state", filter: `device_id=eq.${deviceId}` },
        (payload) => {
          if (!payload.new) return;

          // ⚠️ Realtime payload.new nem tartalmaz join adatot, ezért megőrizzük a régit,
          // és a megjelenítéshez használjuk az animalMap fallbackot.
          setState((prev) => {
            const next = payload.new as StateRow;
            const prevAnimals = prev?.animals;
            const sameType = prev?.animal_type && next?.animal_type && prev.animal_type === next.animal_type;

            return {
              ...next,
              animals: sameType ? prevAnimals : undefined,
            };
          });
        }
      )
      .subscribe();

    return () => {
      ch.unsubscribe();
    };
  }, [deviceId]);

  // 2) napi átlag (csak ha daily mód)
  useEffect(() => {
    if (!deviceId) return;
    if (tab !== "overview") return;
    if (chartMode !== "daily") return;

    let cancelled = false;

    (async () => {
      setErr("");

      const m = await supabase
        .from("measurements")
        .select("ts, temp, hum")
        .eq("device_id", deviceId)
        .gte("ts", sinceDailyIso)
        .order("ts", { ascending: true });

      if (cancelled) return;

      if (m.error) {
        setErr(m.error.message);
        return;
      }

      const data = (m.data ?? []) as MeasurementRow[];

      // Napi átlag (UTC nap szerint, stabil)
      const byDay = new Map<string, { tSum: number; tN: number; hSum: number; hN: number }>();

      for (const r of data) {
        const day = new Date(r.ts).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
        if (!byDay.has(day)) byDay.set(day, { tSum: 0, tN: 0, hSum: 0, hN: 0 });
        const agg = byDay.get(day)!;

        if (r.temp != null && !Number.isNaN(r.temp)) {
          agg.tSum += r.temp;
          agg.tN += 1;
        }
        if (r.hum != null && !Number.isNaN(r.hum)) {
          agg.hSum += r.hum;
          agg.hN += 1;
        }
      }

      const out: DailyAvgRow[] = Array.from(byDay.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, a]) => ({
          day,
          temp_avg: a.tN ? Math.round((a.tSum / a.tN) * 10) / 10 : null,
          hum_avg: a.hN ? Math.round((a.hSum / a.hN) * 10) / 10 : null,
        }));

      setDailyAvg(out);
    })();

    return () => {
      cancelled = true;
    };
  }, [deviceId, tab, chartMode, sinceDailyIso, dailyRange]);

  // --- Online / Offline + állapot szöveg (✅ részletes hibák) ---
  const updatedMs = state?.updated_at ? new Date(state.updated_at).getTime() : 0;
  const online = !!updatedMs && nowTick - updatedMs < 3 * 60 * 1000;

  const tTarget = state?.target_temp ?? 37.8;
  const tTol = state?.tol_temp ?? 0.5;
  const tMin = tTarget - tTol;
  const tMax = tTarget + tTol;

  const hTarget = state?.target_hum ?? 55.0;
  const hTol = state?.tol_hum ?? 5.0;
  const hMin = hTarget - hTol;
  const hMax = hTarget + hTol;

  // ✅ hibák listája (vegyesen is)
  const issues: string[] = [];
  if (online) {
    if (state?.temp != null && !Number.isNaN(state.temp)) {
      if (state.temp < tMin) issues.push("Hő alacsony");
      else if (state.temp > tMax) issues.push("Hő magas");
    }
    if (state?.hum != null && !Number.isNaN(state.hum)) {
      if (state.hum < hMin) issues.push("Pára alacsony");
      else if (state.hum > hMax) issues.push("Pára magas");
    }
  }

  // ✅ pill + rövid összefoglaló szöveg
  let pillClass = "pill ok";
  let pillText = "OK";

  if (!online) {
    pillClass = "pill offline";
    pillText = "Offline";
  } else if (issues.length) {
    const hasTempIssue = issues.some((x) => x.startsWith("Hő "));
    pillClass = hasTempIssue ? "pill alert" : "pill warn";
    pillText = issues.join(" • ");
  }

  const statusSummary = !online ? "Offline" : issues.length ? issues.join(" • ") : "OK";

  return (
    <div className="container">
      <div className="topbar safeTop compactHeader">
        <div className="headerLeft">
          <button className="backBtn" type="button" onClick={() => nav("/")}>
            ← Vissza
          </button>

          <div className="headerTitleRow">
            <h1>{state?.device_id ?? deviceId ?? "Eszköz"}</h1>
            <span className={pillClass}>{pillText}</span>
          </div>
        </div>
      </div>

      {loading && <div className="empty">Betöltés…</div>}

      {!loading && err && (
        <div className="error">
          <b>Hiba:</b> {err}
        </div>
      )}

      {!loading && !err && (
        <div className="deviceLayout">
          <div style={{ display: "grid", gap: 14 }}>
            <div className="card">
              <div className="row">
                <div>
                  <div className="sectionTitle">Áttekintés</div>
                  <div className="badgeRow">
                    <span className="badge">
                      Állat: <b>{animalLabel}</b>
                    </span>
                    <span className="badge">
                      Nap: <b>{state?.day ?? "-"}</b>
                    </span>
                    <span className="badge">
                      Cél T:{" "}
                      <b>
                        {fmt(state?.target_temp ?? null)} ± {fmt(state?.tol_temp ?? null)} °C
                      </b>
                    </span>
                    <span className="badge">
                      Cél H:{" "}
                      <b>
                        {fmt(state?.target_hum ?? null)} ± {fmt(state?.tol_hum ?? null)} %
                      </b>
                    </span>
                  </div>
                </div>

                <div className="mini" style={{ textAlign: "right", marginTop: 0 }}>
                  Frissítve
                  <br />
                  {state?.updated_at ? new Date(state.updated_at).toLocaleString() : "-"}
                </div>
              </div>

              <div className="kpis" style={{ marginTop: 14 }}>
                <div className="kpi">
                  <div className="label">Hőmérséklet</div>
                  <div className="value">🌡 {fmt(state?.temp ?? null)} °C</div>
                  <div className="mini" style={{ marginTop: 6 }}>
                    Sáv:{" "}
                    <b>
                      {tMin.toFixed(1)} – {tMax.toFixed(1)} °C
                    </b>
                  </div>
                </div>
                <div className="kpi">
                  <div className="label">Páratartalom</div>
                  <div className="value">💧 {fmt(state?.hum ?? null)} %</div>
                  <div className="mini" style={{ marginTop: 6 }}>
                    Sáv:{" "}
                    <b>
                      {hMin.toFixed(0)} – {hMax.toFixed(0)} %
                    </b>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="tabs" style={{ margin: 0 }}>
                <button
                  type="button"
                  className={`tab ${tab === "overview" ? "active" : ""}`}
                  onClick={() => setTab("overview")}
                >
                  Grafikon
                </button>
                <button
                  type="button"
                  className={`tab ${tab === "alerts" ? "active" : ""}`}
                  onClick={() => setTab("alerts")}
                  title={statusSummary}
                >
                  Riasztás napló{online && issues.length ? ` • ${issues.join(" • ")}` : ""}
                </button>
              </div>
              <div className="mini" style={{ marginTop: 10 }}>
                Grafikon: 24 órás idősor vagy napi átlag (7/21/28 nap).
              </div>
            </div>
          </div>

          <div>
            {tab === "overview" ? (
              <>
                <div className="tabs" style={{ marginTop: 0, marginBottom: 12 }}>
                  <button
                    type="button"
                    className={`tab ${chartMode === "24h" ? "active" : ""}`}
                    onClick={() => setChartMode("24h")}
                  >
                    24 óra
                  </button>
                  <button
                    type="button"
                    className={`tab ${chartMode === "daily" ? "active" : ""}`}
                    onClick={() => setChartMode("daily")}
                  >
                    Napi átlag
                  </button>
                </div>

                {chartMode === "daily" && (
                  <div className="tabs" style={{ marginTop: 0, marginBottom: 12 }}>
                    {[7, 21, 28].map((d) => (
                      <button
                        key={d}
                        type="button"
                        className={`tab ${dailyRange === d ? "active" : ""}`}
                        onClick={() => setDailyRange(d as 7 | 21 | 28)}
                      >
                        {d} nap
                      </button>
                    ))}
                  </div>
                )}

                {chartMode === "24h" ? (
                  rows24h.length === 0 ? (
                    <div className="empty">
                      <b>Nincs 24 órás mérés adat</b>
                      <div className="mini">
                        Akkor lesz grafikon, ha van rekord a <code>measurements</code> táblában.
                      </div>
                    </div>
                  ) : (
                    <Chart24h data={rows24h} />
                  )
                ) : dailyAvg.length === 0 ? (
                  <div className="empty">
                    <b>Nincs napi átlag adat ({dailyRange} nap)</b>
                    <div className="mini">Tölts több mérést, vagy válts vissza 24 órára.</div>
                  </div>
                ) : (
                  <ChartDailyAvg data={dailyAvg} />
                )}
              </>
            ) : deviceId ? (
              <>
                {/* ✅ nyitott nézet tetején is ugyanaz a szöveg */}
                <div className="card" style={{ marginBottom: 12 }}>
                  <div className="row">
                    <div className="sectionTitle">Aktuális állapot</div>
                    <div className="mini" style={{ marginTop: 0 }}>
                      <b>{statusSummary}</b>
                    </div>
                  </div>
                </div>

                <AlertsLog deviceId={deviceId} />
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}