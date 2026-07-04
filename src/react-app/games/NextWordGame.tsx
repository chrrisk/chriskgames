import { useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "../components/PageShell";
import { useClickSound } from "../lib/sound";
import {
	formatCountdownLabel,
	getEasternDateKey,
	getMillisecondsUntilNextEasternReset,
} from "../lib/time";
import { getPuzzleForDate } from "./nextwordgame-puzzles";
import "../styles/nextwordgame.css";

type StoredState = {
	dateKey?: string;
	hints?: number[];
	solvedCount?: number;
};

const STORAGE_KEY = "nextwordgame-daily-state";

function loadStoredState(dateKey: string, chainLength: number): { hints: number[]; solvedCount: number } {
	const fresh = { hints: Array(chainLength).fill(0) as number[], solvedCount: 1 };
	if (typeof window === "undefined") return fresh;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return fresh;
		const data = JSON.parse(raw) as StoredState;
		if (data.dateKey !== dateKey || !Array.isArray(data.hints) || data.hints.length !== chainLength) {
			return fresh;
		}
		const solvedCount = typeof data.solvedCount === "number" ? data.solvedCount : 1;
		return {
			hints: data.hints.map((value) => (typeof value === "number" ? value : 0)),
			solvedCount: Math.min(Math.max(1, solvedCount), chainLength),
		};
	} catch {
		return fresh;
	}
}

function normalizeGuess(value: string) {
	return value.trim().toLowerCase();
}

/** Extra letters revealed beyond which the word counts as given away. */
function maxHintsFor(word: string) {
	return word.length - 1;
}

function wordScore(word: string, hintCount: number) {
	const maxHints = maxHintsFor(word);
	if (maxHints <= 0) return 100;
	return Math.round(100 * Math.max(0, 1 - hintCount / maxHints));
}

