#!/usr/bin/env node
// Validates all Deezer track IDs in the schedule against the Deezer API.
// Run: npm run validate-tracks
// Reports any tracks that are unavailable or missing a preview URL.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerSrc = readFileSync(join(__dirname, "../src/worker/schedule.ts"), "utf8");

// Extract the WEEKLY_TRACK_SCHEDULE block
const scheduleMatch = workerSrc.match(
	/const WEEKLY_TRACK_SCHEDULE[^=]*=\s*\{([\s\S]*?)\};\s*\n/
);
if (!scheduleMatch) {
	console.error("Could not find WEEKLY_TRACK_SCHEDULE in worker/schedule.ts");
	process.exit(1);
}

// Parse date entries and their track IDs
const entryPattern = /"(\d{4}-\d{2}-\d{2})":\s*\{([^}]+)\}/g;
const trackIdPattern = /(\w+):\s*"(\d+)"/g;

const schedule = [];
let entryMatch;
while ((entryMatch = entryPattern.exec(scheduleMatch[1])) !== null) {
	const date = entryMatch[1];
	const body = entryMatch[2];
	const tracks = {};
	let trackMatch;
	while ((trackMatch = trackIdPattern.exec(body)) !== null) {
		tracks[trackMatch[1]] = trackMatch[2];
	}
	schedule.push({ date, tracks });
}

// Collect unique IDs with context
const idMap = new Map(); // id -> [{ date, category }]
for (const { date, tracks } of schedule) {
	for (const [category, id] of Object.entries(tracks)) {
		if (!idMap.has(id)) idMap.set(id, []);
		idMap.get(id).push({ date, category });
	}
}

const uniqueIds = [...idMap.keys()];
console.log(`Checking ${uniqueIds.length} unique track IDs across ${schedule.length} schedule entries...\n`);

// Check tracks with a concurrency limit to avoid hammering the API
const CONCURRENCY = 5;
const DELAY_MS = 200;

const results = { ok: [], noPreview: [], unavailable: [], error: [] };

async function checkTrack(id) {
	await new Promise((r) => setTimeout(r, Math.random() * DELAY_MS));
	try {
		const res = await fetch(`https://api.deezer.com/track/${id}`);
		if (!res.ok) {
			return { id, status: "unavailable", reason: `HTTP ${res.status}` };
		}
		const data = await res.json();
		if (data.error || data.type === "error") {
			return { id, status: "unavailable", reason: data.error?.message ?? "Deezer error" };
		}
		if (!data.preview) {
			return { id, status: "noPreview", title: data.title, artist: data.artist?.name };
		}
		return { id, status: "ok", title: data.title, artist: data.artist?.name };
	} catch (err) {
		return { id, status: "error", reason: err.message };
	}
}

// Process in batches
for (let i = 0; i < uniqueIds.length; i += CONCURRENCY) {
	const batch = uniqueIds.slice(i, i + CONCURRENCY);
	const batchResults = await Promise.all(batch.map(checkTrack));
	for (const result of batchResults) {
		results[result.status].push(result);
		const contexts = idMap.get(result.id);
		const tag = result.status === "ok" ? "✅" : result.status === "noPreview" ? "⚠️" : "❌";
		const label = result.title ? `${result.title} — ${result.artist}` : result.reason ?? "unknown";
		for (const { date, category } of contexts) {
			console.log(`${tag} [${date}] ${category}: ${label} (id: ${result.id})`);
		}
	}
}

console.log(`\n--- Summary ---`);
console.log(`✅ OK:           ${results.ok.length}`);
console.log(`⚠️  No preview:  ${results.noPreview.length}`);
console.log(`❌ Unavailable:  ${results.unavailable.length}`);
console.log(`❌ Error:        ${results.error.length}`);

if (results.unavailable.length > 0 || results.error.length > 0) {
	console.log("\nFailed track IDs:");
	for (const r of [...results.unavailable, ...results.error]) {
		const contexts = idMap.get(r.id).map(({ date, category }) => `${date}/${category}`).join(", ");
		console.log(`  ${r.id}  (${contexts})  — ${r.reason ?? "unknown"}`);
	}
	process.exit(1);
}
