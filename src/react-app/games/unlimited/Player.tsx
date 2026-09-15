import { useEffect, useRef, useState } from "react";
import { useClickSound } from "../../lib/sound";
import { searchTracks } from "./api";
import {
	FULL_REVEAL_SECONDS,
	artistsOverlap,
	formatSeconds,
	isCorrectGuess,
	scoreForStep,
	type Guess,
	type Session,
	type Settings,
	type SongState,
	type TrackResult,
} from "./helpers";
import type { useSnippetPlayer } from "./useSnippetPlayer";

type PlayerProps = {
	session: Session;
	settings: Settings;
	player: ReturnType<typeof useSnippetPlayer>;
	onUpdateSong: (index: number, updater: (song: SongState) => SongState) => void;
	onAdvance: () => void;
	onQuit: () => void;
};

export function Player({ session, settings, player, onUpdateSong, onAdvance, onQuit }: PlayerProps) {
	const playClick = useClickSound();
	const song = session.songs[session.index];
	const ladder = session.ladder;
	const maxStep = ladder.length - 1;
	const step = Math.min(song.step, maxStep);
	const currentLength = ladder[step];
	const totalLength = ladder[maxStep];
	const isDone = song.status !== "playing";
	const isLast = session.index === session.songs.length - 1;

	const [query, setQuery] = useState("");
	const [results, setResults] = useState<TrackResult[]>([]);
	const [searching, setSearching] = useState(false);
	const [searchError, setSearchError] = useState<string | null>(null);
	const [resultsOpen, setResultsOpen] = useState(false);
	const searchRef = useRef<HTMLInputElement | null>(null);
	const nextRef = useRef<HTMLButtonElement | null>(null);

	const { play, stop, preload, isPlaying, progress } = player;

	// New song: reset search, stop audio, warm up the preview.
	useEffect(() => {
		setQuery("");
		setResults([]);
		setSearchError(null);
		stop();
		preload(song.track.previewUrl ?? null);
		if (song.status === "playing") {
			searchRef.current?.focus({ preventScroll: true });
		}
		// Only when the song changes.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [session.index, song.track.id]);

	useEffect(() => {
		if (isDone) nextRef.current?.focus({ preventScroll: true });
	}, [isDone]);

	// Debounced guess search.
	useEffect(() => {
		const trimmed = query.trim();
		if (!trimmed) {
			setResults([]);
			setSearching(false);
			setSearchError(null);
			return;
		}
		const controller = new AbortController();
		const timeout = window.setTimeout(async () => {
			setSearching(true);
			setSearchError(null);
			try {
				setResults(await searchTracks(trimmed, controller.signal));
			} catch (err) {
				if (controller.signal.aborted) return;
				setSearchError(err instanceof Error ? err.message : "Search failed");
				setResults([]);
			} finally {
				if (!controller.signal.aborted) setSearching(false);
			}
		}, 300);
		return () => {
			controller.abort();
			window.clearTimeout(timeout);
		};
	}, [query]);

	// Keyboard: space toggles playback when not typing, enter advances after a reveal.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
			if (event.code === "Space" && !typing) {
				event.preventDefault();
				togglePlay();
			}
			if (event.key === "Enter" && isDone && !typing) {
				event.preventDefault();
				onAdvance();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	const togglePlay = () => {
		if (!song.track.previewUrl) return;
		if (isPlaying) {
			stop();
			return;
		}
		if (isDone) {
			play(song.track.previewUrl, 0, FULL_REVEAL_SECONDS);
		} else {
			play(song.track.previewUrl, song.offset, currentLength);
		}
	};

	const playFullReveal = () => {
		if (song.track.previewUrl) play(song.track.previewUrl, 0, FULL_REVEAL_SECONDS);
	};

	const commitGuess = (guess: Guess) => {
		onUpdateSong(session.index, (current) => {
			const currentStep = Math.min(current.step, maxStep);
			const guesses = [...current.guesses, guess];
			if (guess.correct) {
				return { ...current, guesses, status: "solved", solvedStep: currentStep, step: maxStep };
			}
			if (currentStep >= maxStep) {
				return { ...current, guesses, status: "failed", step: maxStep };
			}
			return { ...current, guesses, step: currentStep + 1 };
		});
		setQuery("");
		setResults([]);
		setResultsOpen(false);
		if (guess.correct || step >= maxStep) {
			playFullReveal();
		} else {
			stop();
			searchRef.current?.focus({ preventScroll: true });
		}
	};

	const handleGuess = (track: TrackResult) => {
		if (isDone) return;
		const correct = isCorrectGuess(track, song.track);
		commitGuess({
			track,
			correct,
			artistMatch: !correct && artistsOverlap(track.artists, song.track.artists),
			skipped: false,
		});
	};

	const handleSkip = () => {
		if (isDone) return;
		commitGuess({ track: null, correct: false, artistMatch: false, skipped: true });
	};

	const alreadyGuessed = (track: TrackResult) =>
		song.guesses.some((guess) => guess.track && isCorrectGuess(guess.track, track));

	const showResults = query.trim().length > 0 && resultsOpen;
	const segments = ladder.map((length, index) => ({
		index,
		length: index === 0 ? length : length - ladder[index - 1],
		unlocked: index <= step,
		current: index === step,
	}));
	const playheadWidth = isDone ? 0 : (progress * currentLength) / totalLength;
	const nextStepGain = step < maxStep ? ladder[step + 1] - currentLength : 0;
	const hintBlur = settings.artHint && !isDone ? Math.max(0, (maxStep - step) * 5 + 2) : 0;
	const solvedScore = song.status === "solved" ? scoreForStep(song.solvedStep) : 0;

	return (
		<div className="ul-player">
			<div className="ul-player-top">
				<button type="button" className="ul-back" onClick={() => { playClick(); onQuit(); }}>
					← {session.source.kind === "quiz" ? "Leave quiz" : "Lobby"}
				</button>
				<div className="ul-source-label">
					<span className="ul-source-emoji" aria-hidden="true">{session.source.emoji}</span>
					<div>
						<strong>{session.source.title}</strong>
						{session.source.subtitle ? <small>{session.source.subtitle}</small> : null}
					</div>
				</div>
				<ol className="ul-round-dots" aria-label={`Song ${session.index + 1} of ${session.songs.length}`}>
					{session.songs.map((entry, index) => {
						const classes = ["ul-dot"];
						if (index === session.index) classes.push("current");
						if (entry.status === "solved") classes.push("solved");
						if (entry.status === "failed") classes.push("failed");
						return <li key={index} className={classes.join(" ")} aria-current={index === session.index ? "step" : undefined} />;
					})}
				</ol>
			</div>

			<div className={`ul-stage${isDone ? " revealed" : ""}`}>
				<div className="ul-art-slot">
					{song.track.artwork && (isDone || settings.artHint) ? (
						<img
							src={song.track.artwork}
							alt={isDone ? `${song.track.album} cover` : ""}
							className="ul-art"
							style={{ filter: hintBlur ? `blur(${hintBlur}px) saturate(0.7)` : undefined }}
							draggable={false}
						/>
					) : (
						<div className="ul-art ul-art-placeholder" aria-hidden="true">
							<span>{isDone ? "🎵" : "?"}</span>
						</div>
					)}
				</div>

				<div className="ul-stage-main">
					{isDone ? (
						<div className="ul-reveal">
							<p className={`ul-reveal-verdict ${song.status}`}>
								{song.status === "solved"
									? `Got it in ${formatSeconds(ladder[song.solvedStep ?? 0])}s · +${solvedScore}`
									: "Out of steps"}
							</p>
							<h2 className="ul-reveal-title">{song.track.name}</h2>
							<p className="ul-reveal-artist">{song.track.artists}</p>
							{song.track.album ? <p className="ul-reveal-album">{song.track.album}</p> : null}
							<div className="ul-reveal-actions">
								<button ref={nextRef} type="button" className="primary-btn" onClick={() => { playClick(); onAdvance(); }}>
									{isLast ? "See results" : "Next song →"}
								</button>
								<button type="button" className="ghost-btn" onClick={togglePlay} disabled={!song.track.previewUrl}>
									{isPlaying ? "Stop" : "Replay clip"}
								</button>
								{song.track.url ? (
									<a className="ul-link" href={song.track.url} target="_blank" rel="noreferrer">
										Open on Deezer ↗
									</a>
								) : null}
							</div>
						</div>
					) : (
						<div className="ul-listen">
							<div className="ul-snippet-bar" aria-hidden="true">
								{segments.map((segment) => (
									<span
										key={segment.index}
										className={`ul-segment${segment.unlocked ? " unlocked" : ""}${segment.current ? " current" : ""}`}
										style={{ flexGrow: segment.length, flexBasis: 0 }}
									/>
								))}
								<span className="ul-playhead" style={{ width: `${playheadWidth * 100}%` }} />
							</div>
							<div className="ul-snippet-meta">
								<span>
									<strong>{formatSeconds(currentLength)}s</strong> of {formatSeconds(totalLength)}s unlocked
								</span>
								{song.offset > 0 ? <span className="ul-hint">starts at {formatSeconds(song.offset)}s</span> : null}
							</div>
							<div className="ul-controls">
								<button
									type="button"
									className={`ul-play-btn${isPlaying ? " playing" : ""}`}
									onClick={togglePlay}
									disabled={!song.track.previewUrl}
									aria-label={isPlaying ? "Stop" : "Play snippet"}
								>
									{isPlaying ? "■" : "▶"}
								</button>
								<button type="button" className="ghost-btn ul-skip" onClick={() => { playClick(); handleSkip(); }}>
									{step >= maxStep ? "Give up" : `Skip · +${formatSeconds(nextStepGain)}s`}
								</button>
								<span className="ul-key-hint">space to play · enter to guess top result</span>
							</div>
						</div>
					)}
				</div>
			</div>

			{!isDone ? (
				<div className="ul-search-wrap">
					<div className="ul-search">
						<input
							ref={searchRef}
							type="text"
							value={query}
							placeholder="Type a song or artist…"
							aria-label="Guess the song"
							autoComplete="off"
							onChange={(event) => {
								setQuery(event.target.value);
								setResultsOpen(true);
							}}
							onFocus={() => setResultsOpen(true)}
							onBlur={(event) => {
								const next = event.relatedTarget as HTMLElement | null;
								if (!next || !next.closest(".ul-results")) setResultsOpen(false);
							}}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									const first = results.find((track) => !alreadyGuessed(track));
									if (first) {
										playClick();
										handleGuess(first);
									}
								}
								if (event.key === "Escape") {
									setQuery("");
									setResultsOpen(false);
								}
							}}
						/>
						{searching ? <span className="ul-hint ul-search-status">Searching…</span> : null}
					</div>
					{searchError ? <p className="ul-error">{searchError}</p> : null}
					<div className={`ul-results${showResults ? " open" : ""}`} onMouseDown={(event) => event.preventDefault()}>
						{results.length === 0 && !searching && query.trim() ? <p className="ul-hint">No matches yet. Try the artist name.</p> : null}
						{results.map((track) => {
							const used = alreadyGuessed(track);
							return (
								<button
									type="button"
									key={track.id}
									className={`ul-result${used ? " used" : ""}`}
									disabled={used}
									onClick={() => {
										playClick();
										handleGuess(track);
									}}
								>
									{track.artwork ? <img src={track.artwork} alt="" /> : null}
									<span className="ul-result-text">
										<strong>{track.name}</strong>
										<small>
											{track.artists}
											{track.album ? ` · ${track.album}` : ""}
										</small>
									</span>
								</button>
							);
						})}
					</div>
				</div>
			) : null}

			<ol className="ul-guesses" aria-label="Guesses">
				{ladder.map((_, index) => {
					const guess = song.guesses[index];
					let state = "";
					let label = "";
					if (guess) {
						if (guess.correct) {
							state = "correct";
							label = guess.track?.name ?? "";
						} else if (guess.skipped) {
							state = "skip";
							label = "Skipped";
						} else {
							state = guess.artistMatch ? "artist" : "wrong";
							label = guess.track ? `${guess.track.name} · ${guess.track.artists}` : "";
						}
					} else if (index === song.guesses.length && !isDone) {
						state = "active";
					}
					return (
						<li key={index} className={`ul-guess ${state}`}>
							<span className="ul-guess-step">{formatSeconds(ladder[index])}s</span>
							<span className="ul-guess-label">
								{label || (state === "active" ? "Listening…" : "")}
								{state === "artist" ? <em> · right artist</em> : null}
							</span>
						</li>
					);
				})}
			</ol>

			<audio ref={player.audioRef} preload="auto" crossOrigin="anonymous" />
		</div>
	);
}
