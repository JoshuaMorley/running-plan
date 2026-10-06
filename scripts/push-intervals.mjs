#!/usr/bin/env node
/* Sends the plan to intervals.icu as planned workouts, which intervals.icu then syncs to Garmin Connect.
   Usage: node --env-file=.env scripts/push-intervals.mjs [--build A|S] [--d1 pass|fail] [--target 259|305|310|315]
          [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--dry-run]
   Re-run after each decision: events are matched on external_id, so they're updated rather than duplicated. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ctx = { window: {} };
vm.runInNewContext(readFileSync(fileURLToPath(new URL("../js/data.js", import.meta.url)), "utf8"), ctx);
const P = ctx.window.PLAN;

/* ---------- copied from js/app.js; keep in sync ---------- */
const MARATHON_KM = 42.195;
const RACE_DATE = "2026-11-01";
const TARGETS = { "259": 255 * 42.195, "305": 11100, "310": 11400, "315": 11700 };
const ALLOWED = { A1: ["259", "305", "310"], A2: ["305", "310", "315"], S1: ["305", "310", "315"] };

function fmtPace(sec) {
  sec = Math.round(sec);
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ":" + (s < 10 ? "0" : "") + s;
}

/* ---------- args ---------- */
const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : dflt; }
const dryRun = args.includes("--dry-run");
const today = new Date().toLocaleDateString("en-CA");
const st = { d0: arg("build", "A"), d1: arg("d1", "pass"), d2: arg("target") };
const from = arg("from", today), to = arg("to", RACE_DATE);

function l2() { return st.d0 === "S" ? "S1" : (st.d1 === "pass" ? "A1" : "A2"); }
function halfKey() { return l2() === "A1" ? "A" : "S"; }
function fail(msg) { console.error(msg); process.exit(1); }
if (st.d0 !== "A" && st.d0 !== "S") fail("--build must be A (sub-3) or S (3:10)");
if (st.d1 !== "pass" && st.d1 !== "fail") fail("--d1 must be pass or fail");
if (!st.d2) st.d2 = l2() === "A1" ? "259" : "310";
if (ALLOWED[l2()].indexOf(st.d2) < 0) fail("--target " + st.d2 + " isn't an option on this route. Choose from: " + ALLOWED[l2()].join(", "));

const mp = TARGETS[st.d2] / MARATHON_KM;
function fill(str) {
  return String(str).replace(/\{mp([+-]\d+)?\}/g, (_, off) => fmtPace(mp + (off ? parseInt(off, 10) : 0)));
}
function resolve(day) {
  const key = day.altBy === "half" ? halfKey() : st.d0;
  return key === "A" && day.alt ? Object.assign({}, day, day.alt) : day;
}

/* ---------- heart rate guide ----------
   Garmin only takes one target type per workout, so the steps keep pace targets and the HR ranges go in the notes.
   Bands are estimates from the 4 Oct long run (4:13–4:19/km at HR 153–168) and the 29 Sep 5k (avg HR 184). */
const HR_BANDS = [
  [300, "easy, HR 125–150. Over 150 means slow down"],
  [285, "steady, HR about 140–158"],
  [260, "HR about 150–162"],
  [250, "HR about 158–170"],
  [237, "HR about 165–175"],
  [220, "HR about 172–182"],
  [0, "too short for HR to settle. Run these by pace"]
];
function hrGuide(d, steps) {
  const out = [];
  steps.forEach((s) => {
    const m = s.match(/(\d+):(\d\d)-(\d+):(\d\d)\/km Pace/);
    let line = null;
    if (m) {
      const a = +m[1] * 60 + +m[2], b = +m[3] * 60 + +m[4];
      line = fmtPace(Math.min(a, b)) + "–" + fmtPace(Math.max(a, b)) + "/km: " + HR_BANDS.find(([min]) => Math.min(a, b) >= min)[1];
    } else if (d.t === "race" && /^- \d+(\.\d+)?km$/.test(s.trim())) {
      line = "Race effort: HR climbs past 180 (your 5k averaged 184). Run it by feel";
    }
    if (line && out.indexOf(line) < 0) out.push(line);
  });
  return out.length ? ["", "Heart rate guide (estimated from your recent runs, may be off):"].concat(out.map((x) => "• " + x)) : [];
}

/* ---------- build events ---------- */
function lines(x) { return x == null ? [] : (Array.isArray(x) ? x : [x]); }
const events = [], restWarnings = [];
P.WEEKS.forEach((w) => w.days.forEach((raw) => {
  if (raw.d < from || raw.d > to) return;
  const d = resolve(raw);
  if (d.t === "rest") {
    /* A day that's a run on the other branch may already be on the calendar. */
    if (raw.alt && raw.alt.steps) restWarnings.push(raw.d);
    return;
  }
  if (!d.steps) fail("No steps for " + d.d + " (" + d.title + "). Add them to STEPS in js/data.js.");
  const notes = lines(d.detail).map((x) => "• " + fill(x));
  if (d.why) notes.push("", "Why: " + d.why);
  if (d.fuel) notes.push("", "Fuel: " + d.fuel.replace(/\{load\}/g, "your carb-load amount (see the Fuel tab)"));
  notes.push(...hrGuide(d, d.steps.map(fill)));
  events.push({
    category: "WORKOUT",
    type: "Run",
    start_date_local: d.d + "T00:00:00",
    name: fill(d.title),
    external_id: "akl-" + d.d,
    description: notes.join("\n") + "\n\n" + d.steps.map(fill).join("\n")
  });
}));

console.log("Route: " + (st.d0 === "A" ? "sub-3 build" : "3:10 build") + ", Test 1 " + st.d1 + ", target " + st.d2 + " (" + fmtPace(mp) + "/km)");
console.log(events.length + " workouts from " + from + " to " + to);
if (restWarnings.length) console.log("Note: these days are rest on this route. If an earlier push put a workout on them, delete it in intervals.icu: " + restWarnings.join(", "));

if (dryRun) {
  events.forEach((e) => console.log("\n=== " + e.start_date_local.slice(0, 10) + " · " + e.name + " ===\n" + e.description));
  process.exit(0);
}

const id = process.env.INTERVALS_ATHLETE_ID, key = process.env.INTERVALS_API_KEY;
if (!id || !key) fail("Set INTERVALS_ATHLETE_ID and INTERVALS_API_KEY in .env, then run with node --env-file=.env");
if (!events.length) process.exit(0);

const res = await fetch("https://intervals.icu/api/v1/athlete/" + encodeURIComponent(id) + "/events/bulk?upsert=true", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Basic " + Buffer.from("API_KEY:" + key).toString("base64") },
  body: JSON.stringify(events)
});
if (!res.ok) fail("intervals.icu returned " + res.status + ": " + (await res.text()));
const saved = await res.json();
console.log("Saved " + saved.length + " workouts to intervals.icu.");
