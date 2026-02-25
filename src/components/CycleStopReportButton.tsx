import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import jsPDF from "jspdf";
// @ts-ignore
import autoTable from "jspdf-autotable";
import Chart from "chart.js/auto";

// ✅ DejaVu Sans (magyar ő/ű támogatás)
import DejaVuFontUrl from "../assets/fonts/DejaVuSans.ttf?url";

type CycleRow = {
  id: string;
  device_id: string;
  animal_type: string | null;
  started_at: string;
  ended_at: string | null;
};

type MeasurementRow = {
  ts: string;
  temp: number | null;
  hum: number | null;
};

type AlertRowLite = {
  ts: string;
  level: string | null;
  code: string | null;
  message: string | null;
  value: number | null;
};

// ✅ timestamptz → Europe/Budapest (stabil, nincs -1 óra)
function fmtTs(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;

  return new Intl.DateTimeFormat("hu-HU", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

function avg(nums: number[]) {
  if (!nums.length) return null;
  const s = nums.reduce((a, b) => a + b, 0);
  return s / nums.length;
}

function round1(x: number) {
  return Math.round(x * 10) / 10;
}

function huAnimal(a?: string | null) {
  const v = (a ?? "").toLowerCase();
  if (v === "chicken") return "Csibe";
  if (v === "duck") return "Kacsa";
  return a || "—";
}

function huAlertTitle(code?: string | null, fallback?: string | null) {
  const c = (code ?? "").toUpperCase();
  switch (c) {
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
    case "CYCLE_FINISHED":
      return "Ciklus lezárva";
    default:
      return fallback || code || "Riasztás";
  }
}

// ✅ Riasztás típus összesítőhöz
function alertBucket(code?: string | null) {
  const c = (code ?? "").toUpperCase();
  if (c.startsWith("TEMP_HIGH")) return "Hő magas";
  if (c.startsWith("TEMP_LOW")) return "Hő alacsony";
  if (c.startsWith("HUM_HIGH")) return "Pára magas";
  if (c.startsWith("HUM_LOW")) return "Pára alacsony";
  if (c === "CYCLE_FINISHED") return "Ciklus lezárva";
  return "Egyéb";
}

// ✅ “Esemény” rövidítés (ne törje szét a sort)
function shorten(s: string, max = 44) {
  const t = (s ?? "").toString().replace(/\s+/g, " ").trim();
  if (!t) return "—";
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

async function loadFontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Font betöltés sikertelen.");
  const buf = await res.arrayBuffer();

  // ArrayBuffer -> base64
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function chartToDataUrl(labels: string[], data: number[], label: string): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 350;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context error");

  const chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label,
          data,
          borderWidth: 3,
          pointRadius: 0,
          tension: 0.25,
        },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      plugins: { legend: { display: true } },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: { beginAtZero: false },
      },
    },
  });

  await new Promise((r) => setTimeout(r, 20));
  const url = canvas.toDataURL("image/png", 1.0);
  chart.destroy();
  return url;
}

