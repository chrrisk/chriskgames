import { useEffect, useState } from "react";
import {
	CATEGORY_GROUP_LABELS,
	UNLIMITED_CATEGORIES,
	type CategoryGroup,
	type UnlimitedCategory,
} from "../../../shared/unlimited-catalog";
import { useClickSound } from "../../lib/sound";
import { importPlaylist, searchArtists, type ArtistResult } from "./api";
import { formatSeconds, type Settings } from "./helpers";
import { SettingsPanel } from "./SettingsPanel";
import { loadPlaylists, removePlaylist, savePlaylist, type SavedPlaylist, type Stats } from "./storage";

type LobbyProps = {
	settings: Settings;
	stats: Stats;
	busy: boolean;
	error: string | null;
	onSettingsChange: (next: Settings) => void;
	onPlayCategory: (category: UnlimitedCategory | "mix") => void;
	onPlayArtist: (artist: ArtistResult) => void;
	onPlayPlaylist: (playlist: SavedPlaylist) => void;
	onOpenBuilder: () => void;
};

const GROUP_ORDER: CategoryGroup[] = ["eras", "genres", "vibes"];

const PROVIDER_LABELS = { spotify: "Spotify", apple: "Apple Music", deezer: "Deezer" } as const;

export function Lobby({
	settings,
	stats,
	busy,
	error,
	onSettingsChange,
	onPlayCategory,
	onPlayArtist,
	onPlayPlaylist,
	onOpenBuilder,
}: LobbyProps) {
	const playClick = useClickSound();
	const [tab, setTab] = useState<"browse" | "yours" | "settings">("browse");
	const [playlists, setPlaylists] = useState<SavedPlaylist[]>(() => loadPlaylists());
	const [importUrl, setImportUrl] = useState("");
	const [importBusy, setImportBusy] = useState(false);
	const [importError, setImportError] = useState<string | null>(null);
	const [artistQuery, setArtistQuery] = useState("");
	const [artistResults, setArtistResults] = useState<ArtistResult[]>([]);
	const [artistBusy, setArtistBusy] = useState(false);

	useEffect(() => {
		const trimmed = artistQuery.trim();
		if (!trimmed) {
			setArtistResults([]);
			setArtistBusy(false);
			return;
		}
		const controller = new AbortController();
		const timeout = window.setTimeout(async () => {
			setArtistBusy(true);
			try {
				setArtistResults(await searchArtists(trimmed, controller.signal));
			} catch {
				if (!controller.signal.aborted) setArtistResults([]);
			} finally {
				if (!controller.signal.aborted) setArtistBusy(false);
			}
		}, 300);
		return () => {
			controller.abort();
			window.clearTimeout(timeout);
		};
	}, [artistQuery]);

	const handleImport = async () => {
		const url = importUrl.trim();
		if (!url) return;
		setImportBusy(true);
		setImportError(null);
		try {
			const imported = await importPlaylist(url);
			const saved: SavedPlaylist = { ...imported, addedAt: Date.now() };
			setPlaylists(savePlaylist(saved));
			setImportUrl("");
		} catch (err) {
			setImportError(err instanceof Error ? err.message : "Unable to import that playlist");
		} finally {
			setImportBusy(false);
		}
	};

	const averageScore = stats.played > 0 ? Math.round(stats.scoreSum / stats.played) : null;
	const solveRate = stats.played > 0 ? Math.round((stats.solved / stats.played) * 100) : null;
	const ladderLabel =
		settings.ladderPreset === "custom" ? "custom ladder" : `${settings.ladderPreset} ladder`;

	return (
		<div className="ul-lobby">
			<section className="ul-hero">
				<div>
					<p className="eyebrow">songgame · unlimited</p>
					<h1>
						Pick a lane. <em>Name that tune.</em>
					</h1>
					<p className="ul-hero-sub">
						Five songs per round, snippets as short as {formatSeconds(settingsFirstStep(settings))}s, no daily limit.
						Bring your own playlist or go by era, genre or artist.
					</p>
				</div>
				<div className="ul-stat-strip" aria-label="Your stats">
					<div className="ul-stat">
						<strong>{stats.played}</strong>
						<span>songs</span>
					</div>
					<div className="ul-stat">
						<strong>{solveRate === null ? "–" : `${solveRate}%`}</strong>
						<span>solved</span>
					</div>
					<div className="ul-stat">
						<strong>{averageScore === null ? "–" : averageScore}</strong>
						<span>avg score</span>
					</div>
					<div className="ul-stat">
						<strong>{stats.streak}</strong>
						<span>streak · best {stats.bestStreak}</span>
					</div>
				</div>
			</section>

			<div className="ul-tabs" role="tablist">
				<button type="button" role="tab" aria-selected={tab === "browse"} className={tab === "browse" ? "active" : ""} onClick={() => { playClick(); setTab("browse"); }}>
					Browse
				</button>
				<button type="button" role="tab" aria-selected={tab === "yours"} className={tab === "yours" ? "active" : ""} onClick={() => { playClick(); setTab("yours"); }}>
					Your music{playlists.length ? ` · ${playlists.length}` : ""}
				</button>
				<button type="button" role="tab" aria-selected={tab === "settings"} className={tab === "settings" ? "active" : ""} onClick={() => { playClick(); setTab("settings"); }}>
					Settings · {ladderLabel}
				</button>
				<button type="button" className="ul-tab-cta" onClick={() => { playClick(); onOpenBuilder(); }}>
					Make a quiz for a friend →
				</button>
			</div>

			{error ? <p className="ul-error ul-error-banner">{error}</p> : null}

			{tab === "browse" ? (
				<div className="ul-browse">
					<button
						type="button"
						className="ul-category ul-category-mix"
						disabled={busy}
						onClick={() => { playClick(); onPlayCategory("mix"); }}
					>
						<span className="ul-category-emoji" aria-hidden="true">🎲</span>
						<span className="ul-category-text">
							<strong>Mix it up</strong>
							<small>One song from five different categories. Anything goes.</small>
						</span>
						<span className="ul-category-go" aria-hidden="true">Play →</span>
					</button>
					{GROUP_ORDER.map((group) => (
						<section className="ul-group" key={group}>
							<h3>{CATEGORY_GROUP_LABELS[group]}</h3>
							<div className="ul-category-grid">
								{UNLIMITED_CATEGORIES.filter((category) => category.group === group).map((category) => (
									<button
										type="button"
										key={category.id}
										className="ul-category"
										disabled={busy}
										onClick={() => { playClick(); onPlayCategory(category); }}
									>
										<span className="ul-category-emoji" aria-hidden="true">{category.emoji}</span>
										<span className="ul-category-text">
											<strong>{category.title}</strong>
											<small>{category.blurb}</small>
										</span>
									</button>
								))}
							</div>
						</section>
					))}
				</div>
			) : null}

			{tab === "yours" ? (
				<div className="ul-yours">
					<section className="ul-panel">
						<div className="ul-panel-head">
							<h3>Play from a playlist</h3>
							<p>Paste a public Spotify, Apple Music or Deezer playlist or album link. We pull the track list and match each song to a 30-second preview.</p>
						</div>
						<div className="ul-inline-form">
							<input
								type="url"
								value={importUrl}
								placeholder="https://open.spotify.com/playlist/…"
								aria-label="Playlist link"
								onChange={(event) => setImportUrl(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										void handleImport();
									}
								}}
								disabled={importBusy}
							/>
							<button type="button" className="primary-btn" onClick={() => void handleImport()} disabled={importBusy || !importUrl.trim()}>
								{importBusy ? "Importing…" : "Import"}
							</button>
						</div>
						{importError ? <p className="ul-error">{importError}</p> : null}
						{playlists.length > 0 ? (
							<ul className="ul-playlist-list">
								{playlists.map((playlist) => (
									<li key={playlist.key} className="ul-playlist">
										{playlist.artwork ? <img src={playlist.artwork} alt="" /> : <span className="ul-playlist-art-fallback" aria-hidden="true">🎶</span>}
										<div className="ul-playlist-text">
											<strong>{playlist.name}</strong>
											<small>
												{PROVIDER_LABELS[playlist.provider]} · {playlist.tracks.length} tracks
											</small>
										</div>
										<div className="ul-playlist-actions">
											<button type="button" className="primary-btn" disabled={busy} onClick={() => { playClick(); onPlayPlaylist(playlist); }}>
												Play
											</button>
											<button
												type="button"
												className="ghost-btn"
												aria-label={`Remove ${playlist.name}`}
												onClick={() => setPlaylists(removePlaylist(playlist.key))}
											>
												Remove
											</button>
										</div>
									</li>
								))}
							</ul>
						) : (
							<p className="ul-hint">Imported playlists stay on this device so you can come back to them.</p>
						)}
					</section>

					<section className="ul-panel">
						<div className="ul-panel-head">
							<h3>Artist deep dive</h3>
							<p>Every round pulls from one artist's most-played songs.</p>
						</div>
						<input
							type="text"
							value={artistQuery}
							placeholder="Search an artist"
							aria-label="Search artists"
							onChange={(event) => setArtistQuery(event.target.value)}
						/>
						{artistBusy ? <p className="ul-hint">Searching…</p> : null}
						{artistResults.length > 0 ? (
							<div className="ul-artist-grid">
								{artistResults.map((artist) => (
									<button
										type="button"
										key={artist.id}
										className="ul-artist"
										disabled={busy}
										onClick={() => { playClick(); onPlayArtist(artist); }}
									>
										{artist.picture ? <img src={artist.picture} alt="" /> : <span className="ul-artist-fallback" aria-hidden="true">🎤</span>}
										<strong>{artist.name}</strong>
										<small>{formatFans(artist.fans)}</small>
									</button>
								))}
							</div>
						) : null}
					</section>
				</div>
			) : null}

			{tab === "settings" ? <SettingsPanel settings={settings} onChange={onSettingsChange} /> : null}
		</div>
	);
}

function settingsFirstStep(settings: Settings) {
	if (settings.ladderPreset === "custom") return settings.customLadder[0] ?? 0.5;
	if (settings.ladderPreset === "easy") return 1;
	if (settings.ladderPreset === "audiophile") return 0.25;
	return 0.5;
}

function formatFans(count: number) {
	if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M fans`;
	if (count >= 1_000) return `${Math.round(count / 1_000)}K fans`;
	return count > 0 ? `${count} fans` : "";
}

