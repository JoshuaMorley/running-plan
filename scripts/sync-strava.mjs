#!/usr/bin/env node
/* Pulls your runs since the plan started from Strava into js/results.js, which the site and calendar read, plus
   summaries of the 13 weeks before (for the fitness chart) and every Tuesday and Saturday 5k since 2025 (for the 5k page).
   Usage: node --env-file=.env scripts/sync-strava.mjs
   Needs STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET and STRAVA_REFRESH_TOKEN (see scripts/strava-auth.mjs).
   Only new or changed activities are fetched in full, so it's cheap to run often. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../js/results.js", import.meta.url));
const PLAN_START = "2026-09-28";
const RUN_TYPES = ["Run", "TrailRun", "VirtualRun"];

function fail(msg) { console.error(msg); process.exit(1); }
const { STRAVA_CLIENT_ID: id, STRAVA_CLIENT_SECRET: secret, STRAVA_REFRESH_TOKEN: refresh } = process.env;
if (!id || !secret || !refresh) fail("Set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET and STRAVA_REFRESH_TOKEN. Run scripts/strava-auth.mjs once to get the token.");

const tok = await fetch("https://www.strava.com/oauth/token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ client_id: id, client_secret: secret, grant_type: "refresh_token", refresh_token: refresh })
});
if (!tok.ok) fail("Strava token refresh failed (" + tok.status + "): " + (await tok.text()) + "\nThe refresh token may have changed or been revoked. Run scripts/strava-auth.mjs again and update the secret.");
const auth = await tok.json();
if (auth.refresh_token && auth.refresh_token !== refresh) {
  /* Never print the token: Actions logs on a public repo are public. */
  console.log("::warning::Strava issued a new refresh token. If the next sync fails, run scripts/strava-auth.mjs again and update the STRAVA_REFRESH_TOKEN secret.");
}

async function api(path) {
  const res = await fetch("https://www.strava.com/api/v3" + path, { headers: { Authorization: "Bearer " + auth.access_token } });
  if (!res.ok) fail("Strava " + path + " returned " + res.status + ": " + (await res.text()));
  return res.json();
}

/* Per-km splits as [metres, moving seconds, avg HR]. */
function splitsOf(d) {
  return (d.splits_metric || []).map((s) => [Math.round(s.distance * 10) / 10, s.moving_time, s.average_heartrate ? Math.round(s.average_heartrate) : null]);
}

/* Keep what's already synced so unchanged activities aren't fetched again. */
const ctx = { window: {} };
try { new Function("window", readFileSync(OUT, "utf8"))(ctx.window); } catch { ctx.window.RESULTS = { runs: [] }; }
const known = new Map((ctx.window.RESULTS.runs || []).map((r) => [r.id, r]));

/* The plan runs in NZ daylight time (UTC+13), so start from midnight NZ on the first day. */
const after = Math.floor(new Date(PLAN_START + "T00:00:00+13:00").getTime() / 1000);
/* One paged list from 2025 covers the plan, the history before it and the 5k page. The list has summaries only,
   so this is a couple of calls however many runs there are. */
const LIST_FROM = Math.floor(new Date("2025-01-01T00:00:00+13:00").getTime() / 1000);
const all = [];
for (let page = 1; ; page++) {
  const batch = await api("/athlete/activities?per_page=200&page=" + page + "&after=" + LIST_FROM);
  all.push(...batch.filter((a) => RUN_TYPES.includes(a.sport_type || a.type)));
  if (batch.length < 200) break;
}
all.sort((a, b) => a.start_date.localeCompare(b.start_date));
const startSec = (a) => Date.parse(a.start_date) / 1000;
const list = all.filter((a) => startSec(a) >= after);

const runs = [];
let fetched = 0;
for (const a of list) {
  const id = String(a.id), old = known.get(id);
  /* Entries without laps are from an older version of this script, so fetch those again. */
  if (old && old.laps && old.m === Math.round(a.distance * 10) / 10 && old.sec === a.moving_time && old.name === a.name) { runs.push(old); continue; }
  const d = await api("/activities/" + id);
  fetched++;
  runs.push({
    id,
    date: d.start_date_local.slice(0, 10),
    start: d.start_date_local.slice(0, 19),
    name: d.name,
    m: Math.round(d.distance * 10) / 10,
    sec: d.moving_time,
    hr: d.average_heartrate ? Math.round(d.average_heartrate) : null,
    maxHr: d.max_heartrate || null,
    elev: Math.round(d.total_elevation_gain || 0),
    kcal: d.calories ? Math.round(d.calories) : null,
    splits: splitsOf(d),
    /* Watch laps (auto km laps, or each rep on interval days) as [metres, moving seconds, avg HR, cadence].
       Strava gives run cadence for one foot, so double it for steps per minute. */
    laps: (d.laps || []).map((l) => [Math.round(l.distance * 10) / 10, l.moving_time, l.average_heartrate ? Math.round(l.average_heartrate) : null, l.average_cadence ? Math.round(l.average_cadence * 10) / 10 : null])
  });
}
runs.sort((a, b) => a.start.localeCompare(b.start));

/* Runs in the 13 weeks before the plan, as [date, moving seconds, metres, avg HR], so the fitness chart
   starts from your real training rather than from zero. The list endpoint has all of this, so no extra fetches. */