export default function CycleStopReportButton({
  deviceId,
  onAfterStop,
}: {
  deviceId: string;
  onAfterStop?: () => void;
}) {
  const [activeCycle, setActiveCycle] = useState<CycleRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // kitölthető mezők
  const [showForm, setShowForm] = useState(false);
  const [eggs, setEggs] = useState<string>("");
  const [hatched, setHatched] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  async function loadActiveCycle() {
    setLoading(true);
    setErr("");

    const { data, error } = await supabase
      .from("cycles")
      .select("id, device_id, animal_type, started_at, ended_at")
      .eq("device_id", deviceId)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1);

    if (error) {
      setErr(error.message);
      setActiveCycle(null);
      setLoading(false);
      return;
    }

    setActiveCycle((data?.[0] as CycleRow) ?? null);
    setLoading(false);
  }

  useEffect(() => {
    loadActiveCycle();
    const t = setInterval(loadActiveCycle, 20000);
    return () => clearInterval(t);
  }, [deviceId]);

  const canShow = useMemo(() => !!activeCycle && !loading, [activeCycle, loading]);

  async function generatePdfAndDownload(params: {
    cycle: CycleRow;
    endedAtIso: string;
    eggsCount: number | null;
    hatchedCount: number | null;
    notesText: string;
  }) {
    const { cycle, endedAtIso, eggsCount, hatchedCount, notesText } = params;

    // 1) measurements (ciklus időablak)
    const { data: meas, error: measErr } = await supabase
      .from("measurements")
      .select("ts, temp, hum")
      .eq("device_id", deviceId)
      .gte("ts", cycle.started_at)
      .lte("ts", endedAtIso)
      .order("ts", { ascending: true });

    if (measErr) throw new Error(measErr.message);
    const measurements = (meas ?? []) as MeasurementRow[];

    // 2) alerts (TELJES CIKLUS: kezdéstől befejezésig, NINCS limit)
    const { data: als, error: alErr } = await supabase
      .from("alerts")
      .select("ts, level, code, message, value")
      .eq("device_id", deviceId)
      .gte("ts", cycle.started_at)
      .lte("ts", endedAtIso)
      .order("ts", { ascending: true });

    if (alErr) throw new Error(alErr.message);
    const alerts = (als ?? []) as AlertRowLite[];

    const temps = measurements.map((m) => m.temp).filter((v): v is number => v != null);
    const hums = measurements.map((m) => m.hum).filter((v): v is number => v != null);

    const avgT = avg(temps);
    const avgH = avg(hums);

    // grafikon: max ~120 pont
    const step = Math.max(1, Math.floor(measurements.length / 120));
    const sampled = measurements.filter((_, idx) => idx % step === 0);

    const labels = sampled.map((m) => {
      const d = new Date(m.ts);
      return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(
        2,
        "0"
      )}:${String(d.getMinutes()).padStart(2, "0")}`;
    });

    const tempSeries = sampled.map((m) => m.temp).filter((v): v is number => v != null);
    const humSeries = sampled.map((m) => m.hum).filter((v): v is number => v != null);

    const tempImg = tempSeries.length
      ? await chartToDataUrl(labels.slice(0, tempSeries.length), tempSeries, "Hőmérséklet (°C)")
      : null;
    const humImg = humSeries.length
      ? await chartToDataUrl(labels.slice(0, humSeries.length), humSeries, "Páratartalom (%)")
      : null;

    // PDF
    const pdf = new jsPDF({ unit: "pt", format: "a4" });

    // ✅ Font beágyazás (ő/ű OK)
    const fontB64 = await loadFontBase64(DejaVuFontUrl);
    (pdf as any).addFileToVFS("DejaVuSans.ttf", fontB64);
    (pdf as any).addFont("DejaVuSans.ttf", "DejaVuSans", "normal");
    (pdf as any).addFont("DejaVuSans.ttf", "DejaVuSans", "bold");

    const margin = 40;
    let y = margin;

    pdf.setFont("DejaVuSans", "bold");
    pdf.setFontSize(18);
    pdf.text("Keltetési ciklus riport", margin, y);
    y += 18;

    pdf.setFont("DejaVuSans", "normal");
    pdf.setFontSize(11);
    pdf.text(`Eszköz: ${deviceId}`, margin, y);
    y += 14;
    pdf.text(`Állat: ${huAnimal(cycle.animal_type)}`, margin, y);
    y += 14;
    pdf.text(`Kezdés: ${fmtTs(cycle.started_at)}`, margin, y);
    y += 14;
    pdf.text(`Befejezés: ${fmtTs(endedAtIso)}`, margin, y);
    y += 18;

    pdf.setFont("DejaVuSans", "bold");
    pdf.text("Összegzés", margin, y);
    y += 10;

    pdf.setFont("DejaVuSans", "normal");
    const sumRows: Array<[string, string]> = [
      ["Átlag hőmérséklet", avgT == null ? "—" : `${round1(avgT)} °C`],
      ["Átlag páratartalom", avgH == null ? "—" : `${round1(avgH)} %`],
      ["Tojások száma", eggsCount == null ? "—" : String(eggsCount)],
      ["Kikelt", hatchedCount == null ? "—" : String(hatchedCount)],
    ];

    // @ts-ignore
    autoTable(pdf, {
      startY: y,
      head: [["Mező", "Érték"]],
      body: sumRows,
      theme: "grid",
      styles: { font: "DejaVuSans", fontSize: 11 },
      headStyles: { font: "DejaVuSans", fontStyle: "bold" },
      margin: { left: margin, right: margin },
    });

    // @ts-ignore
    y = (pdf as any).lastAutoTable.finalY + 18;

    pdf.setFont("DejaVuSans", "bold");
    pdf.text("Grafikonok", margin, y);
    y += 10;
    pdf.setFont("DejaVuSans", "normal");

    if (tempImg) {
      pdf.text("Hőmérséklet", margin, y);
      y += 6;
      pdf.addImage(tempImg, "PNG", margin, y, 515, 180);
      y += 190;
    }

    if (y > 650) {
      pdf.addPage();
      y = margin;
    }

    if (humImg) {
      pdf.text("Páratartalom", margin, y);
      y += 6;
      pdf.addImage(humImg, "PNG", margin, y, 515, 180);
      y += 190;
    }

    if (y > 650) {
      pdf.addPage();
      y = margin;
    }

    // ===============================
    // RIASZTÁS ÖSSZESÍTŐ + NAPLÓ
    // ===============================
    pdf.setFont("DejaVuSans", "bold");
    pdf.text("Riasztások", margin, y);
    y += 10;

    pdf.setFont("DejaVuSans", "normal");

    const counts = new Map<string, number>();
    for (const a of alerts) {
      const key = alertBucket(a.code);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const summaryRows: Array<[string, string]> = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, String(v)]);

    if (summaryRows.length === 0) summaryRows.push(["Nincs riasztás", "0"]);

    // @ts-ignore
    autoTable(pdf, {
      startY: y,
      head: [["Típus", "Db"]],
      body: summaryRows,
      theme: "grid",
      styles: { font: "DejaVuSans", fontSize: 10 },
      headStyles: { font: "DejaVuSans", fontStyle: "bold" },
      margin: { left: margin, right: margin },
      tableWidth: 220,
    });

    // @ts-ignore
    y = (pdf as any).lastAutoTable.finalY + 16;

    if (y > 720) {
      pdf.addPage();
      y = margin;
    }

    pdf.setFont("DejaVuSans", "bold");
    pdf.text("Riasztási napló (teljes ciklus)", margin, y);
    y += 10;
    pdf.setFont("DejaVuSans", "normal");

    const head = [["Idő", "Esemény", "Kód", "Érték", "Szint"]];

    const alertBody = alerts.map((a) => {
      const title = huAlertTitle(a.code, a.message);
      return [fmtTs(a.ts), shorten(title, 44), a.code ?? "—", a.value == null ? "—" : String(a.value), a.level ?? "—"];
    });

    if (alertBody.length === 0) {
      // @ts-ignore
      autoTable(pdf, {
        startY: y,
        head,
        body: [["—", "Nincs riasztás ebben az időszakban", "—", "—", "—"]],
        theme: "grid",
        styles: { font: "DejaVuSans", fontSize: 9 },
        headStyles: { font: "DejaVuSans", fontStyle: "bold" },
        margin: { left: margin, right: margin },
      });
      // @ts-ignore
      y = (pdf as any).lastAutoTable.finalY + 18;
    } else {
      const pageW = pdf.internal.pageSize.getWidth();
      const colGap = 12;
      const colW = (pageW - 2 * margin - colGap) / 2;
      const useTwoCols = alertBody.length >= 18 && alertBody.length <= 160;

      if (!useTwoCols) {
        // @ts-ignore
        autoTable(pdf, {
          startY: y,
          head,
          body: alertBody,
          theme: "grid",
          styles: { font: "DejaVuSans", fontSize: 9 },
          headStyles: { font: "DejaVuSans", fontStyle: "bold" },
          margin: { left: margin, right: margin },
        });
        // @ts-ignore
        y = (pdf as any).lastAutoTable.finalY + 18;
      } else {
        const mid = Math.ceil(alertBody.length / 2);
        const leftBody = alertBody.slice(0, mid);
        const rightBody = alertBody.slice(mid);

        // bal oszlop
        // @ts-ignore
        autoTable(pdf, {
          startY: y,
          head,
          body: leftBody,
          theme: "grid",
          styles: { font: "DejaVuSans", fontSize: 8.5, cellPadding: 2 },
          headStyles: { font: "DejaVuSans", fontStyle: "bold" },
          margin: { left: margin, right: margin },
          tableWidth: colW,
        });
        // @ts-ignore
        const yLeft = (pdf as any).lastAutoTable.finalY;

        // jobb oszlop
        // @ts-ignore
        autoTable(pdf, {
          startY: y,
          head,
          body: rightBody.length ? rightBody : [["—", "—", "—", "—", "—"]],
          theme: "grid",
          styles: { font: "DejaVuSans", fontSize: 8.5, cellPadding: 2 },
          headStyles: { font: "DejaVuSans", fontStyle: "bold" },
          margin: { left: margin + colW + colGap, right: margin },
          tableWidth: colW,
        });
        // @ts-ignore
        const yRight = (pdf as any).lastAutoTable.finalY;

        y = Math.max(yLeft, yRight) + 18;

        if (y > 760) {
          pdf.addPage();
          y = margin;
        }
      }
    }

    if (y > 720) {
      pdf.addPage();
      y = margin;
    }

    pdf.setFont("DejaVuSans", "bold");
    pdf.text("Megjegyzés", margin, y);
    y += 12;

    pdf.setFont("DejaVuSans", "normal");
    const note = (notesText || "").trim() || "—";
    const split = pdf.splitTextToSize(note, 515);
    pdf.text(split, margin, y);

    const fileName = `ciklus-riport_${deviceId}_${new Date().toISOString().slice(0, 10)}.pdf`;
    pdf.save(fileName);
  }

  async function stopCycleWithReport() {
    if (!activeCycle) return;
    setErr("");
    setShowForm(true);
  }

  async function confirmStopAndGenerate() {
    if (!activeCycle) return;

    setBusy(true);
    setErr("");

    try {
      const endedAtIso = new Date().toISOString();

      const { error: updErr } = await supabase
        .from("cycles")
        .update({ ended_at: endedAtIso })
        .eq("id", activeCycle.id)
        .is("ended_at", null);

      if (updErr) throw new Error(updErr.message);

      const { error: devErr } = await supabase
        .from("devices")
        .update({ current_cycle_id: null })
        .eq("device_id", deviceId);

      if (devErr) throw new Error(devErr.message);

      const { error: insErr } = await supabase.from("alerts").insert({
        device_id: deviceId,
        ts: endedAtIso,
        level: "info",
        code: "CYCLE_FINISHED",
        message: "Ciklus lezárva",
        value: null,
      });

      if (insErr) console.warn("[alerts insert]", insErr.message);

      const eggsCount = eggs.trim() === "" ? null : Number(eggs.replace(",", "."));
      const hatchedCount = hatched.trim() === "" ? null : Number(hatched.replace(",", "."));

      await generatePdfAndDownload({
        cycle: activeCycle,
        endedAtIso,
        eggsCount: Number.isFinite(eggsCount as any) ? (eggsCount as number) : null,
        hatchedCount: Number.isFinite(hatchedCount as any) ? (hatchedCount as number) : null,
        notesText: notes,
      });

      setShowForm(false);
      setEggs("");
      setHatched("");
      setNotes("");
      setActiveCycle(null);

      onAfterStop?.();
      await loadActiveCycle();
    } catch (e: any) {
      setErr(e?.message ?? "Ismeretlen hiba");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  return (
    <>
      {err && (
        <div style={{ marginTop: 10, background: "#7f1d1d", padding: 12, borderRadius: 12 }}>
          <b>Hiba:</b> {err}
        </div>
      )}

      {canShow && (
        <button
          onClick={stopCycleWithReport}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,.15)",
            background: "#7f1d1d",
            color: "white",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
          title="Ciklus leállítása és PDF riport készítése"
        >
          Ciklus stop + PDF
        </button>
      )}

      {showForm && activeCycle && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 50,
          }}
        >
          <div
            style={{
              width: "min(520px, 100%)",
              background: "#0b1220",
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: 14,
              padding: 14,
              boxShadow: "0 20px 60px rgba(0,0,0,.45)",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>
              Ciklus lezárása + riport
            </div>

            <div style={{ opacity: 0.9, marginBottom: 10, fontSize: 13 }}>
              Eszköz: <b>{deviceId}</b> • Állat: <b>{huAnimal(activeCycle.animal_type)}</b>
              <br />
              Kezdés: {fmtTs(activeCycle.started_at)}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Tojások száma</div>
                <input
                  value={eggs}
                  onChange={(e) => setEggs(e.target.value)}
                  placeholder="pl. 40"
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
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Kikelt</div>
                <input
                  value={hatched}
                  onChange={(e) => setHatched(e.target.value)}
                  placeholder="pl. 33"
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
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Megjegyzés</div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Pl. keltetési tapasztalatok, problémák, megjegyzések…"
                rows={4}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,.15)",
                  background: "#111827",
                  color: "white",
                  outline: "none",
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
              <button
                type="button"
                onClick={() => {
                  if (busy) return;
                  setShowForm(false);
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,.15)",
                  background: "#111827",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                Mégse
              </button>

              <button
                type="button"
                onClick={confirmStopAndGenerate}
                disabled={busy}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,.15)",
                  background: "#7f1d1d",
                  color: "white",
                  cursor: "pointer",
                  opacity: busy ? 0.7 : 1,
                }}
              >
                {busy ? "Készül a riport…" : "Lezárás + PDF letöltés"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}