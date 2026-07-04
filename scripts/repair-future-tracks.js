#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const START_DATE = "2026-04-01";
const workerPath = join(dirname(fileURLToPath(import.meta.url)), "../src/worker/schedule.ts");
const source = readFileSync(workerPath, "utf8");

const scheduleMatch = source.match(/const WEEKLY_TRACK_SCHEDULE[^=]*=\s*\{([\s\S]*?)\};\s*\n/);
if (!scheduleMatch) {
	console.error("Could not find WEEKLY_TRACK_SCHEDULE in worker/schedule.ts");
	process.exit(1);
}

const entryPattern = /"(\d{4}-\d{2}-\d{2})":\s*\{([^}]+)\}/g;
const trackPattern = /(\w+):\s*"(\d+)"(?:[^\n]*?\/\/([^\n]*))?/g;

const entries = [];
let entryMatch;
while ((entryMatch = entryPattern.exec(scheduleMatch[1])) !== null) {
	const date = entryMatch[1];
	if (date < START_DATE) continue;
	const body = entryMatch[2];
	let trackMatch;
	while ((trackMatch = trackPattern.exec(body)) !== null) {
		const category = trackMatch[1];
		const id = trackMatch[2];
		const comment = (trackMatch[3] ?? "").trim();
		entries.push({ date, category, id, comment });
	}
}

const commentToReplacement = new Map();
const idToReplacement = new Map();

for (const entry of entries) {
	if (!entry.comment || commentToReplacement.has(entry.comment)) continue;
	const replacement = await findReplacement(entry.comment);
	if (!replacement) {
		console.log(`[skip] ${entry.date}/${entry.category} -> ${entry.comment}`);
		continue;
	}
	commentToReplacement.set(entry.comment, replacement);
	if (idToReplacement.has(entry.id) && idToReplacement.get(entry.id) !== replacement.id) {
		console.warn(`Conflicting replacement for ${entry.id}: ${idToReplacement.get(entry.id)} vs ${replacement.id}`);
		continue;
	}
	idToReplacement.set(entry.id, replacement.id);
	console.log(`[ok] ${entry.date}/${entry.category} -> ${replacement.id} (${replacement.title} - ${replacement.artist})`);
	await sleep(250);
}

if (idToReplacement.size === 0) {
	console.log("No replacements were needed.");
	process.exit(0);
}

let updatedSource = source;
for (const [oldId, newId] of idToReplacement.entries()) {
	if (oldId === newId) continue;
	const oldPattern = new RegExp(`"${escapeRegExp(oldId)}"`, "g");
	updatedSource = updatedSource.replace(oldPattern, `"${newId}"`);
}

writeFileSync(workerPath, updatedSource, "utf8");
console.log(`Applied ${idToReplacement.size} track replacements.`);

async function findReplacement(comment) {
	const parts = comment.split(/\s+-\s+/);
	let expectedArtist = "";
	let expectedTitle = comment;
	if (parts.length >= 2) {
		expectedArtist = parts[0].trim();
		expectedTitle = parts.slice(1).join(" - ").trim();
	}
	const query = parts.length >= 2 ? `${expectedTitle} ${expectedArtist}` : comment;
	const encodedQuery = encodeURIComponent(query);
	let results = [];
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			const response = await fetch(`https://api.deezer.com/search/track?q=${encodedQuery}&limit=10`);
			const data = await response.json();
			results = Array.isArray(data?.data) ? data.data : [];
			if (results.length > 0) break;
		} catch (error) {
			if (attempt === 3) return null;
		}
		await sleep(800 * (attempt + 1));
	}

	if (results.length === 0) return null;
	const expectedTitleNorm = normalizeText(expectedTitle);
	const expectedArtistNorm = normalizeText(expectedArtist);
	const scored = results
		.map((track) => ({ track, score: scoreTrack(track, expectedTitleNorm, expectedArtistNorm) }))
		.filter(({ track }) => Boolean(track.preview))
		.sort((a, b) => b.score - a.score);

	const best = scored[0]?.track ?? null;
	if (!best) return null;
	return {
		id: String(best.id),
		title: best.title ?? best.title_short ?? comment,
		artist: best.artist?.name ?? "",
	};
}

function scoreTrack(track, expectedTitleNorm, expectedArtistNorm) {
	const title = normalizeText(track.title ?? track.title_short ?? "");
	const artist = normalizeText(track.artist?.name ?? "");
	let score = 0;
	if (track.preview) score += 100;
	if (title === expectedTitleNorm) score += 80;
	if (expectedTitleNorm && (title.includes(expectedTitleNorm) || expectedTitleNorm.includes(title))) score += 45;
	if (expectedArtistNorm && (artist === expectedArtistNorm || artist.includes(expectedArtistNorm) || expectedArtistNorm.includes(artist))) {
		score += 30;
	}
	if (expectedTitleNorm && title.includes("live") && !expectedTitleNorm.includes("live")) score -= 10;
	if (expectedTitleNorm && title.includes("remix") && !expectedTitleNorm.includes("remix")) score -= 10;
	return score;
}

function normalizeText(value) {
	return value
		.toLowerCase()
		.replace(/\([^)]*\)/g, "")
		.replace(/feat\..*/gi, "")
		.replace(/&/g, "and")
		.replace(/[^\p{L}\p{N} ]/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}