export function NextWordGame() {
	const playClick = useClickSound();
	const [dateKey, setDateKey] = useState(() => getEasternDateKey());
	const chain = useMemo(() => getPuzzleForDate(dateKey), [dateKey]);
	const [{ hints, solvedCount }, setProgress] = useState(() =>
		loadStoredState(getEasternDateKey(), getPuzzleForDate(getEasternDateKey()).length),
	);
	const [guess, setGuess] = useState("");
	const [message, setMessage] = useState<string | null>(null);
	const [shareFeedback, setShareFeedback] = useState<string | null>(null);
	const [resetCountdown, setResetCountdown] = useState(() =>
		formatCountdownLabel(getMillisecondsUntilNextEasternReset()),
	);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const shareFeedbackTimeoutRef = useRef<number | null>(null);

	const isComplete = solvedCount >= chain.length;
	const currentWord = isComplete ? null : chain[solvedCount];

	// Persist today's progress.
	useEffect(() => {
		if (typeof window === "undefined") return;
		const payload: StoredState = { dateKey, hints, solvedCount };
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
	}, [dateKey, hints, solvedCount]);

	// Roll over to the next day's chain at midnight Eastern.
	useEffect(() => {
		const intervalId = window.setInterval(() => {
			const newKey = getEasternDateKey();
			if (newKey !== dateKey) {
				const nextChain = getPuzzleForDate(newKey);
				setDateKey(newKey);
				setProgress({ hints: Array(nextChain.length).fill(0), solvedCount: 1 });
				setGuess("");
				setMessage(null);
				if (typeof window !== "undefined") {
					window.localStorage.removeItem(STORAGE_KEY);
				}
			}
		}, 60000);
		return () => window.clearInterval(intervalId);
	}, [dateKey]);

	useEffect(() => {
		const update = () => setResetCountdown(formatCountdownLabel(getMillisecondsUntilNextEasternReset()));
		update();
		const intervalId = window.setInterval(update, 1000);
		return () => window.clearInterval(intervalId);
	}, []);

	useEffect(() => {
		return () => {
			if (shareFeedbackTimeoutRef.current) {
				window.clearTimeout(shareFeedbackTimeoutRef.current);
			}
		};
	}, []);

	/** Reveals one more letter of the current word; advances if it's now fully shown. */
	const applyReveal = (missMessage: string | null) => {
		if (!currentWord) return;
		const nextHintCount = hints[solvedCount] + 1;
		const givenAway = nextHintCount >= maxHintsFor(currentWord);
		setProgress((prev) => {
			const nextHints = [...prev.hints];
			nextHints[prev.solvedCount] = nextHintCount;
			return {
				hints: nextHints,
				solvedCount: givenAway ? prev.solvedCount + 1 : prev.solvedCount,
			};
		});
		setGuess("");
		setMessage(givenAway ? `It was "${currentWord}".` : missMessage);
	};

	const revealLetter = () => {
		playClick();
		applyReveal(null);
	};

	const handleSubmit = () => {
		if (!currentWord) return;
		const normalized = normalizeGuess(guess);
		if (!normalized) return;
		playClick();
		if (normalized === currentWord.toLowerCase()) {
			setProgress((prev) => ({ ...prev, solvedCount: prev.solvedCount + 1 }));
			setGuess("");
			setMessage(null);
			return;
		}
		applyReveal("Not it. Another letter revealed.");
	};

	const scores = chain.map((word, index) => (index === 0 ? null : wordScore(word, hints[index])));
	const scoredWords = scores.filter((value): value is number => value !== null);
	const totalScore =
		solvedCount > 1 && scoredWords.length > 0
			? Math.round(
					scoredWords.slice(0, solvedCount - 1).reduce((a, b) => a + b, 0) /
						Math.max(1, solvedCount - 1),
				)
			: 0;
	const finalScore = isComplete
		? Math.round(scoredWords.reduce((a, b) => a + b, 0) / scoredWords.length)
		: totalScore;

	const handleShare = async () => {
		playClick();
		const lines = chain
			.slice(1)
			.map((word, index) => {
				const score = wordScore(word, hints[index + 1]);
				const emoji = score === 100 ? "🟩" : score >= 50 ? "🟨" : "🟥";
				return emoji;
			})
			.join("");
		const text = `🔗 nextwordgame ${dateKey}\n${lines} ${finalScore}%\nPlay it yourself: https://play.chriskstudios.com/nextwordgame`;
		let feedback = "Copied! 📋";
		try {
			if (typeof navigator !== "undefined" && navigator.share) {
				await navigator.share({ title: "My nextwordgame results", text });
				feedback = "Shared! 🎉";
			} else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(text);
			} else {
				feedback = "Sharing not supported here.";
			}
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") return;
			feedback = "Unable to share right now.";
		}
		setShareFeedback(feedback);
		if (shareFeedbackTimeoutRef.current) {
			window.clearTimeout(shareFeedbackTimeoutRef.current);
		}
		shareFeedbackTimeoutRef.current = window.setTimeout(() => setShareFeedback(null), 7000);
	};

	const renderWordRow = (word: string, index: number) => {
		const isSolved = index < solvedCount;
		const isCurrent = index === solvedCount;
		const revealedCount = index === 0 ? word.length : isSolved ? word.length : 1 + hints[index];
		return (
			<div className={`nw-row${isCurrent ? " current" : ""}${isSolved && index > 0 ? " solved" : ""}`} key={`${word}-${index}`}>
				{word.split("").map((letter, letterIndex) => {
					const revealed = letterIndex < revealedCount;
					return (
						<span className={`nw-tile${revealed ? " revealed" : ""}`} key={letterIndex}>
							{revealed ? letter : ""}
						</span>
					);
				})}
				{index > 0 && isSolved ? (
					<span className={`nw-word-score ${scoreTone(wordScore(word, hints[index]))}`}>
						{wordScore(word, hints[index])}%
					</span>
				) : null}
			</div>
		);
	};

	return (
		<PageShell
			page="nextwordgame"
			mainClassName="lab-doc"
			headerExtra={
				<div className="reset-countdown">
					<span>Next chain in</span>
					<strong>{resetCountdown}</strong>
				</div>
			}
		>
			<section className="doc-card nw-card">
				<p className="eyebrow">Word chain</p>
				<h2 className="nw-title">One word leads to the next</h2>
				<p className="lab-hint">
					Each word pairs with the one above it. Wrong guesses reveal another letter; a fully
					revealed word scores zero.
				</p>
				<div className="nw-chain">{chain.map(renderWordRow)}</div>
				{isComplete ? (
					<div className="nw-complete">
						<h3 className="nw-final-heading">
							Chain complete: <span className={scoreTone(finalScore)}>{finalScore}%</span>
						</h3>
						<p className="lab-hint next-reset-hint">Next chain in {resetCountdown}</p>
						<div className="lab-controls">
							<button className="primary-btn" type="button" onClick={() => void handleShare()}>
								Share results 🔗
							</button>
							<a
								className="ghost-btn nw-home-link"
								href="/"
								onClick={playClick}
							>
								Back to games
							</a>
						</div>
						{shareFeedback ? <p className="share-feedback">{shareFeedback}</p> : null}
					</div>
				) : (
					<div className="nw-controls">
						<div className="nw-input-row">
							<input
								ref={inputRef}
								type="text"
								value={guess}
								placeholder="Type the next word"
								autoCapitalize="off"
								autoComplete="off"
								autoCorrect="off"
								spellCheck={false}
								aria-label="Your guess for the next word"
								onChange={(event) => setGuess(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										handleSubmit();
									}
								}}
							/>
							<button className="primary-btn" type="button" onClick={handleSubmit} disabled={!guess.trim()}>
								Guess
							</button>
							<button className="ghost-btn" type="button" onClick={revealLetter}>
								Reveal a letter
							</button>
						</div>
						{message ? <p className="lab-message">{message}</p> : null}
					</div>
				)}
			</section>
		</PageShell>
	);
}

function scoreTone(score: number) {
	if (score >= 90) return "nw-score-great";
	if (score >= 50) return "nw-score-ok";
	return "nw-score-poor";
}
