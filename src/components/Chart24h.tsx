import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ReferenceDot,
} from "recharts";

type Row = {
  ts: string;
  temp: number | null;
  hum: number | null;
};

type AlertMiniRow = {
  ts: string;
  code: string | null;
  message: string | null;
};

type Bands = {
  tMin: number;
  tMax: number;
  hMin: number;
  hMax: number;
};

function fmtTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function roundN(x: number, decimals: number) {
  const k = Math.pow(10, decimals);
  return Math.round(x * k) / k;
}

function domainTight(
  values: Array<number | null | undefined>,
  pad: number,
  decimals: number
): readonly [number, number] | undefined {
  const nums = values.filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  if (!nums.length) return undefined;

  let min = Math.min(...nums);
  let max = Math.max(...nums);

  if (min === max) {
    min -= pad;
    max += pad;
  } else {
    min -= pad;
    max += pad;
  }

  return [roundN(min, decimals), roundN(max, decimals)] as const;
}

/**
 * Kiterjeszti a domaint úgy, hogy a reference min/max vonalak biztosan látszódjanak.
 */
function extendDomainForBands(
  dom: readonly [number, number] | undefined,
  bandMin: number,
  bandMax: number,
  pad: number,
  decimals: number
): readonly [number, number] | undefined {
  // ha nincs adat-domain, de van sáv → legalább a sáv látszódjon
  if (!dom) {
    const min = Math.min(bandMin, bandMax) - pad;
    const max = Math.max(bandMin, bandMax) + pad;
    return [roundN(min, decimals), roundN(max, decimals)] as const;
  }

  const min = Math.min(dom[0], bandMin) - 0; // már benne a pad, nem kell duplázni
  const max = Math.max(dom[1], bandMax) + 0;

  // ha véletlen összecsukódna
  if (min === max) {
    return [roundN(min - pad, decimals), roundN(max + pad, decimals)] as const;
  }

  return [roundN(min, decimals), roundN(max, decimals)] as const;
}

function pickNearestValueAtTs(data: Row[], tsISO: string, key: "temp" | "hum") {
  const target = new Date(tsISO).getTime();
  let best: { v: number; dt: number } | null = null;

  for (const r of data) {
    const v = r[key];
    if (v == null || Number.isNaN(v)) continue;
    const t = new Date(r.ts).getTime();
    const dt = Math.abs(t - target);
    if (!best || dt < best.dt) best = { v, dt };
  }

  return best?.v ?? null;
}