const HISTORY_DAYS = 91;
const hist = all.filter((a) => startSec(a) >= after - HISTORY_DAYS * 86400 && startSec(a) < after)
  .map((a) => [a.start_date_local.slice(0, 10), a.moving_time, Math.round(a.distance), a.average_heartrate ? Math.round(a.average_heartrate) : null]);

/* Splits for the 5k page and the long-run fade come from the full activity, so they're fetched once and kept.
   Plan runs already have theirs. */
const cached = new Map();
for (const r of runs) cached.set(r.id, { splits: r.splits });
for (const x of (ctx.window.RESULTS.fives || []).concat(ctx.window.RESULTS.longs || [])) if (x && x.id) cached.set(x.id, Object.assign({}, cached.get(x.id), x));
async function splitsFor(a) {
  const c = cached.get(String(a.id));
  if (c && c.splits) return c.splits;
  const d = await api("/activities/" + a.id);
  fetched++;
  return splitsOf(d);
}

/* Start temperature from the Open-Meteo weather archive (free, no key), kept once found. */
let weatherCalls = 0;
async function tempFor(a) {
  const c = cached.get(String(a.id));
  if (c && typeof c.temp === "number") return c.temp;
  const [lat, lon] = a.start_latlng && a.start_latlng.length ? a.start_latlng : [-36.85, 174.76];
  const day = a.start_date_local.slice(0, 10), hour = Math.min(23, Math.round(+a.start_date_local.slice(11, 13) + +a.start_date_local.slice(14, 16) / 60));
  try {
    const res = await fetch("https://archive-api.open-meteo.com/v1/archive?latitude=" + lat.toFixed(3) + "&longitude=" + lon.toFixed(3) + "&start_date=" + day + "&end_date=" + day + "&hourly=temperature_2m&timezone=Pacific%2FAuckland");
    weatherCalls++;
    if (!res.ok) return null;
    const t = (await res.json()).hourly.temperature_2m[hour];
    return typeof t === "number" ? t : null;
  } catch { return null; }
}

/* The 5k page: Tuesday-evening Good George runs and Saturday-morning parkruns, picked by day, start time and
   distance. Hard ones (faster than 4:50/km) get their km splits for the pacing chart. */
function isFive(a) {
  const t = a.start_date_local, day = new Date(t.slice(0, 10) + "T12:00:00Z").getUTCDay(), hm = +t.slice(11, 13) + +t.slice(14, 16) / 60;
  if (a.distance < 4400 || a.distance > 5300) return false;
  return (day === 2 && hm >= 17.5 && hm < 19) || (day === 6 && hm >= 7.75 && hm < 8.5);
}
const fives = [];
for (const a of all.filter(isFive)) {
  const t5 = a.distance >= 5000 ? a.moving_time : a.moving_time * 5000 / a.distance;
  fives.push({
    id: String(a.id), d: a.start_date_local.slice(0, 10), name: a.name, m: Math.round(a.distance), sec: a.moving_time,
    hr: a.average_heartrate ? Math.round(a.average_heartrate) : null, max: a.max_heartrate ? Math.round(a.max_heartrate) : null,
    temp: await tempFor(a), splits: t5 / 5 < 290 ? await splitsFor(a) : undefined
  });
}

/* Runs of 8 km or more since 2025, for comparing your endurance with your 5k speed. Those of 18 km or more get
   their km splits for the long-run fade chart. */
const longs = [];
for (const a of all.filter((x) => x.distance >= 8000)) {
  longs.push({
    id: String(a.id), d: a.start_date_local.slice(0, 10), name: a.name, m: Math.round(a.distance), sec: a.moving_time,
    hr: a.average_heartrate ? Math.round(a.average_heartrate) : null, elev: Math.round(a.total_elevation_gain || 0),
    splits: a.distance >= 18000 ? await splitsFor(a) : undefined
  });
}

/* Every run since 2025, for monthly distance, cadence, hills and time of day, as
   [date, start time, name, metres, moving seconds, avg HR, climb m, steps per minute]. Strava gives run cadence
   for one foot, so it's doubled. */
const allRuns = all.map((a) => [a.start_date_local.slice(0, 10), a.start_date_local.slice(11, 16), a.name, Math.round(a.distance), a.moving_time,
  a.average_heartrate ? Math.round(a.average_heartrate) : null, Math.round(a.total_elevation_gain || 0), a.average_cadence ? Math.round(a.average_cadence * 2) : null]);

const rows = (list) => "[\n" + list.map((x) => "  " + JSON.stringify(x)).join(",\n") + "\n]";
const body = "/* Generated by scripts/sync-strava.mjs from Strava. Don't edit by hand. */\n" +
  "window.RESULTS = { runs: " + rows(runs) + ",\n" +
  "history: " + JSON.stringify(hist) + ",\n" +
  "fives: " + rows(fives) + ",\n" +
  "longs: " + rows(longs) + ",\n" +
  "all: " + rows(allRuns) + " };\n";
let prev = "";
try { prev = readFileSync(OUT, "utf8"); } catch {}
if (body !== prev) writeFileSync(OUT, body);
console.log(runs.length + " runs since " + PLAN_START + " (" + fetched + " fetched from Strava), " + hist.length + " in the " + HISTORY_DAYS + " days before, " + fives.length + " Tuesday and Saturday 5ks, " + longs.length + " runs of 8 km or more (" + weatherCalls + " weather lookups). " + (body !== prev ? "Updated js/results.js." : "No changes."));
