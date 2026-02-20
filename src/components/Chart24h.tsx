import { useMemo } from "react";
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

type AlertPoint = { x: string; y: number; label: string };

function fmtTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function domainWithLimits(
  values: Array<number | null | undefined>,
  limitMin: number,
  limitMax: number,
  pad: number,
  decimals: number
) {
  const nums = values.filter(
    (v): v is number => typeof v === "number" && !Number.isNaN(v)
  );

  // ha nincs adat, akkor is a határérték legyen a domain
  let min = limitMin;
  let max = limitMax;

  if (nums.length) {
    const dataMin = Math.min(...nums);
    const dataMax = Math.max(...nums);
    min = Math.min(dataMin, limitMin);
    max = Math.max(dataMax, limitMax);
  }

  // padding
  min -= pad;
  max += pad;

  const k = Math.pow(10, decimals);
  const round = (x: number) => Math.round(x * k) / k;
  return [round(min), round(max)] as const;
}

// ✅ alerts -> pontok a görbén (közeli timestamphez illesztve)
function buildAlertPoints(
  data: Row[],
  alerts: AlertMiniRow[],
  key: "temp" | "hum"
): AlertPoint[] {
  if (!data.length || !alerts.length) return [];

  const xs = data.map((r) => new Date(r.ts).getTime());
  const ys = data.map((r) => r[key]);

  const out: AlertPoint[] = [];

  for (const a of alerts) {
    const at = new Date(a.ts).getTime();
    // legközelebbi index keresés (lineáris, elég 24h-ra)
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < xs.length; i++) {
      const d = Math.abs(xs[i] - at);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    const y = ys[bestI];
    if (typeof y === "number" && !Number.isNaN(y)) {
      out.push({
        x: data[bestI].ts,
        y,
        label: a.message ?? a.code ?? "Riasztás",
      });
    }
  }

  // duplikált pontok kiszűrése (azonos x/y)
  const uniq = new Map<string, AlertPoint>();
  for (const p of out) uniq.set(`${p.x}|${p.y}`, p);
  return Array.from(uniq.values());
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

  // ✅ domain mindig tartalmazza a határértékeket, így a zöld vonalak mindig látszanak
  const tDom = useMemo(
    () =>
      domainWithLimits(
        data.map((d) => d.temp),
        bands.tMin,
        bands.tMax,
        0.2,
        1
      ),
    [data, bands.tMin, bands.tMax]
  );
  const hDom = useMemo(
    () =>
      domainWithLimits(
        data.map((d) => d.hum),
        bands.hMin,
        bands.hMax,
        2,
        0
      ),
    [data, bands.hMin, bands.hMax]
  );

  const tempAlertPts = useMemo(
    () => buildAlertPoints(data, alerts, "temp"),
    [data, alerts]
  );
  const humAlertPts = useMemo(
    () => buildAlertPoints(data, alerts, "hum"),
    [data, alerts]
  );

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

  const green = "#22c55e";

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, marginBottom: 12 }}>Utolsó 24 óra</h3>

      {/* 1) HŐ */}
      <div className="chartArea" style={{ height: 220, marginBottom: 14 }}>
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
              width={72}
              tickFormatter={(v: any) => {
                const n = Number(v);
                if (Number.isFinite(n)) {
                  if (Math.abs(n - bands.tMin) < 1e-9)
                    return `Min ${n.toFixed(1)}°`;
                  if (Math.abs(n - bands.tMax) < 1e-9)
                    return `Max ${n.toFixed(1)}°`;
                  return n.toFixed(1);
                }
                return String(v);
              }}
            />
            <Tooltip
              labelFormatter={(v: any) => new Date(v as string).toLocaleString()}
              formatter={(value: any) =>
                typeof value === "number" ? value.toFixed(1) : value
              }
              {...commonTooltip}
            />
            <Legend
              wrapperStyle={{ color: text }}
              formatter={(value: any) => (
                <span style={{ color: text }}>{value}</span>
              )}
            />

            {/* ✅ zöld vastag szaggatott határvonalak (felirat a tengelyen van) */}
            <ReferenceLine
              y={bands.tMin}
              stroke={green}
              strokeWidth={3}
              strokeDasharray="8 6"
              ifOverflow="extendDomain"
            />
            <ReferenceLine
              y={bands.tMax}
              stroke={green}
              strokeWidth={3}
              strokeDasharray="8 6"
              ifOverflow="extendDomain"
            />

            {/* 🔔 riasztás pontok */}
            {tempAlertPts.map((p: AlertPoint) => (
              <ReferenceDot
                key={`t-${p.x}-${p.y}`}
                x={p.x}
                y={p.y}
                r={4.5}
                fill="#ef4444"
                stroke="#ef4444"
                ifOverflow="extendDomain"
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
      <div className="chartArea" style={{ height: 220 }}>
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
              width={72}
              tickFormatter={(v: any) => {
                const n = Number(v);
                if (Number.isFinite(n)) {
                  if (Math.abs(n - bands.hMin) < 1e-9)
                    return `Min ${n.toFixed(0)}%`;
                  if (Math.abs(n - bands.hMax) < 1e-9)
                    return `Max ${n.toFixed(0)}%`;
                  return n.toFixed(0);
                }
                return String(v);
              }}
            />
            <Tooltip
              labelFormatter={(v: any) => new Date(v as string).toLocaleString()}
              formatter={(value: any) =>
                typeof value === "number" ? value.toFixed(1) : value
              }
              {...commonTooltip}
            />
            <Legend
              wrapperStyle={{ color: text }}
              formatter={(value: any) => (
                <span style={{ color: text }}>{value}</span>
              )}
            />

            {/* ✅ zöld vastag szaggatott határvonalak (felirat a tengelyen van) */}
            <ReferenceLine
              y={bands.hMin}
              stroke={green}
              strokeWidth={3}
              strokeDasharray="8 6"
              ifOverflow="extendDomain"
            />
            <ReferenceLine
              y={bands.hMax}
              stroke={green}
              strokeWidth={3}
              strokeDasharray="8 6"
              ifOverflow="extendDomain"
            />

            {/* 🔔 riasztás pontok */}
            {humAlertPts.map((p: AlertPoint) => (
              <ReferenceDot
                key={`h-${p.x}-${p.y}`}
                x={p.x}
                y={p.y}
                r={4.5}
                fill="#ef4444"
                stroke="#ef4444"
                ifOverflow="extendDomain"
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