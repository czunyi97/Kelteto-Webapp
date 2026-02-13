import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import DeviceCard from "../components/DeviceCard";
import { evaluateAndLogAlerts } from "../lib/alerts";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";

type DeviceInfo = {
  device_id: string;
  name: string;
  location: string;
  is_active: boolean;
  created_at: string;
};

// ✅ animals join típusa
type AnimalJoin = { name_hu: string | null } | null;

type DeviceState = {
  device_id: string;
  animal_type: string | null;
  day: number | null;
  temp: number | null;
  hum: number | null;

  // ✅ EZ HIÁNYZOTT -> ezért nem tudta a kártya a helyes határokat
  target_temp: number | null;
  tol_temp: number | null;
  target_hum: number | null;
  tol_hum: number | null;

  updated_at: string | null;

  // ✅ JOIN-ból jön (animals.name_hu)
  animals?: AnimalJoin;
};

// ✅ kiegészítjük egy megjelenítési címkével
type DeviceMerged = DeviceInfo &
  DeviceState & {
    animal_label: string | null;
  };

export default function Dashboard() {
  const nav = useNavigate();
  const { signOut } = useAuth();

  const [devices, setDevices] = useState<DeviceMerged[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const fetchAll = async () => {
    setErr("");

    const a = await supabase
      .from("devices")
      .select("device_id, name, location, is_active, created_at")
      .order("created_at", { ascending: false });

    if (a.error) {
      setErr(a.error.message);
      setDevices([]);
      return;
    }

    const info = (a.data ?? []) as DeviceInfo[];

    const b = await supabase
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
      `);

    if (b.error) {
      setErr(b.error.message);
      setDevices(
        info.map((d) => ({
          ...d,
          animal_type: null,
          day: null,
          temp: null,
          hum: null,
          target_temp: null,
          tol_temp: null,
          target_hum: null,
          tol_hum: null,
          updated_at: null,
          animals: null,
          animal_label: null,
        }))
      );
      return;
    }

    const stateRows: DeviceState[] = (b.data ?? []).map((row: any) => ({
    device_id: row.device_id ?? null,
    animal_type: row.animal_type ?? null,
    day: row.day ?? null,
    temp: row.temp ?? null,
    hum: row.hum ?? null,
    target_temp: row.target_temp ?? null,
    tol_temp: row.tol_temp ?? null,
    target_hum: row.target_hum ?? null,
    tol_hum: row.tol_hum ?? null,
    updated_at: row.updated_at ?? null,
    animals: row.animals ?? null,
  }));
    const stateMap = new Map<string, DeviceState>();
    for (const s of stateRows) stateMap.set(s.device_id, s);

    const merged: DeviceMerged[] = info.map((d) => {
      const s = stateMap.get(d.device_id);
      const label = s?.animals?.name_hu ?? s?.animal_type ?? null;

      return {
        ...d,
        animal_type: s?.animal_type ?? null,
        animal_label: label,
        day: s?.day ?? null,
        temp: s?.temp ?? null,
        hum: s?.hum ?? null,
        target_temp: s?.target_temp ?? null,
        tol_temp: s?.tol_temp ?? null,
        target_hum: s?.target_hum ?? null,
        tol_hum: s?.tol_hum ?? null,
        updated_at: s?.updated_at ?? null,
        animals: s?.animals ?? null,
      };
    });

    setDevices(merged);

    // (meghagyva) – ha ez a lib később target/tol-os lesz, itt is átadhatjuk
    for (const d of merged) {
      if (d.temp == null && d.hum == null) continue;
      evaluateAndLogAlerts({
        device_id: d.device_id,
        temp: d.temp,
        hum: d.hum,
      });
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchAll();
      setLoading(false);
    })();

    const t = window.setInterval(fetchAll, 15000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand">
          <div className="logo" />
          <div className="title">
            <h1>Keltető Dashboard</h1>
            <small>Mobil + laptop nézet • automatikus frissítés 15 mp</small>
          </div>
        </div>

        <div className="actions">
          <button className="btn ghost" onClick={() => nav("/devices")}>
            Eszközök
          </button>

          <button className="btn ghost" onClick={fetchAll}>
            Frissítés
          </button>

          <button className="btn" onClick={signOut}>
            Kijelentkezés
          </button>
        </div>
      </div>

      {loading && <div className="empty">Betöltés…</div>}

      {!loading && err && (
        <div className="error">
          <b>Hiba:</b> {err}
        </div>
      )}

      {!loading && !err && devices.length === 0 && (
        <div className="empty">
          <b>Nincs hozzárendelt eszköz</b>
          <div className="mini">
            Menj az <b>Eszközök</b> oldalra és add hozzá a keltetőt.
          </div>
        </div>
      )}

      <div className="grid" style={{ marginTop: 14 }}>
        {devices.map((d) => (
          <DeviceCard
            key={d.device_id}
            deviceId={d.device_id}
            name={d.name}
            location={d.location}
            // ✅ magyar név (ha van), különben kód
            animal={d.animal_label}
            day={d.day}
            temp={d.temp}
            hum={d.hum}
            updatedAt={d.updated_at}
            // ✅ itt adjuk át a helyes határokat
            targetTemp={d.target_temp}
            tolTemp={d.tol_temp}
            targetHum={d.target_hum}
            tolHum={d.tol_hum}
          />
        ))}
      </div>
    </div>
  );
}