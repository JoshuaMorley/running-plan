#!/usr/bin/env node
/* One-time Strava login. Gets a refresh token for sync-strava.mjs and saves it to .env.
   Usage: node --env-file=.env scripts/strava-auth.mjs   (with STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in .env)
   Your Strava API app's "Authorization Callback Domain" must be localhost. */
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PORT = 8723;
const ENV = fileURLToPath(new URL("../.env", import.meta.url));
const { STRAVA_CLIENT_ID: id, STRAVA_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) { console.error("Add STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET to .env first, then run with node --env-file=.env"); process.exit(1); }

const url = "https://www.strava.com/oauth/authorize?" + new URLSearchParams({
  client_id: id, response_type: "code", approval_prompt: "force", scope: "read,activity:read_all",
  redirect_uri: "http://localhost:" + PORT + "/"
});
console.log("Open this link, sign in to Strava and press Authorize:\n\n" + url + "\n\nWaiting for Strava...");

const server = createServer(async (req, res) => {
  const q = new URL(req.url, "http://localhost").searchParams;
  if (!q.get("code") && !q.get("error")) { res.writeHead(404).end(); return; }
  if (q.get("error") || !(q.get("scope") || "").includes("activity:read")) {
    res.end("Strava access wasn't granted. Run the script again and leave the activity box ticked.");
    console.error("Not authorised: " + (q.get("error") || "activity access was unticked"));
    server.close(); process.exitCode = 1; return;
  }
  const tok = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: id, client_secret: secret, code: q.get("code"), grant_type: "authorization_code" })
  });
  if (!tok.ok) {
    res.end("Token exchange failed. See the terminal.");
    console.error("Token exchange failed (" + tok.status + "): " + (await tok.text()));
    server.close(); process.exitCode = 1; return;
  }
  const { refresh_token } = await tok.json();
  let env = "";
  try { env = readFileSync(ENV, "utf8"); } catch {}
  env = env.replace(/^STRAVA_REFRESH_TOKEN=.*\r?\n?/m, "");
  writeFileSync(ENV, env + (env && !env.endsWith("\n") ? "\n" : "") + "STRAVA_REFRESH_TOKEN=" + refresh_token + "\n");
  res.end("Done. You can close this tab.");
  console.log("Saved STRAVA_REFRESH_TOKEN to .env. Add the same value as a GitHub secret for the automatic sync.");
  server.close();
});
server.listen(PORT);
