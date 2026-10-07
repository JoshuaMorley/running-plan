/* Shared by push-intervals.mjs and build-ics.mjs: loads js/data.js and js/results.js, reads the route from
   route.json and the command line, and resolves each day of the plan on that route. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ctx = { window: {} };
for (const f of ["../js/data.js", "../js/results.js"]) vm.runInNewContext(readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8"), ctx);
export const P = ctx.window.PLAN;
/* Strava runs on a date, from scripts/sync-strava.mjs. */
export function runsOn(date) { return (ctx.window.RESULTS.runs || []).filter((r) => r.date === date); }

/* ---------- copied from js/app.js; keep in sync ---------- */
const MARATHON_KM = 42.195;
export const RACE_DATE = "2026-11-01";
const TARGETS = { "259": 255 * 42.195, "305": 11100, "310": 11400, "315": 11700 };
const ALLOWED = { A1: ["259", "305", "310"], A2: ["305", "310", "315"], S1: ["305", "310", "315"] };

export function fmtPace(sec) {
  sec = Math.round(sec);
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ":" + (s < 10 ? "0" : "") + s;
}
function fmtClock(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (s < 10 ? "0" : "") + s;
}

/* ---------- args ---------- */
const args = process.argv.slice(2);
export function arg(name, dflt) { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : dflt; }
export const flag = (name) => args.includes("--" + name);
export function fail(msg) { console.error(msg); process.exit(1); }

/* route.json holds the route the automatic sync uses. Flags override it. */
const route = JSON.parse(readFileSync(fileURLToPath(new URL("../route.json", import.meta.url)), "utf8"));
/* A route change on the command line drops route.json's target, which may not exist on the new route. */
const routeFlag = args.includes("--build") || args.includes("--d1");
export const st = { d0: arg("build", route.build), d1: arg("d1", route.d1), d2: arg("target", routeFlag ? undefined : route.target) };
function l2() { return st.d0 === "S" ? "S1" : (st.d1 === "pass" ? "A1" : "A2"); }
function halfKey() { return l2() === "A1" ? "A" : "S"; }
if (st.d0 !== "A" && st.d0 !== "S") fail("--build must be A (sub-3) or S (3:10)");
if (st.d1 !== "pass" && st.d1 !== "fail") fail("--d1 must be pass or fail");
if (!st.d2) st.d2 = l2() === "A1" ? "259" : "310";
if (ALLOWED[l2()].indexOf(st.d2) < 0) fail("--target " + st.d2 + " isn't an option on this route. Choose from: " + ALLOWED[l2()].join(", "));

const mp = TARGETS[st.d2] / MARATHON_KM;
export const routeLabel = (st.d0 === "A" ? "sub-3 build" : "3:10 build") + ", Test 1 " + st.d1 + ", target " + st.d2 + " (" + fmtPace(mp) + "/km)";

export function fill(str) {
  return String(str)
    .replace(/\{mp([+-]\d+)?\}/g, (_, off) => fmtPace(mp + (off ? parseInt(off, 10) : 0)))
    .replace(/\{full\}/g, fmtClock(TARGETS[st.d2]).replace(/:00$/, ""));
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

/* ---------- sessions ---------- */
function lines(x) { return x == null ? [] : (Array.isArray(x) ? x : [x]); }

/* Every run between `from` and `to` on the chosen route, with its notes as lines of text.
   `restWarnings` lists days that are rest on this route but a run on the other branch. */
export function sessions(from, to) {
  const out = [], restWarnings = [];
  P.WEEKS.forEach((w) => w.days.forEach((raw) => {
    if (raw.d < from || raw.d > to) return;
    const d = resolve(raw);
    if (d.t === "rest") {
      if (raw.alt && raw.alt.steps) restWarnings.push(raw.d);
      return;
    }
    if (!d.steps) fail("No steps for " + d.d + " (" + d.title + "). Add them to STEPS in js/data.js.");
    const steps = d.steps.map(fill);
    const notes = lines(d.detail).map((x) => "• " + fill(x));
    if (d.why) notes.push("", "Why: " + d.why);
    if (d.fuel) notes.push("", "Fuel: " + d.fuel.replace(/\{load\}/g, "your carb-load amount (see the Fuel tab)"));
    notes.push(...hrGuide(d, steps));
    out.push({ day: d, title: fill(d.title), notes, steps });
  }));
  return { sessions: out, restWarnings };
}
