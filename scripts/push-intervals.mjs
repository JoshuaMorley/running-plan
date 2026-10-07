#!/usr/bin/env node
/* Sends the plan to intervals.icu as planned workouts, which intervals.icu then syncs to Garmin Connect.
   Usage: node --env-file=.env scripts/push-intervals.mjs [--build A|S] [--d1 pass|fail] [--target 259|305|310|315]
          [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--dry-run]
   Re-run after each decision: events are matched on external_id, so they're updated rather than duplicated. */
import { RACE_DATE, arg, flag, fail, routeLabel, sessions } from "./plan.mjs";

const dryRun = flag("dry-run");
const today = new Date().toLocaleDateString("en-CA");
const from = arg("from", today), to = arg("to", RACE_DATE);

const { sessions: list, restWarnings } = sessions(from, to);
const events = list.map((s) => ({
  category: "WORKOUT",
  type: "Run",
  start_date_local: s.day.d + "T00:00:00",
  name: s.title,
  external_id: "akl-" + s.day.d,
  description: s.notes.join("\n") + "\n\n" + s.steps.join("\n")
}));

console.log("Route: " + routeLabel);
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
