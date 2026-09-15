import { useEffect, useState } from "react";
import { useClickSound } from "../../lib/sound";
import { createQuiz, searchTracks } from "./api";
import { LADDER_PRESETS, formatSeconds, ladderForSettings, type LadderPresetId, type Settings, type TrackResult } from "./helpers";

type QuizBuilderProps = {
	settings: Settings;
	onBack: () => void;
	onPreview: (tracks: TrackResult[], title: string, ladder: number[], randomStart: boolean) => void;
};

const MAX_TRACKS = 10;
const LADDER_CHOICES: Exclude<LadderPresetId, "custom">[] = ["easy", "classic", "audiophile"];

export function QuizBuilder({ settings, onBack, onPreview }: QuizBuilderProps) {
	const playClick = useClickSound();
	const [title, setTitle] = useState("");
	const [from, setFrom] = useState("");
	const [ladderChoice, setLadderChoice] = useState<LadderPresetId>(settings.ladderPreset);
	const [randomStart, setRandomStart] = useState(settings.randomStart);
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<TrackResult[]>([]);
	const [searching, setSearching] = useState(false);
	const [picked, setPicked] = useState<TrackResult[]>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [link, setLink] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		const trimmed = query.trim();
		if (!trimmed) {
			setResults([]);
			setSearching(false);
			return;
		}
		const controller = new AbortController();
		const timeout = window.setTimeout(async () => {
			setSearching(true);
			try {
				setResults((await searchTracks(trimmed, controller.signal)).filter((track) => track.previewUrl));
			} catch {
				if (!controller.signal.aborted) setResults([]);
			} finally {
				if (!controller.signal.aborted) setSearching(false);
			}
		}, 300);
		return () => {
			controller.abort();
			window.clearTimeout(timeout);
		};
	}, [query]);

	const ladder =
		ladderChoice === "custom" ? ladderForSettings({ ...settings, ladderPreset: "custom" }) : LADDER_PRESETS[ladderChoice].steps;

	const addTrack = (track: TrackResult) => {
		if (picked.length >= MAX_TRACKS || picked.some((entry) => entry.id === track.id)) return;
		setPicked([...picked, track]);
		setQuery("");
		setResults([]);
		setLink(null);
	};

	const removeTrack = (id: string) => {
		setPicked(picked.filter((entry) => entry.id !== id));
		setLink(null);
	};

	const move = (index: number, direction: -1 | 1) => {
		const target = index + direction;
		if (target < 0 || target >= picked.length) return;
		const next = [...picked];
		[next[index], next[target]] = [next[target], next[index]];
		setPicked(next);
		setLink(null);
	};

	const generate = async () => {
		if (picked.length === 0) return;
		setBusy(true);
		setError(null);
		try {
			const id = await createQuiz({
				title: title.trim() || "Song quiz",
				from: from.trim(),
				trackIds: picked.map((track) => track.id),
				ladder: ladderChoice === "classic" ? null : ladder,
				randomStart,
			});
			const url = `${window.location.origin}/songgame/unlimited?quiz=${id}`;
			setLink(url);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unable to create the quiz");
		} finally {
			setBusy(false);
		}
	};

	const copyLink = async () => {
		if (!link) return;
		try {
			await navigator.clipboard.writeText(link);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2500);
		} catch {
			setCopied(false);
		}
	};

	const shareLink = async () => {
		if (!link) return;
		const text = `${from.trim() ? `${from.trim()} made you a song quiz` : "I made you a song quiz"}: ${title.trim() || "Song quiz"} 🎧`;
		if (navigator.share) {
			try {
				await navigator.share({ title: title.trim() || "Song quiz", text, url: link });
				return;
			} catch {
				// fall through to copy
			}
		}
		await copyLink();
	};

	return (
		<div className="ul-builder">
			<div className="ul-player-top">
				<button type="button" className="ul-back" onClick={() => { playClick(); onBack(); }}>
					← Lobby
				</button>
				<div className="ul-source-label">
					<span className="ul-source-emoji" aria-hidden="true">✉️</span>
					<div>
						<strong>Make a quiz</strong>
						<small>Pick up to {MAX_TRACKS} songs, get a link, send it to a friend.</small>
					</div>
				</div>
			</div>

			<div className="ul-builder-grid">
				<section className="ul-panel">
					<div className="ul-panel-head">
						<h3>1 · Details</h3>
					</div>
					<label className="ul-field">
						<span>Quiz title</span>
						<input type="text" value={title} maxLength={60} placeholder="Songs from our road trip" onChange={(event) => { setTitle(event.target.value); setLink(null); }} />
					</label>
					<label className="ul-field">
						<span>Your name (shown to your friend)</span>
						<input type="text" value={from} maxLength={30} placeholder="Chris" onChange={(event) => { setFrom(event.target.value); setLink(null); }} />
					</label>
					<div className="ul-field">
						<span>Snippet ladder</span>
						<div className="ul-preset-row">
							{LADDER_CHOICES.map((choice) => (
								<button
									key={choice}
									type="button"
									className={`ul-preset${ladderChoice === choice ? " active" : ""}`}
									onClick={() => { setLadderChoice(choice); setLink(null); }}
								>
									<span className="ul-preset-label">{LADDER_PRESETS[choice].label}</span>
									<span className="ul-preset-hint">{LADDER_PRESETS[choice].hint}</span>
								</button>
							))}
							{settings.ladderPreset === "custom" ? (
								<button
									type="button"
									className={`ul-preset${ladderChoice === "custom" ? " active" : ""}`}
									onClick={() => { setLadderChoice("custom"); setLink(null); }}
								>
									<span className="ul-preset-label">Custom</span>
									<span className="ul-preset-hint">{settings.customLadder.map(formatSeconds).join(" · ")}s</span>
								</button>
							) : null}
						</div>
					</div>
					<label className="ul-switch">
						<input type="checkbox" checked={randomStart} onChange={(event) => { setRandomStart(event.target.checked); setLink(null); }} />
						<span className="ul-switch-track" aria-hidden="true" />
						<span className="ul-switch-text">
							<strong>Random start point</strong>
							<small>Harder: snippets start mid-preview.</small>
						</span>
					</label>
				</section>

				<section className="ul-panel">
					<div className="ul-panel-head">
						<h3>2 · Songs · {picked.length}/{MAX_TRACKS}</h3>
					</div>
					<input
						type="text"
						value={query}
						placeholder="Search a song to add"
						aria-label="Search songs to add"
						disabled={picked.length >= MAX_TRACKS}
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && results[0]) {
								event.preventDefault();
								playClick();
								addTrack(results[0]);
							}
						}}
					/>
					{searching ? <p className="ul-hint">Searching…</p> : null}
					{results.length > 0 ? (
						<div className="ul-results open ul-results-static">
							{results.slice(0, 8).map((track) => {
								const used = picked.some((entry) => entry.id === track.id);
								return (
									<button type="button" key={track.id} className={`ul-result${used ? " used" : ""}`} disabled={used} onClick={() => { playClick(); addTrack(track); }}>
										{track.artwork ? <img src={track.artwork} alt="" /> : null}
										<span className="ul-result-text">
											<strong>{track.name}</strong>
											<small>{track.artists}</small>
										</span>
										<span className="ul-result-add" aria-hidden="true">+</span>
									</button>
								);
							})}
						</div>
					) : null}
					{picked.length > 0 ? (
						<ol className="ul-picked">
							{picked.map((track, index) => (
								<li key={track.id}>
									<span className="ul-picked-index">{index + 1}</span>
									{track.artwork ? <img src={track.artwork} alt="" /> : null}
									<span className="ul-result-text">
										<strong>{track.name}</strong>
										<small>{track.artists}</small>
									</span>
									<span className="ul-picked-actions">
										<button type="button" className="ghost-btn" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
										<button type="button" className="ghost-btn" aria-label="Move down" disabled={index === picked.length - 1} onClick={() => move(index, 1)}>↓</button>
										<button type="button" className="ghost-btn" aria-label={`Remove ${track.name}`} onClick={() => removeTrack(track.id)}>×</button>
									</span>
								</li>
							))}
						</ol>
					) : (
						<p className="ul-hint">Nothing picked yet. Songs need a preview to be playable, so only those show up here.</p>
					)}
				</section>

				<section className="ul-panel ul-panel-span">
					<div className="ul-panel-head">
						<h3>3 · Share</h3>
					</div>
					<div className="ul-builder-actions">
						<button type="button" className="primary-btn" disabled={busy || picked.length === 0} onClick={() => { playClick(); void generate(); }}>
							{busy ? "Creating…" : link ? "Regenerate link" : "Generate link"}
						</button>
						<button
							type="button"
							className="ghost-btn"
							disabled={picked.length === 0}
							onClick={() => { playClick(); onPreview(picked, title.trim() || "Song quiz", ladder, randomStart); }}
						>
							Test it yourself
						</button>
					</div>
					{error ? <p className="ul-error">{error}</p> : null}
					{link ? (
						<div className="ul-share-box">
							<input type="text" readOnly value={link} aria-label="Quiz link" onFocus={(event) => event.target.select()} />
							<button type="button" className="primary-btn" onClick={() => void shareLink()}>
								{copied ? "Copied!" : navigatorCanShare() ? "Share" : "Copy"}
							</button>
							{!navigatorCanShare() ? null : (
								<button type="button" className="ghost-btn" onClick={() => void copyLink()}>
									{copied ? "Copied!" : "Copy"}
								</button>
							)}
						</div>
					) : null}
				</section>
			</div>
		</div>
	);
}

function navigatorCanShare() {
	return typeof navigator !== "undefined" && typeof navigator.share === "function";
}
