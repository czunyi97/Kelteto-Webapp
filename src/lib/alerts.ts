import { supabase } from "./supabase";

export type AlertLevel = "warn" | "alert";

export type AlertRow = {
  id: string;
  device_id: string;
  ts: string;
  level: AlertLevel;
  code: string;
  message: string;
  value: number | null;
};

type StateLike = {
  device_id: string;
  temp: number | null;
  hum: number | null;
};

const RULES = {
  TEMP_HIGH: { level: "alert" as const, threshold: 38.2, msg: "Túl magas hőmérséklet" },
  TEMP_LOW: { level: "alert" as const, threshold: 36.8, msg: "Túl alacsony hőmérséklet" },
  HUM_HIGH: { level: "warn" as const, threshold: 65.0, msg: "Magas páratartalom" },
  HUM_LOW: { level: "warn" as const, threshold: 40.0, msg: "Alacsony páratartalom" },
};

// Egyszerű “duplázásgátló”: ugyanaz a code csak 10 percen belül ne kerüljön be újra
async function recentlyLogged(device_id: string, code: string) {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("alerts")
    .select("id")
    .eq("device_id", device_id)
    .eq("code", code)
    .gte("ts", since)
    .limit(1);

  if (error) return false; // ha hiba van, inkább engedjük a logolást
  return (data?.length ?? 0) > 0;
}

export async function evaluateAndLogAlerts(state: StateLike) {
  const { device_id, temp, hum } = state;

  // TEMP
  if (temp != null) {
    if (temp >= RULES.TEMP_HIGH.threshold) {
      const code = "TEMP_HIGH";
      if (!(await recentlyLogged(device_id, code))) {
        await supabase.from("alerts").insert({
          device_id,
          level: RULES.TEMP_HIGH.level,
          code,
          message: RULES.TEMP_HIGH.msg,
          value: temp,
        });
      }
    } else if (temp <= RULES.TEMP_LOW.threshold) {
      const code = "TEMP_LOW";
      if (!(await recentlyLogged(device_id, code))) {
        await supabase.from("alerts").insert({
          device_id,
          level: RULES.TEMP_LOW.level,
          code,
          message: RULES.TEMP_LOW.msg,
          value: temp,
        });
      }
    }
  }

  // HUM
  if (hum != null) {
    if (hum >= RULES.HUM_HIGH.threshold) {
      const code = "HUM_HIGH";
      if (!(await recentlyLogged(device_id, code))) {
        await supabase.from("alerts").insert({
          device_id,
          level: RULES.HUM_HIGH.level,
          code,
          message: RULES.HUM_HIGH.msg,
          value: hum,
        });
      }
    } else if (hum <= RULES.HUM_LOW.threshold) {
      const code = "HUM_LOW";
      if (!(await recentlyLogged(device_id, code))) {
        await supabase.from("alerts").insert({
          device_id,
          level: RULES.HUM_LOW.level,
          code,
          message: RULES.HUM_LOW.msg,
          value: hum,
        });
      }
    }
  }
}