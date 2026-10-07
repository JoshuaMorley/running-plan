#!/usr/bin/env node
/* Writes plan.ics, a calendar feed of every run on the chosen route. GitHub Pages serves it, so Google Calendar
   (or any calendar app) can subscribe to it by URL and pick up changes after each push.
   Usage: node scripts/build-ics.mjs [--build A|S] [--d1 pass|fail] [--target 259|305|310|315]
   Events keep the same UID per date, so a re-run updates them. Days that become rest drop out of the feed. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { P, RACE_DATE, st, routeLabel, sessions, runsOn, fmtPace } from "./plan.mjs";

const SITE = "https://joshuamorley.github.io/running-plan/";
const OUT = fileURLToPath(new URL("../plan.ics", import.meta.url));

/* RFC 5545 text escaping, and folding of lines longer than 75 bytes. */
function esc(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
function fold(line) {
  const out = [];
  let cur = "", bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > 75) { out.push(cur); cur = " "; bytes = 1; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join("\r\n");
}
const ymd = (iso) => iso.replace(/-/g, "");
function nextDay(iso) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
const { sessions: list } = sessions(P.WEEKS[0].days[0].d, RACE_DATE);

const lines = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//joshuamorley//Auckland Marathon plan//EN",
  "CALSCALE:GREGORIAN",
  "METHOD:PUBLISH",
  "X-WR-CALNAME:Auckland Marathon plan",
  "X-WR-CALDESC:" + esc("Runs on the " + routeLabel + ". " + SITE),
  "X-WR-TIMEZONE:Pacific/Auckland",
  "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
  "X-PUBLISHED-TTL:PT6H",
  /* Read by the site to show which route the feed follows. */
  "X-AKL-ROUTE:" + [st.d0, st.d1, st.d2].join("-")
];
/* The plan runs entirely in NZ daylight time (UTC+13), so local times convert with a fixed offset. */
function utc(iso, hhmm) {
  const [h, m] = hhmm.split(":").map(Number), [y, mo, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h - 13, m)).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
}
function stravaLine(date) {
  const runs = runsOn(date);
  if (!runs.length) return [];
  const m = runs.reduce((t, r) => t + r.m, 0), sec = runs.reduce((t, r) => t + r.sec, 0);
  const hrT = runs.reduce((t, r) => t + (r.hr ? r.hr * r.sec : 0), 0), hrS = runs.reduce((t, r) => t + (r.hr ? r.sec : 0), 0);
  return ["Strava: " + (Math.round(m / 100) / 10) + " km at " + fmtPace(sec / m * 1000) + "/km" + (hrS ? ", avg HR " + Math.round(hrT / hrS) : ""), ""];
}

list.forEach((s) => {
  const d = s.day, ran = runsOn(d.d).length > 0;
  const summary = (d.done || ran ? "✓ " : "") + s.title + (d.km && !/\bkm\b/.test(s.title) ? " · " + d.km + " km" : "");
  const notes = (d.result ? [d.result, ""] : []).concat(stravaLine(d.d), s.notes, ["", SITE + "#plan"]);
  lines.push(
    "BEGIN:VEVENT",
    "UID:akl-" + d.d + "@joshuamorley.github.io",
    "DTSTAMP:" + stamp,
    "DTSTART;VALUE=DATE:" + ymd(d.d),
    "DTEND;VALUE=DATE:" + ymd(nextDay(d.d)),
    "SUMMARY:" + esc(summary),
    "DESCRIPTION:" + esc(notes.join("\n")),
    "URL:" + SITE + "#plan",
    "TRANSP:TRANSPARENT",
    "END:VEVENT"
  );
});
/* Meal reminders: 45-minute timed events with the recipe, and an alert 30 min before
   (calendar apps may ignore alerts on subscribed calendars). */
P.REMINDERS.forEach((r) => {
  const meal = P.MEALS[r.meal];
  const notes = (r.note ? [r.note, ""] : []).concat(
    [meal.name + " · " + meal.carbs + " of carbs" + (meal.time ? " · " + meal.time : ""), ""],
    meal.items.map((x) => "• " + x), [""], meal.steps.map((x, i) => (i + 1) + ". " + x), ["", SITE + "#fuel"]);
  const [h, m] = r.at.split(":").map(Number), end = String(h + (m + 45 >= 60 ? 1 : 0)).padStart(2, "0") + ":" + String((m + 45) % 60).padStart(2, "0");
  lines.push(
    "BEGIN:VEVENT",
    "UID:akl-meal-" + r.d + "-" + r.at.replace(":", "") + "@joshuamorley.github.io",
    "DTSTAMP:" + stamp,
    "DTSTART:" + utc(r.d, r.at),
    "DTEND:" + utc(r.d, end),
    "SUMMARY:" + esc("🍽 " + r.title),
    "DESCRIPTION:" + esc(notes.join("\n")),
    "URL:" + SITE + "#fuel",
    "TRANSP:TRANSPARENT",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:" + esc(r.title),
    "TRIGGER:-PT30M",
    "END:VALARM",
    "END:VEVENT"
  );
});
lines.push("END:VCALENDAR");

/* Leave the file alone when only DTSTAMP would change, so the scheduled sync doesn't commit for nothing. */
const body = lines.map(fold).join("\r\n") + "\r\n";
const noStamp = (s) => s.replace(/^DTSTAMP:.*$/gm, "");
let prev = "";
try { prev = readFileSync(OUT, "utf8"); } catch {}
const changed = noStamp(body) !== noStamp(prev);
if (changed) writeFileSync(OUT, body);
console.log("Route: " + routeLabel);
console.log(changed ? "Wrote " + list.length + " runs and " + P.REMINDERS.length + " meal reminders to plan.ics. Commit and push it to update the calendar feed."
  : "plan.ics is already up to date.");
