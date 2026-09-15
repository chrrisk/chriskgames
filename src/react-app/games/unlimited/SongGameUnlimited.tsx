import { useCallback, useEffect, useRef, useState } from "react";
import { MIX_CATEGORY_ID, type UnlimitedCategory } from "../../../shared/unlimited-catalog";
import { PageShell } from "../../components/PageShell";
import { useClickSound } from "../../lib/sound";
import {
	fetchQuiz,
	fetchRound,
	resolveTracks,
	submitQuizResult,
	type ArtistResult,
	type QuizPayload,
	type QuizStats,
} from "./api";
import {
	ROUND_SIZE,
	createSongState,
	formatSeconds,
	ladderForSettings,
	scoreEmoji,
	scoreForStep,
	sessionScore,
	shuffle,
	type Session,
	type SessionSource,
	type Settings,
	type SongState,
	type TrackResult,
} from "./helpers";
import { Lobby } from "./Lobby";
import { Player } from "./Player";
import { QuizBuilder } from "./QuizBuilder";
import {
	loadSeen,
	loadSettings,
	loadStats,
	markSeen,
	recordSong,
	saveSettings,
	updatePlaylistTracks,
	type SavedPlaylist,
	type Stats,
} from "./storage";
import { useSnippetPlayer } from "./useSnippetPlayer";
import "../../styles/unlimited.css";

type Screen = "lobby" | "play" | "summary" | "builder" | "quiz-intro";

type QuizState = { quiz: QuizPayload; stats: QuizStats; preview?: boolean };

