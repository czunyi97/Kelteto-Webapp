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
  day: string;          // YYYY-MM-DD
  temp_avg: number | null;
  hum_avg: number | null;
};

function fmtDay(day: string) {
  // YYYY-MM-DD -> YYYY.MM.DD (szép)
  return day.replaceAll("-", ".");
}

export default function ChartDailyAvg({ data }: { data: Row[] }) {
  const text = "rgba(233,238,252,.92)";
  const muted = "rgba(233,238,252,.55)";
  const border = "rgba(255,255,255,.12)";

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, marginBottom: 12 }}>Napi átlag</h3>

      <div className="chartArea">
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid stroke={border} strokeDasharray="3 3" />

            <XAxis
              dataKey="day"
              tickFormatter={fmtDay}
              minTickGap={18}
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
              labelFormatter={(v) => `Nap: ${fmtDay(v as string)}`}
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

            <Line type="monotone" dataKey="temp_avg" name="Átlag hőmérséklet (°C)" dot={false} />
            <Line type="monotone" dataKey="hum_avg" name="Átlag páratartalom (%)" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}