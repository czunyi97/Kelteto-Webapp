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

  target_temp: number | null;
  tol_temp: number | null;
  target_hum: number | null;
  tol_hum: number | null;

  updated_at: string | null;
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

type CycleRow = {
  id: string;
  animal_type: string;
  started_at: string;
  ended_at: string | null;
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

  const [animalMap, setAnimalMap] = useState<Record<string, string>>({});

  const [cycles, setCycles] = useState<CycleRow[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);

  // Új ciklus UI
  const [showNewCycle, setShowNewCycle] = useState(false);
  const [newAnimalType, setNewAnimalType] = useState<string>("");
  const [newStartDate, setNewStartDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [busyCycle, setBusyCycle] = useState(false);

  // Teljes törlés (csúszkás megerősítés)
  const [showWipe, setShowWipe] = useState(false);
  const [wipeSlide, setWipeSlide] = useState(0);
  const [busyWipe, setBusyWipe] = useState(false);

  // Recharts újramount (finom anim reset)
  const [chartKey24, setChartKey24] = useState(0);
  const [chartKeyDaily, setChartKeyDaily] = useState(0);

  // Online/offline pill frissítéshez
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // animals tábla betöltése egyszer
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("animals").select("id, name_hu");
      if (cancelled) return;
      if (error) {
        console.warn("[animals select]", error.message);
        return;
      }
      const rows = (data ?? []) as AnimalRow[];
      const map: Record<string, string> = {};
      for (const r of rows) if (r.id) map[r.id] = r.name_hu ?? r.id;
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

  const animalLabel =
    state?.animals?.name_hu ??
    (state?.animal_type ? animalMap[state.animal_type] : undefined) ??
    state?.animal_type ??
    "-";

  // ====== CYCLE HELPERS ======
  async function loadCycles(device_id: string) {
    const { data, error } = await supabase
      .from("cycles")
      .select("id, animal_type, started_at, ended_at")
      .eq("device_id", device_id)
      .order("started_at", { ascending: false });

    if (error) throw error;
    return (data ?? []) as CycleRow[];
  }

  async function loadCurrentCycleId(device_id: string) {
    const { data, error } = await supabase
      .from("devices")
      .select("current_cycle_id")
      .eq("device_id", device_id)
      .single();

    if (error) throw error;
    return (data?.current_cycle_id as string | null) ?? null;
  }

  // Új ciklus indítás
  async function startNewCycle(device_id: string, animal_type: string, startedAtISO: string) {
    const { data: cycle, error: e1 } = await supabase
      .from("cycles")
      .insert({
        device_id,
        animal_type,
        started_at: startedAtISO,
      })
      .select("id, animal_type, started_at, ended_at")
      .single();

    if (e1) throw e1;

    const { error: e2 } = await supabase
      .from("devices")
      .update({ current_cycle_id: cycle.id })
      .eq("device_id", device_id);

    if (e2) throw e2;

    return cycle as CycleRow;
  }

  // 24h adatok törlése (eldobható)
  async function clear24h(device_id: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("measurements")
      .delete()
      .eq("device_id", device_id)
      .gte("ts", since);

    if (error) throw error;
  }

  // Teljes törlés
  async function fullWipeDevice(device_id: string) {
    const m = await supabase.from("measurements").delete().eq("device_id", device_id);
    if (m.error) throw m.error;

    const a = await supabase.from("alerts").delete().eq("device_id", device_id);
    if (a.error) throw a.error;

    const c = await supabase.from("cycles").delete().eq("device_id", device_id);
    if (c.error) throw c.error;

    const d = await supabase
      .from("devices")
      .update({ current_cycle_id: null })
      .eq("device_id", device_id);
    if (d.error) throw d.error;
  }

  // 1) állapot + 24h mérések + ciklusok (page load / device váltás)
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

      // ciklus lista + aktuális ciklus
      try {
        const [cList, curId] = await Promise.all([loadCycles(deviceId), loadCurrentCycleId(deviceId)]);
        setCycles(cList);
        setSelectedCycleId(curId ?? (cList[0]?.id ?? null));
      } catch (e: any) {
        console.warn("[cycles load]", e?.message ?? e);
      }

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

          setState((prev) => {
            const next = payload.new as StateRow;
            const prevAnimals = prev?.animals;
            const sameType =
              prev?.animal_type && next?.animal_type && prev.animal_type === next.animal_type;

            return { ...next, animals: sameType ? prevAnimals : undefined };
          });
        }
      )
      .subscribe();

    return () => {
      ch.unsubscribe();
    };
  }, [deviceId]);

  // 2) NAPI ÁTLAG (csak daily módban) — ✅ ciklus alapján, cycle_id nélkül
  useEffect(() => {
    if (!deviceId) return;
    if (!selectedCycleId) return;
    if (tab !== "overview") return;
    if (chartMode !== "daily") return;

    const selectedCycle = cycles.find((c) => c.id === selectedCycleId);
    if (!selectedCycle) return;

    // a ciklus kezdete/ vége
    const startISO = selectedCycle.started_at;
    const endISO = selectedCycle.ended_at ?? new Date().toISOString();

    // az UI 7/21/28 nap gomb csak “megjelenítés” legyen: alsó korlát a startISO-hoz képest
    const rangeStartISO = new Date(Date.now() - dailyRange * 24 * 60 * 60 * 1000).toISOString();
    const effectiveStartISO = rangeStartISO > startISO ? rangeStartISO : startISO;

    let cancelled = false;

    (async () => {
      setErr("");

      const m = await supabase
        .from("measurements")
        .select("ts, temp, hum")
        .eq("device_id", deviceId)
        .gte("ts", effectiveStartISO)
        .lt("ts", endISO)
        .order("ts", { ascending: true });

      if (cancelled) return;

      if (m.error) {
        setErr(m.error.message);
        return;
      }

      const data = (m.data ?? []) as MeasurementRow[];

      const byDay = new Map<string, { tSum: number; tN: number; hSum: number; hN: number }>();
      for (const r of data) {
        const day = new Date(r.ts).toISOString().slice(0, 10); // UTC nap
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
  }, [deviceId, tab, chartMode, dailyRange, selectedCycleId, cycles]);

  // --- Online / Offline + állapot szöveg ---
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

                {/* Teljes törlés */}
                <div className="row" style={{ marginBottom: 12, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="tab"
                    onClick={() => {
                      setErr("");
                      setWipeSlide(0);
                      setShowWipe(true);
                    }}
                    style={{
                      background: "#7f1d1d",
                      borderColor: "rgba(255,255,255,.15)",
                      color: "white",
                    }}
                    title="Minden grafikon adat + ciklus + riasztás törlése"
                  >
                    Teljes törlés
                  </button>
                </div>

                {/* Daily: ciklus választó + új ciklus */}
                {chartMode === "daily" && (
                  <div className="card" style={{ marginBottom: 12 }}>
                    <div className="row" style={{ alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div className="sectionTitle">Ciklus</div>

                        <select
                          value={selectedCycleId ?? ""}
                          onChange={(e) => setSelectedCycleId(e.target.value || null)}
                          style={{ width: "100%", marginTop: 8 }}
                        >
                          {cycles.map((c) => {
                            const date = new Date(c.started_at).toLocaleDateString();
                            const label = `${animalMap[c.animal_type] ?? c.animal_type} — ${date}`;
                            return (
                              <option key={c.id} value={c.id}>
                                {label}
                              </option>
                            );
                          })}
                        </select>

                        <div className="mini" style={{ marginTop: 8 }}>
                          A napi grafikon a kiválasztott ciklus (kezdés/vége) alapján számol.
                        </div>
                      </div>

                      <button type="button" className="tab" onClick={() => setShowNewCycle(true)}>
                        Új ciklus
                      </button>
                    </div>
                  </div>
                )}

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
                    <>
                      <div className="row" style={{ marginBottom: 10 }}>
                        <button
                          type="button"
                          className="tab"
                          onClick={async () => {
                            if (!deviceId) return;
                            if (!confirm("Biztos törlöd az elmúlt 24 óra méréseit?")) return;
                            try {
                              await clear24h(deviceId);
                              setRows24h([]);
                              setChartKey24((k) => k + 1);
                            } catch (e: any) {
                              setErr(e?.message ?? "Nem sikerült törölni.");
                            }
                          }}
                        >
                          24h adatok törlése
                        </button>
                      </div>

                      <Chart24h key={chartKey24} data={rows24h} />
                    </>
                  )
                ) : !selectedCycleId ? (
                  <div className="empty">
                    <b>Nincs kiválasztott ciklus</b>
                    <div className="mini">Indíts új ciklust, vagy válassz a listából.</div>
                  </div>
                ) : dailyAvg.length === 0 ? (
                  <div className="empty">
                    <b>Nincs napi átlag adat ({dailyRange} nap)</b>
                    <div className="mini">Lehet, hogy még nincs elég mérés ebben a ciklusban.</div>
                  </div>
                ) : (
                  <ChartDailyAvg key={chartKeyDaily} data={dailyAvg} />
                )}

                {/* Új ciklus */}
                {showNewCycle && (
                  <div className="card" style={{ marginTop: 12 }}>
                    <div className="sectionTitle">Új ciklus indítása</div>
                    <div className="mini" style={{ marginTop: 6 }}>
                      Válassz állatfajt és kezdés dátumot. (A napi grafikon ettől tisztán indul.)
                    </div>

                    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                      <select value={newAnimalType} onChange={(e) => setNewAnimalType(e.target.value)}>
                        <option value="">-- Állat kiválasztása --</option>
                        {Object.entries(animalMap).map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                      </select>

                      <input
                        type="date"
                        value={newStartDate}
                        onChange={(e) => setNewStartDate(e.target.value)}
                      />

                      <div className="row" style={{ gap: 10 }}>
                        <button
                          type="button"
                          className="tab"
                          onClick={() => setShowNewCycle(false)}
                          disabled={busyCycle}
                        >
                          Mégse
                        </button>

                        <button
                          type="button"
                          className="tab active"
                          disabled={busyCycle || !deviceId || !newAnimalType}
                          onClick={async () => {
                            if (!deviceId) return;
                            try {
                              setBusyCycle(true);
                              setErr("");

                              const startedAtISO = new Date(`${newStartDate}T00:00:00Z`).toISOString();
                              const cycle = await startNewCycle(deviceId, newAnimalType, startedAtISO);

                              const cList = await loadCycles(deviceId);
                              setCycles(cList);
                              setSelectedCycleId(cycle.id);

                              setShowNewCycle(false);

                              setDailyAvg([]);
                              setChartKeyDaily((k) => k + 1);
                            } catch (e: any) {
                              setErr(e?.message ?? "Nem sikerült új ciklust indítani.");
                            } finally {
                              setBusyCycle(false);
                            }
                          }}
                        >
                          {busyCycle ? "Mentés…" : "Indítás"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Teljes törlés modal */}
                {showWipe && (
                  <div className="card" style={{ marginTop: 12, border: "1px solid rgba(255,255,255,.12)" }}>
                    <div className="sectionTitle" style={{ color: "#fecaca" }}>
                      Teljes törlés
                    </div>

                    <div className="mini" style={{ marginTop: 6 }}>
                      Ez a művelet <b>mindent töröl</b> ennél az eszköznél:
                      <ul style={{ margin: "8px 0 0 18px" }}>
                        <li>Grafikon adatok</li>
                        <li>Ciklusok</li>
                        <li>Riasztási napló</li>
                      </ul>
                      Húzd el a csúszkát teljesen jobbra a megerősítéshez.
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <span>Biztonság</span>
                        <span>{wipeSlide < 100 ? `${wipeSlide}%` : "Kész ✅"}</span>
                      </div>

                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={wipeSlide}
                        onChange={(e) => setWipeSlide(Number(e.target.value))}
                        style={{ width: "100%", marginTop: 8 }}
                        disabled={busyWipe}
                      />
                    </div>

                    <div className="row" style={{ marginTop: 12, justifyContent: "flex-end", gap: 10 }}>
                      <button
                        type="button"
                        className="tab"
                        onClick={() => {
                          setShowWipe(false);
                          setWipeSlide(0);
                        }}
                        disabled={busyWipe}
                      >
                        Mégse
                      </button>

                      <button
                        type="button"
                        className="tab active"
                        disabled={wipeSlide < 100 || busyWipe || !deviceId}
                        onClick={async () => {
                          if (!deviceId) return;
                          try {
                            setBusyWipe(true);
                            setErr("");

                            await fullWipeDevice(deviceId);

                            setRows24h([]);
                            setDailyAvg([]);
                            setCycles([]);
                            setSelectedCycleId(null);

                            setChartKey24((k) => k + 1);
                            setChartKeyDaily((k) => k + 1);

                            setShowWipe(false);
                            setWipeSlide(0);
                          } catch (e: any) {
                            setErr(e?.message ?? "Nem sikerült a teljes törlés.");
                          } finally {
                            setBusyWipe(false);
                          }
                        }}
                        style={{
                          background: "#7f1d1d",
                          borderColor: "rgba(255,255,255,.15)",
                          color: "white",
                        }}
                      >
                        {busyWipe ? "Törlés…" : "Végleges törlés"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : deviceId ? (
              <>
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