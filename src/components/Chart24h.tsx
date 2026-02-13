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

export default function Chart24h({ data }: { data: Row[] }) {
  const text = "rgba(233,238,252,.92)";   // kb. var(--text)
  const muted = "rgba(233,238,252,.55)";  // halványabb segéd
  const border = "rgba(255,255,255,.12)";

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, marginBottom: 12 }}>Utolsó 24 óra</h3>

      <div className="chartArea">
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
              tick={{ fill: text }}
              axisLine={{ stroke: border }}
              tickLine={{ stroke: border }}
            />

            <Tooltip
              labelFormatter={(v) => new Date(v as string).toLocaleString()}
              contentStyle={{
                background: "rgba(15,26,47,.92)",
                border: `1px solid ${border}`,
                borderRadius: 14,
                color: text,
              }}
              itemStyle={{ color: text }}
              labelStyle={{ color: muted }}
            />

            <Legend
              wrapperStyle={{ color: text }}
              formatter={(value) => <span style={{ color: text }}>{value}</span>}
            />

            <Line type="monotone" dataKey="temp" name="Hőmérséklet (°C)" dot={false} />
            <Line type="monotone" dataKey="hum" name="Páratartalom (%)" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}