import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type DeviceRow = {
  device_id: string;
  name: string;
  location: string;
  is_active: boolean;
  created_at: string;
};

function isDuplicateError(msg: string) {
  const m = msg.toLowerCase();
  return m.includes("duplicate") || m.includes("already exists") || m.includes("unique");
}

export default function Devices() {
  const [items, setItems] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [deviceId, setDeviceId] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");

  async function load() {
    setErr("");
    setLoading(true);

    // RLS miatt itt automatikusan csak a saját (hozzárendelt) eszközök jönnek
    const { data, error } = await supabase
      .from("devices")
      .select("device_id, name, location, is_active, created_at")
      .order("created_at", { ascending: false });

    setLoading(false);

    if (error) {
      setErr(error.message);
      setItems([]);
      return;
    }

    setItems((data ?? []) as DeviceRow[]);
  }

  useEffect(() => {
    load();
  }, []);

  async function addDevice(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    const id = deviceId.trim();
    if (!id) {
      setErr("Device ID kötelező (pl. INC-0003).");
      return;
    }

    // 0) session check (ha nincs login, ne is próbáljuk)
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session?.user?.id) {
      setErr("Nincs bejelentkezett user.");
      return;
    }

    // 1) próbáljuk létrehozni az eszközt (INSERT)
    // Ha már létezik, akkor ez duplicate hibát ad, és megyünk tovább hozzárendelésre.
    const { error: e1 } = await supabase.from("devices").insert([
      {
        device_id: id,
        name: (name || id).trim(),
        location: location.trim(),
        is_active: true,
        // created_by default auth.uid() (DB oldalon)
      },
    ]);

    if (e1 && !isDuplicateError(e1.message)) {
      setErr(e1.message);
      return;
    }

    // 2) hozzárendelés a userhez (user_id-t NEM küldünk, DB default auth.uid())
    // Ha már hozzá van rendelve, az is "duplicate", azt ignoráljuk.
    const { error: e2 } = await supabase.from("user_devices").insert([{ device_id: id }]);

    if (e2 && !isDuplicateError(e2.message)) {
      setErr(e2.message);
      return;
    }

    setDeviceId("");
    setName("");
    setLocation("");
    await load();
  }

  async function removeDevice(devId: string) {
    setErr("");

    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session?.user?.id) {
      setErr("Nincs bejelentkezett user.");
      return;
    }

    // 1) leválasztás (mindig ez legyen az első)
    const { error: e1 } = await supabase
      .from("user_devices")
      .delete()
      .eq("device_id", devId); // user_id-t nem kell: RLS úgyis a saját sorra enged csak

    if (e1) {
      setErr(e1.message);
      return;
    }

    // 2) opcionális: ha a user a tulaj (created_by), törölheti a devices rekordot is
    // Ha nem tulaj, RLS letiltja -> ezt ignoráljuk.
    const { error: e2 } = await supabase.from("devices").delete().eq("device_id", devId);
    if (e2) {
      // csak logoljuk, mert lehet, hogy nem tulaj és ez teljesen oké
      console.warn("[devices delete]", e2.message);
    }

    await load();
  }

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand">
          <div className="logo" />
          <div className="title">
            <h1>Eszközök</h1>
            <small>Hozzárendelés a fiókodhoz</small>
          </div>
        </div>

        <div className="actions">
          <a className="btn ghost" href="/">
            ← Vissza
          </a>
          <button className="btn ghost" onClick={load}>
            Frissítés
          </button>
        </div>
      </div>

      {err && (
        <div className="error" style={{ marginBottom: 14 }}>
          <b>Hiba:</b> {err}
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>Új eszköz hozzáadása</h3>

        <form onSubmit={addDevice} style={{ display: "grid", gap: 10 }}>
          <label>
            <div className="mini" style={{ marginTop: 0 }}>
              Device ID (pl. INC-0003)
            </div>
            <input
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              placeholder="INC-0003"
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
            <div className="mini" style={{ marginTop: 0 }}>
              Név (opcionális)
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Keltető 3"
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
            <div className="mini" style={{ marginTop: 0 }}>
              Hely (opcionális)
            </div>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Otthon"
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

          <button className="btn" type="submit">
            Hozzáadás
          </button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Hozzárendelt eszközeim</h3>

        {loading ? (
          <div className="empty">Betöltés…</div>
        ) : items.length === 0 ? (
          <div className="empty">
            <b>Nincs eszköz hozzárendelve</b>
            <div className="mini">Add hozzá fent a device ID-t.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {items.map((d) => (
              <div
                key={d.device_id}
                className="card"
                style={{ padding: 12, background: "rgba(255,255,255,.04)" }}
              >
                <div className="row">
                  <div>
                    <div style={{ fontWeight: 800 }}>{d.name || d.device_id}</div>
                    <div className="mini" style={{ marginTop: 4 }}>
                      ID: <b>{d.device_id}</b>
                      {d.location ? (
                        <>
                          {" "}
                          • Hely: <b>{d.location}</b>
                        </>
                      ) : null}
                      {" "}
                      • {d.is_active ? "Aktív" : "Inaktív"}
                    </div>
                  </div>
                  <button className="btn ghost" onClick={() => removeDevice(d.device_id)}>
                    Leválasztás
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}