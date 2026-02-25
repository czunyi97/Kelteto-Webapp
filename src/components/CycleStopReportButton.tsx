import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import jsPDF from "jspdf";
// @ts-ignore
import autoTable from "jspdf-autotable";
import Chart from "chart.js/auto";

import DejaVuFontUrl from "../assets/fonts/DejaVuSans.ttf?url";
import LogoUrl from "../assets/logo.png?url"; // ✅ LOGÓ

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

// ======================
// Y tengely optimalizálás
// ======================

function calcMinMax(data: number[]) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const padding = (max - min) * 0.1 || 0.5;

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
  if (!ctx) throw new Error("Canvas error");

  const { min, max } = calcMinMax(data);

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
        y: { min, max },
      },
    },
  });

  await new Promise((r) => setTimeout(r, 20));
  const url = canvas.toDataURL("image/png", 1.0);
  chart.destroy();
  return url;
}

async function loadBase64(url: string) {
  const res = await fetch(url);
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
// FŐ KOMPONENS
// ======================

export default function CycleStopReportButton({
  deviceId,
  onAfterStop,
}: {
  deviceId: string;
  onAfterStop?: () => void;
}) {
  const [activeCycle, setActiveCycle] = useState<any>(null);
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

  // ======================
  // DUPLA MEGERŐSÍTÉS
  // ======================

  async function stopCycleWithReport() {
    if (!activeCycle) return;

    const ok = window.confirm(
      "Biztosan le szeretnéd zárni a ciklust?\nEzután PDF riport készül."
    );

    if (!ok) return;

    setShowForm(true);
  }

  async function confirmStopAndGenerate() {
    if (!activeCycle) return;

    setBusy(true);

    try {
      const endedAtIso = new Date().toISOString();

      await supabase
        .from("cycles")
        .update({ ended_at: endedAtIso })
        .eq("id", activeCycle.id);

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

  // ======================
  // PDF GENERÁLÁS
  // ======================

  async function generatePdf(
    cycle: any,
    endedAtIso: string,
    eggsCount: number | null,
    hatchedCount: number | null,
    notesText: string
  ) {
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 40;
    let y = margin;

    // ✅ LOGÓ
    const logoB64 = await loadBase64(LogoUrl);
    pdf.addImage(`data:image/png;base64,${logoB64}`, "PNG", 230, y, 120, 50);
    y += 60;

    const fontB64 = await loadBase64(DejaVuFontUrl);
    (pdf as any).addFileToVFS("DejaVuSans.ttf", fontB64);
    (pdf as any).addFont("DejaVuSans.ttf", "DejaVuSans", "normal");
    pdf.setFont("DejaVuSans");

    pdf.setFontSize(18);
    pdf.text("Keltetési ciklus riport", margin, y);
    y += 20;

    pdf.setFontSize(11);
    pdf.text(`Eszköz: ${deviceId}`, margin, y);
    y += 14;
    pdf.text(`Kezdés: ${fmtTs(cycle.started_at)}`, margin, y);
    y += 14;
    pdf.text(`Befejezés: ${fmtTs(endedAtIso)}`, margin, y);
    y += 20;

    // ======================
    // HATÁSFOK SZÁMÍTÁS
    // ======================

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