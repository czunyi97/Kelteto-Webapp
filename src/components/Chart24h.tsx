import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

type Row = {
  ts: string;
  temp: number | null;
  hum: number | null;
};

function fmtTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function domainTight(values: Array<number | null | undefined>, pad: number, decimals = 1) {
  const nums = values.filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  if (!nums.length) return ["auto", "auto"] as const;

  let min = Math.min(...nums);
  let max = Math.max(...nums);

  if (min === max) {
    min -= pad;
    max += pad;
  } else {
    min -= pad;
    max += pad;
  }

  const k = Math.pow(10, decimals);
  const round = (x: number) => Math.round(x * k) / k;
  return [round(min), round(max)] as const;
}

/**
 * Egyszerű csúszóátlag (moving average) simítás.
 * window: 3..15 tipikusan. Nagyobb = simább, de "lustább" görbe.
 */
function smoothMovingAvg(series: Array<number | null>, window: number) {
  const half = Math.floor(window / 2);
  const out: Array<number | null> = new Array(series.length).fill(null);

  for (let i = 0; i < series.length; i++) {
    let sum = 0;
    let n = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j < 0 || j >= series.length) continue;
      const v = series[j];
      if (v == null || Number.isNaN(v)) continue;
      sum += v;
      n++;
    }
    out[i] = n ? sum / n : null;
  }
  return out;
}

export default function Chart24h({ data }: { data: Row[] }) {
  const text = "rgba(233,238,252,.92)";
  const muted = "rgba(233,238,252,.55)";
  const border = "rgba(255,255,255,.12)";

  // ✅ Simítás erőssége
  // - 5: enyhe
  // - 9: nagyon szép hullámos (általában ez kell)
  // - 13: extra sima, de késik a görbe
  const WINDOW = 9;

  // ✅ Simított adatsor létrehozása
  const temps = data.map((d) => d.temp);
  const hums = data.map((d) => d.hum);
  const tempS = smoothMovingAvg(temps, WINDOW);
  const humS = smoothMovingAvg(hums, WINDOW);

  const smoothData = data.map((d, i) => ({
    ...d,
  temp_s: tempS[i] != null ? Math.round(tempS[i]! * 10) / 10 : null,   // ✅ 1 tizedes
  hum_s: humS[i] != null ? Math.round(humS[i]! * 10) / 10 : null,     // ✅ 1 tizedes
  }));

  // domain a simított sorból (különben “ugrálhat”)
  const tDom = domainTight(smoothData.map((d) => d.temp_s), 0.2, 1);
  const hDom = domainTight(smoothData.map((d) => d.hum_s), 2, 0);

  const commonTooltip = {
    contentStyle: {
      background: "rgba(15,26,47,.92)",
      border: `1px solid ${border}`,
      borderRadius: 14,
      color: text,
    },
    itemStyle: { color: text },
    labelStyle: { color: muted },
  } as const;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, marginBottom: 12 }}>Utolsó 24 óra</h3>

      {/* 1) HŐ */}
      <div className="chartArea" style={{ height: 220, marginBottom: 14 }}>
        <ResponsiveContainer>
          <LineChart data={smoothData}>
            <CartesianGrid stroke={border} strokeDasharray="3 3" />
            <XAxis
              dataKey="ts"
              tickFormatter={fmtTime}
              minTickGap={24}
              tick={{ fill: text }}
              axisLine={{ stroke: border }}
              tickLine={{ stroke: border }}
            />
            <YAxis
              domain={tDom as any}
              tick={{ fill: text }}
              axisLine={{ stroke: border }}
              tickLine={{ stroke: border }}
              width={44}
            />
            <Tooltip
              labelFormatter={(v) => new Date(v as string).toLocaleString()}
              {...commonTooltip}
            />
            <Legend
              wrapperStyle={{ color: text }}
              formatter={(value) => <span style={{ color: text }}>{value}</span>}
            />
            <Line
              type="natural"
              dataKey="temp_s"              // ✅ SIMÍTOTT sor
              name="Hőmérséklet (°C)"
              dot={false}
              connectNulls
              stroke="#ef4444"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              isAnimationActive
              animationDuration={500}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 2) PÁRA */}
      <div className="chartArea" style={{ height: 220 }}>
        <ResponsiveContainer>
          <LineChart data={smoothData}>
            <CartesianGrid stroke={border} strokeDasharray="3 3" />
            <XAxis
              dataKey="ts"
              tickFormatter={fmtTime}
              minTickGap={24}
              tick={{ fill: text }}
              axisLine={{ stroke: border }}
              tickLine={{ stroke: border }}
            />
            <YAxis
              domain={hDom as any}
              tick={{ fill: text }}
              axisLine={{ stroke: border }}
              tickLine={{ stroke: border }}
              width={44}
            />
            <Tooltip
              labelFormatter={(v) => new Date(v as string).toLocaleString()}
              {...commonTooltip}
            />
            <Legend
              wrapperStyle={{ color: text }}
              formatter={(value) => <span style={{ color: text }}>{value}</span>}
            />
            <Line
              type="natural"
              dataKey="hum_s"               // ✅ SIMÍTOTT sor
              name="Páratartalom (%)"
              dot={false}
              connectNulls
              stroke="#3b82f6"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              isAnimationActive
              animationDuration={500}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}