export function SongGameUnlimited() {
	const playClick = useClickSound();
	const [settings, setSettings] = useState<Settings>(loadSettings);
	const [stats, setStats] = useState<Stats>(loadStats);
	const [screen, setScreen] = useState<Screen>("lobby");
	const [session, setSession] = useState<Session | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [quizState, setQuizState] = useState<QuizState | null>(null);
	const [quizResult, setQuizResult] = useState<QuizStats | null>(null);
	const [shareFeedback, setShareFeedback] = useState<string | null>(null);
	const recordedRef = useRef<Set<string>>(new Set());
	const player = useSnippetPlayer(settings.volume, settings.compress);

	useEffect(() => {
		saveSettings(settings);
	}, [settings]);

	// Deep link: /songgame/unlimited?quiz=<id>
	useEffect(() => {
		const id = new URLSearchParams(window.location.search).get("quiz");
		if (!id) return;
		let cancelled = false;
		setBusy(true);
		void fetchQuiz(id)
			.then((data) => {
				if (cancelled) return;
				if (data.quiz.tracks.length === 0) {
					setError("That quiz has no playable songs anymore.");
					return;
				}
				setQuizState({ quiz: data.quiz, stats: data.stats });
				setScreen("quiz-intro");
			})
			.catch((err: unknown) => {
				if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load that quiz");
			})
			.finally(() => {
				if (!cancelled) setBusy(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const beginSession = useCallback(
		(source: SessionSource, tracks: TrackResult[], ladderOverride?: number[] | null, randomStartOverride?: boolean, quizId?: string) => {
			const ladder = ladderOverride && ladderOverride.length >= 2 ? ladderOverride : ladderForSettings(settings);
			const randomStart = randomStartOverride ?? settings.randomStart;
			const songs = tracks.map((track) => createSongState(track, ladder, randomStart));
			setSession({ source, ladder, songs, index: 0, finished: false, quizId });
			setQuizResult(null);
			setShareFeedback(null);
			setError(null);
			setScreen("play");
			window.scrollTo({ top: 0, behavior: "smooth" });
		},
		[settings],
	);

	const startCategory = async (category: UnlimitedCategory | "mix") => {
		const id = category === "mix" ? MIX_CATEGORY_ID : category.id;
		const source: SessionSource =
			category === "mix"
				? { kind: "mix", id, title: "Mix it up", emoji: "🎲", subtitle: "Five categories, one song each" }
				: { kind: "category", id, title: category.title, emoji: category.emoji, subtitle: category.blurb };
		await loadRound(source);
	};

	const startArtist = async (artist: ArtistResult) => {
		await loadRound({ kind: "artist", id: `artist:${artist.id}`, title: artist.name, emoji: "🎤", subtitle: "Artist deep dive" });
	};

	const loadRound = async (source: SessionSource) => {
		setBusy(true);
		setError(null);
		try {
			const tracks = await fetchRound(source.id, ROUND_SIZE, settings.excludedArtists, loadSeen(source.id));
			if (tracks.length === 0) throw new Error("No songs came back for that pick. Try another.");
			markSeen(
				source.id,
				tracks.map((track) => track.id),
			);
			beginSession(source, tracks);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Couldn't start a round");
			setScreen("lobby");
		} finally {
			setBusy(false);
		}
	};

	const startPlaylist = async (playlist: SavedPlaylist) => {
		setBusy(true);
		setError(null);
		try {
			const excluded = new Set(settings.excludedArtists.map((name) => name.toLowerCase()));
			const seen = new Set(loadSeen(playlist.key));
			const tracks = playlist.tracks.map((track, index) => ({ track, index }));
			const eligible = tracks.filter(
				({ track }) => track.resolved !== null && !excluded.has(track.artists.toLowerCase().split(",")[0].trim()),
			);
			if (eligible.length === 0) throw new Error("None of that playlist's songs have a playable preview.");
			const fresh = eligible.filter(({ index }) => !seen.has(String(index)));
			const order = shuffle(fresh.length >= ROUND_SIZE ? fresh : eligible);

			const chosen: { track: TrackResult; index: number }[] = [];
			const updatedTracks = [...playlist.tracks];
			let cursor = 0;
			while (chosen.length < ROUND_SIZE && cursor < order.length) {
				const batch = order.slice(cursor, cursor + ROUND_SIZE - chosen.length + 2);
				cursor += batch.length;
				const needResolve = batch.filter(({ track }) => track.resolved === undefined);
				if (needResolve.length > 0) {
					const resolved = await resolveTracks(needResolve.map(({ track }) => ({ name: track.name, artists: track.artists })));
					needResolve.forEach(({ index }, position) => {
						const match = resolved[position] ?? null;
						const original = updatedTracks[index];
						// Fall back to the source service's own preview when Deezer has no match.
						updatedTracks[index] = {
							...original,
							resolved:
								match ??
								(original.previewUrl
									? {
											id: `${playlist.key}:${index}`,
											name: original.name,
											artists: original.artists,
											album: original.album,
											artwork: original.artwork,
											previewUrl: original.previewUrl,
											duration: null,
											provider: playlist.provider,
											url: null,
										}
									: null),
						};
					});
				}
				for (const { index } of batch) {
					const resolved = updatedTracks[index].resolved;
					if (resolved && chosen.length < ROUND_SIZE && !chosen.some((entry) => entry.index === index)) {
						chosen.push({ track: resolved, index });
					}
				}
			}
			updatePlaylistTracks(playlist.key, updatedTracks);
			if (chosen.length === 0) throw new Error("Couldn't find previews for those songs. Try another playlist.");
			markSeen(
				playlist.key,
				chosen.map(({ index }) => String(index)),
			);
			beginSession(
				{ kind: "playlist", id: playlist.key, title: playlist.name, emoji: "🎶", subtitle: `${providerLabel(playlist.provider)} playlist` },
				chosen.map(({ track }) => track),
			);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Couldn't start that playlist");
			setScreen("lobby");
		} finally {
			setBusy(false);
		}
	};

	const startQuiz = (state: QuizState) => {
		const { quiz } = state;
		beginSession(
			{
				kind: "quiz",
				id: `quiz:${quiz.id}`,
				title: quiz.title,
				emoji: "✉️",
				subtitle: quiz.from ? `From ${quiz.from}` : "A quiz from a friend",
			},
			quiz.tracks,
			quiz.ladder,
			quiz.randomStart,
			state.preview ? undefined : quiz.id,
		);
	};

	const previewQuiz = (tracks: TrackResult[], title: string, ladder: number[], randomStart: boolean) => {
		const state: QuizState = {
			quiz: { id: "preview", title, from: "", ladder, randomStart, tracks },
			stats: { count: 0, average: null },
			preview: true,
		};
		setQuizState(state);
		startQuiz(state);
	};

	const updateSong = (index: number, updater: (song: SongState) => SongState) => {
		setSession((current) => {
			if (!current) return current;
			const songs = current.songs.map((song, position) => (position === index ? updater(song) : song));
			const song = songs[index];
			if (song.status !== "playing") {
				const key = `${current.source.id}:${song.track.id}:${index}`;
				if (!recordedRef.current.has(key)) {
					recordedRef.current.add(key);
					const solved = song.status === "solved";
					const solvedSeconds = solved ? current.ladder[song.solvedStep ?? 0] : null;
					setStats(recordSong(solved, solved ? scoreForStep(song.solvedStep) : 0, solvedSeconds));
				}
			}
			return { ...current, songs };
		});
	};

	const advance = () => {
		player.stop();
		setSession((current) => {
			if (!current) return current;
			if (current.index < current.songs.length - 1) {
				return { ...current, index: current.index + 1 };
			}
			return { ...current, finished: true };
		});
	};

	// Move to the summary once the session is finished; report quiz scores once.
	useEffect(() => {
		if (!session?.finished || screen !== "play") return;
		setScreen("summary");
		window.scrollTo({ top: 0, behavior: "smooth" });
		if (session.quizId) {
			void submitQuizResult(session.quizId, sessionScore(session))
				.then((result) => setQuizResult(result))
				.catch(() => undefined);
		}
	}, [session, screen]);

	const backToLobby = () => {
		player.stop();
		setSession(null);
		setScreen("lobby");
		if (window.location.search.includes("quiz=")) {
			window.history.replaceState(null, "", window.location.pathname);
		}
	};

	const playAgain = () => {
		if (!session) return;
		player.stop();
		if (session.source.kind === "quiz" && quizState) {
			startQuiz({ ...quizState, preview: quizState.preview });
			return;
		}
		if (session.source.kind === "playlist") {
			const playlist = loadPlaylistByKey(session.source.id);
			if (playlist) void startPlaylist(playlist);
			else backToLobby();
			return;
		}
		void loadRound(session.source);
	};

	const shareSummary = async () => {
		if (!session) return;
		const grid = session.songs.map((song) => scoreEmoji(song.solvedStep, song.status === "solved")).join("");
		const heading =
			session.source.kind === "quiz"
				? `I scored ${sessionScore(session)}% on "${session.source.title}" 🎧`
				: `songgame unlimited · ${session.source.title} · ${sessionScore(session)}%`;
		const url =
			session.source.kind === "quiz" && session.quizId
				? `${window.location.origin}/songgame/unlimited?quiz=${session.quizId}`
				: `${window.location.origin}/songgame/unlimited`;
		const text = `${heading}\n${grid}\n${url}`;
		try {
			if (navigator.share) {
				await navigator.share({ text });
				setShareFeedback("Shared!");
			} else {
				await navigator.clipboard.writeText(text);
				setShareFeedback("Copied to clipboard");
			}
		} catch (err) {
			if (err instanceof Error && err.name === "AbortError") return;
			setShareFeedback("Couldn't share right now");
		}
		window.setTimeout(() => setShareFeedback(null), 3000);
	};

	const headerExtra = (
		<label className="ul-volume" aria-label="Volume">
			<span aria-hidden="true">{settings.volume === 0 ? "🔇" : settings.volume < 0.5 ? "🔉" : "🔊"}</span>
			<input
				type="range"
				min="0"
				max="1"
				step="0.01"
				value={settings.volume}
				onChange={(event) => setSettings((current) => ({ ...current, volume: Number(event.target.value) }))}
				onInput={(event) => setSettings((current) => ({ ...current, volume: Number(event.currentTarget.value) }))}
			/>
		</label>
	);

	return (
		<PageShell page="songgame · unlimited" mainClassName="ul-doc" headerExtra={headerExtra}>
			{screen === "lobby" ? (
				<Lobby
					settings={settings}
					stats={stats}
					busy={busy}
					error={error}
					onSettingsChange={setSettings}
					onPlayCategory={(category) => void startCategory(category)}
					onPlayArtist={(artist) => void startArtist(artist)}
					onPlayPlaylist={(playlist) => void startPlaylist(playlist)}
					onOpenBuilder={() => setScreen("builder")}
				/>
			) : null}

			{screen === "builder" ? (
				<QuizBuilder settings={settings} onBack={() => setScreen("lobby")} onPreview={previewQuiz} />
			) : null}

			{screen === "quiz-intro" && quizState ? (
				<section className="doc-card ul-intro">
					<p className="eyebrow">Someone sent you a quiz</p>
					<h1>{quizState.quiz.title}</h1>
					<p className="ul-hero-sub">
						{quizState.quiz.from ? `${quizState.quiz.from} picked ` : "A friend picked "}
						{quizState.quiz.tracks.length} song{quizState.quiz.tracks.length === 1 ? "" : "s"}. Snippets run{" "}
						{(quizState.quiz.ladder ?? ladderForSettings(settings)).map(formatSeconds).join(" → ")}s.
						{quizState.quiz.randomStart ? " Snippets start mid-song." : ""}
					</p>
					{quizState.stats.count > 0 && quizState.stats.average !== null ? (
						<p className="ul-hint">
							{quizState.stats.count} {quizState.stats.count === 1 ? "person has" : "people have"} played · average{" "}
							{Math.round(quizState.stats.average)}%
						</p>
					) : null}
					<div className="ul-intro-actions">
						<button type="button" className="primary-btn" onClick={() => { playClick(); startQuiz(quizState); }}>
							Start quiz
						</button>
						<button type="button" className="ghost-btn" onClick={() => { playClick(); backToLobby(); }}>
							Not now
						</button>
					</div>
				</section>
			) : null}

			{screen === "play" && session ? (
				<Player
					session={session}
					settings={settings}
					player={player}
					onUpdateSong={updateSong}
					onAdvance={advance}
					onQuit={backToLobby}
				/>
			) : null}

			{screen === "summary" && session ? (
				<section className="doc-card ul-summary">
					<div className="ul-summary-head">
						<div>
							<p className="eyebrow">
								{session.source.emoji} {session.source.title}
							</p>
							<h1>
								{sessionScore(session)}
								<span className="ul-summary-pct">%</span>
							</h1>
							<p className="ul-hero-sub">{summaryLine(session)}</p>
							{quizResult && quizResult.count > 1 && quizResult.average !== null ? (
								<p className="ul-hint">
									Everyone who played this quiz averages {Math.round(quizResult.average)}% across {quizResult.count} plays.
								</p>
							) : null}
						</div>
						<div className="ul-summary-grid" aria-hidden="true">
							{session.songs.map((song, index) => (
								<span key={index}>{scoreEmoji(song.solvedStep, song.status === "solved")}</span>
							))}
						</div>
					</div>
					<ol className="ul-summary-list">
						{session.songs.map((song, index) => (
							<li key={`${song.track.id}-${index}`} className={song.status}>
								{song.track.artwork ? <img src={song.track.artwork} alt="" /> : null}
								<span className="ul-result-text">
									<strong>{song.track.name}</strong>
									<small>{song.track.artists}</small>
								</span>
								<span className="ul-summary-score">
									{song.status === "solved" ? (
										<>
											<strong>+{scoreForStep(song.solvedStep)}</strong>
											<small>{formatSeconds(session.ladder[song.solvedStep ?? 0])}s</small>
										</>
									) : (
										<>
											<strong>0</strong>
											<small>missed</small>
										</>
									)}
								</span>
							</li>
						))}
					</ol>
					<div className="ul-summary-actions">
						<button type="button" className="primary-btn" onClick={() => { playClick(); playAgain(); }} disabled={busy}>
							{session.source.kind === "quiz" ? "Play it again" : `5 more · ${session.source.title}`}
						</button>
						<button type="button" className="ghost-btn" onClick={() => { playClick(); void shareSummary(); }}>
							{shareFeedback ?? "Share result"}
						</button>
						{session.source.kind === "quiz" ? (
							<button type="button" className="ghost-btn" onClick={() => { playClick(); player.stop(); setSession(null); setScreen("builder"); }}>
								Make your own quiz
							</button>
						) : null}
						<button type="button" className="ghost-btn" onClick={() => { playClick(); backToLobby(); }}>
							Change category
						</button>
					</div>
				</section>
			) : null}
		</PageShell>
	);
}

function summaryLine(session: Session) {
	const solved = session.songs.filter((song) => song.status === "solved").length;
	const total = session.songs.length;
	if (solved === total) return "Clean sweep. Every song named.";
	if (solved === 0) return "Rough one. The next five will be kinder.";
	if (solved >= total - 1) return `${solved} of ${total}. So close to a sweep.`;
	return `${solved} of ${total} named.`;
}

function providerLabel(provider: SavedPlaylist["provider"]) {
	return provider === "spotify" ? "Spotify" : provider === "apple" ? "Apple Music" : "Deezer";
}

function loadPlaylistByKey(key: string) {
	try {
		const raw = window.localStorage.getItem("unlimited-playlists");
		const list = raw ? (JSON.parse(raw) as SavedPlaylist[]) : [];
		return list.find((entry) => entry.key === key) ?? null;
	} catch {
		return null;
	}
}
