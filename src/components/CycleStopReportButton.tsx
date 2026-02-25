import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import jsPDF from "jspdf";
// @ts-ignore
import autoTable from "jspdf-autotable";
import Chart from "chart.js/auto";

import DejaVuFontUrl from "../assets/fonts/DejaVuSans.ttf?url";
import LogoUrl from "../assets/logo.png?url";

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

// ======================
// SEGÉD FÜGGVÉNYEK
// ======================

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
  return nums.reduce((a, b) => a + b, 0) / nums.length;
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

function alertBucket(code?: string | null) {
  const c = (code ?? "").toUpperCase();
  if (c.startsWith("TEMP_HIGH")) return "Hő magas";
  if (c.startsWith("TEMP_LOW")) return "Hő alacsony";
  if (c.startsWith("HUM_HIGH")) return "Pára magas";
  if (c.startsWith("HUM_LOW")) return "Pára alacsony";
  if (c === "CYCLE_FINISHED") return "Ciklus lezárva";
  return "Egyéb";
}

function shorten(s: string, max = 44) {
  const t = (s ?? "").toString().replace(/\s+/g, " ").trim();
  if (!t) return "—";
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

async function loadFileBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Fájl betöltés sikertelen.");
  const buf = await res.arrayBuffer();

  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ======================
// GRAFIKON Y AUTO
// ======================

function calcMinMax(data: number[]) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min;
  const padding = span > 0 ? span * 0.1 : 0.5;

  return {
    min: Math.floor(min - padding),
    max: Math.ceil(max + padding),
  };
}

async function chartToDataUrl(labels: string[], data: number[], label: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 350;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context error");

  const { min, max } = calcMinMax(data);

  const chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{ label, data, borderWidth: 3, pointRadius: 0, tension: 0.25 }],
    },
    options: {
      responsive: false,
      animation: false,
      scales: { y: { min, max } },
    },
  });

  await new Promise((r) => setTimeout(r, 20));
  const url = canvas.toDataURL("image/png", 1.0);
  chart.destroy();
  return url;
}

// ======================
// KOMPONENS
// ======================

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
  const [showForm, setShowForm] = useState(false);
  const [eggs, setEggs] = useState("");
  const [hatched, setHatched] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    loadActiveCycle();
  }, [deviceId]);

  async function loadActiveCycle() {
    const { data } = await supabase
      .from("cycles")
      .select("*")
      .eq("device_id", deviceId)
      .is("ended_at", null)
      .limit(1);

    setActiveCycle(data?.[0] ?? null);
    setLoading(false);
  }

  // 🔐 dupla confirm
  async function stopCycleWithReport() {
    if (!activeCycle) return;

    if (!window.confirm("Biztosan le szeretnéd zárni a ciklust?")) return;
    if (!window.confirm("Megerősítés: tényleg lezárod?")) return;

    setShowForm(true);
  }

  async function confirmStopAndGenerate() {
    if (!activeCycle) return;
    setBusy(true);

    try {
      const endedAtIso = new Date().toISOString();

      await supabase.from("cycles").update({ ended_at: endedAtIso }).eq("id", activeCycle.id);

      const eggsCount = eggs ? Number(eggs) : null;
      const hatchedCount = hatched ? Number(hatched) : null;

      await generatePdf(activeCycle, endedAtIso, eggsCount, hatchedCount, notes);

      setShowForm(false);
      setActiveCycle(null);
      onAfterStop?.();
    } finally {
      setBusy(false);
    }
  }

  async function generatePdf(
    cycle: CycleRow,
    endedAtIso: string,
    eggsCount: number | null,
    hatchedCount: number | null,
    notesText: string
  ) {
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 40;
    let y = margin;

    // LOGÓ jobb felső sarok
    try {
      const logoB64 = await loadFileBase64(LogoUrl);
      const pageW = pdf.internal.pageSize.getWidth();
      const logoW = 150;
      const logoH = 60;
      const x = pageW - margin - logoW;
      pdf.addImage(`data:image/png;base64,${logoB64}`, "PNG", x, y, logoW, logoH);
      y += logoH + 10;
    } catch {}

    const fontB64 = await loadFileBase64(DejaVuFontUrl);
    (pdf as any).addFileToVFS("DejaVuSans.ttf", fontB64);
    (pdf as any).addFont("DejaVuSans.ttf", "DejaVuSans", "normal");
    pdf.setFont("DejaVuSans");

    pdf.setFontSize(18);
    pdf.text("Keltetési ciklus riport", margin, y);
    y += 20;

    pdf.setFontSize(11);
    pdf.text(`Eszköz: ${deviceId}`, margin, y);
    y += 14;
    pdf.text(`Állat: ${huAnimal(cycle.animal_type)}`, margin, y);
    y += 14;
    pdf.text(`Kezdés: ${fmtTs(cycle.started_at)}`, margin, y);
    y += 14;
    pdf.text(`Befejezés: ${fmtTs(endedAtIso)}`, margin, y);
    y += 20;

    let efficiency = "—";
    if (eggsCount && hatchedCount && eggsCount > 0) {
      efficiency = `${round1((hatchedCount / eggsCount) * 100)} %`;
    }

    const sumRows = [
      ["Tojások száma", eggsCount ?? "—"],
      ["Kikelt", hatchedCount ?? "—"],
      ["Kikelési hatásfok", efficiency],
    ];

    // @ts-ignore
    autoTable(pdf, {
      startY: y,
      head: [["Mező", "Érték"]],
      body: sumRows,
      theme: "grid",
      margin: { left: margin, right: margin },
    });

    pdf.save(`ciklus-riport_${deviceId}.pdf`);
  }

  if (loading) return null;

  return (
    <>
      {activeCycle && (
        <button
          onClick={stopCycleWithReport}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            background: "#7f1d1d",
            color: "white",
            cursor: "pointer",
          }}
        >
          Ciklus stop + PDF
        </button>
      )}

      {showForm && (
        <div>
          <input value={eggs} onChange={(e) => setEggs(e.target.value)} placeholder="Tojások száma" />
          <input value={hatched} onChange={(e) => setHatched(e.target.value)} placeholder="Kikelt" />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button onClick={confirmStopAndGenerate} disabled={busy}>
            {busy ? "Készül..." : "Lezárás + PDF"}
          </button>
        </div>
      )}
    </>
  );
}