export default function Chart24h({
  data,
  alerts = [],
  bands,
}: {
  data: Row[];
  alerts?: AlertMiniRow[];
  bands: Bands;
}) {
  const text = "rgba(233,238,252,.92)";
  const muted = "rgba(233,238,252,.55)";
  const border = "rgba(255,255,255,.12)";
  const green = "#22c55e";

  // alap domain az adatokból (zoom)
  const tDomRaw = domainTight(data.map((d) => d.temp), 0.2, 1);
  const hDomRaw = domainTight(data.map((d) => d.hum), 2, 0);

  // biztosan látszanak a min/max határok is
  const tDom = extendDomainForBands(tDomRaw, bands.tMin, bands.tMax, 0.2, 1);
  const hDom = extendDomainForBands(hDomRaw, bands.hMin, bands.hMax, 2, 0);

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

  // alert pontokhoz: ts-hez megkeressük a legközelebbi értéket
  const tempAlertDots = alerts
    .map((a) => {
      const y = pickNearestValueAtTs(data, a.ts, "temp");
      if (y == null) return null;
      return { ts: a.ts, y, label: a.message ?? a.code ?? "Riasztás" };
    })
    .filter(Boolean) as Array<{ ts: string; y: number; label: string }>;

  const humAlertDots = alerts
    .map((a) => {
      const y = pickNearestValueAtTs(data, a.ts, "hum");
      if (y == null) return null;
      return { ts: a.ts, y, label: a.message ?? a.code ?? "Riasztás" };
    })
    .filter(Boolean) as Array<{ ts: string; y: number; label: string }>;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, marginBottom: 12 }}>Utolsó 24 óra</h3>

      {/* 1) HŐ */}
      <div className="chartArea" style={{ height: 240, marginBottom: 14 }}>
        <ResponsiveContainer>
          <LineChart data={data}>
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
              width={54}
              tickFormatter={(v) => Number(v).toFixed(1)}
            />

            <Tooltip
              labelFormatter={(v) => new Date(v as string).toLocaleString()}
              formatter={(value: any) => (typeof value === "number" ? value.toFixed(1) : value)}
              {...commonTooltip}
            />

            <Legend
              wrapperStyle={{ color: text }}
              formatter={(value) => <span style={{ color: text }}>{value}</span>}
            />

            {/* ✅ zöld szaggatott MIN/MAX vonal + felirat */}
            <ReferenceLine
              y={bands.tMin}
              stroke={green}
              strokeWidth={3}
              strokeDasharray="8 6"
              ifOverflow="extendDomain"
              label={{
                value: `${bands.tMin.toFixed(1)}°C`,
                position: "right",
                fill: green,
                fontSize: 12,
              }}
            />
            <ReferenceLine
              y={bands.tMax}
              stroke={green}
              strokeWidth={3}
              strokeDasharray="8 6"
              ifOverflow="extendDomain"
              label={{
                value: `${bands.tMax.toFixed(1)}°C`,
                position: "right",
                fill: green,
                fontSize: 12,
              }}
            />

            {/* ✅ piros riasztás pontok */}
            {tempAlertDots.map((p, i) => (
              <ReferenceDot
                key={`t-alert-${i}`}
                x={p.ts}
                y={p.y}
                r={5}
                fill="#ef4444"
                stroke="#ef4444"
                ifOverflow="discard"
              />
            ))}

            <Line
              type="monotone"
              dataKey="temp"
              name="Hőmérséklet (°C)"
              dot={false}
              connectNulls
              stroke="#ef4444"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              isAnimationActive
              animationDuration={450}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 2) PÁRA */}
      <div className="chartArea" style={{ height: 240 }}>
        <ResponsiveContainer>
          <LineChart data={data}>
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
              width={54}
              tickFormatter={(v) => Number(v).toFixed(0)}
            />

            <Tooltip
              labelFormatter={(v) => new Date(v as string).toLocaleString()}
              formatter={(value: any, name: any) => {
                if (typeof value !== "number") return value;
                // hum: 0 tized
                return value.toFixed(0);
              }}
              {...commonTooltip}
            />

            <Legend
              wrapperStyle={{ color: text }}
              formatter={(value) => <span style={{ color: text }}>{value}</span>}
            />

            {/* ✅ zöld szaggatott MIN/MAX vonal + felirat */}
            <ReferenceLine
              y={bands.hMin}
              stroke={green}
              strokeWidth={3}
              strokeDasharray="8 6"
              ifOverflow="extendDomain"
              label={{
                value: `${bands.hMin.toFixed(0)}%`,
                position: "right",
                fill: green,
                fontSize: 12,
              }}
            />
            <ReferenceLine
              y={bands.hMax}
              stroke={green}
              strokeWidth={3}
              strokeDasharray="8 6"
              ifOverflow="extendDomain"
              label={{
                value: `${bands.hMax.toFixed(0)}%`,
                position: "right",
                fill: green,
                fontSize: 12,
              }}
            />

            {/* ✅ piros riasztás pontok */}
            {humAlertDots.map((p, i) => (
              <ReferenceDot
                key={`h-alert-${i}`}
                x={p.ts}
                y={p.y}
                r={5}
                fill="#ef4444"
                stroke="#ef4444"
                ifOverflow="discard"
              />
            ))}

            <Line
              type="monotone"
              dataKey="hum"
              name="Páratartalom (%)"
              dot={false}
              connectNulls
              stroke="#3b82f6"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              isAnimationActive
              animationDuration={450}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}