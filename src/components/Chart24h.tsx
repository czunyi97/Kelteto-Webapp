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

export default function Chart24h({ data }: { data: Row[] }) {
  const text = "rgba(233,238,252,.92)";
  const muted = "rgba(233,238,252,.55)";
  const border = "rgba(255,255,255,.12)";

  // ✅ Szűkített tartomány a VALÓDI értékekből (nem torzít)
  const tDom = domainTight(data.map((d) => d.temp), 0.2, 1);
  const hDom = domainTight(data.map((d) => d.hum), 2, 0);

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
              width={44}
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
            <Line
              type="monotone"          // ✅ csak rajzolási görbe, nem módosít adatot
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
              width={44}
              tickFormatter={(v) => Number(v).toFixed(0)}
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
            <Line
              type="monotone"          // ✅ csak rajzolás
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