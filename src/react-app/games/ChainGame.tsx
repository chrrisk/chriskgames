import { useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "../components/PageShell";
import { useClickSound } from "../lib/sound";
import {
	formatCountdownLabel,
	getEasternDateKey,
	getMillisecondsUntilNextEasternReset,
} from "../lib/time";
import { getPuzzleForDate } from "./chaingame-puzzles";
import "../styles/chaingame.css";

type StoredState = {
	dateKey?: string;
	hints?: number[];
	solvedCount?: number;
};

const STORAGE_KEY = "chaingame-daily-state";

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

export function ChainGame() {
	const playClick = useClickSound();
	const [dateKey, setDateKey] = useState(() => getEasternDateKey());
	const chain = useMemo(() => getPuzzleForDate(dateKey), [dateKey]);
	const [{ hints, solvedCount }, setProgress] = useState(() =>
		loadStoredState(getEasternDateKey(), getPuzzleForDate(getEasternDateKey()).length),
	);
	const [typed, setTyped] = useState("");
	const [message, setMessage] = useState<string | null>(null);
	const [shareFeedback, setShareFeedback] = useState<string | null>(null);
	const [resetCountdown, setResetCountdown] = useState(() =>
		formatCountdownLabel(getMillisecondsUntilNextEasternReset()),
	);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const shareFeedbackTimeoutRef = useRef<number | null>(null);

	const isComplete = solvedCount >= chain.length;
	const currentWord = isComplete ? null : chain[solvedCount];
	const revealedCount = currentWord ? 1 + hints[solvedCount] : 0;
	const remainingSlots = currentWord ? currentWord.length - revealedCount : 0;

	const focusTyping = () => inputRef.current?.focus();

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
				setTyped("");
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
		setTyped("");
		setMessage(givenAway ? `It was "${currentWord}".` : missMessage);
	};

	const revealLetter = () => {
		playClick();
		applyReveal(null);
		focusTyping();
	};

	const handleTypedChange = (value: string) => {
		const letters = value.toLowerCase().replace(/[^a-z]/g, "").slice(0, remainingSlots);
		setTyped(letters);
		if (message) setMessage(null);
	};

	const handleSubmit = () => {
		if (!currentWord || typed.length < remainingSlots) return;
		playClick();
		const fullGuess = currentWord.slice(0, revealedCount).toLowerCase() + normalizeGuess(typed);
		if (fullGuess === currentWord.toLowerCase()) {
			setProgress((prev) => ({ ...prev, solvedCount: prev.solvedCount + 1 }));
			setTyped("");
			setMessage(null);
		} else {
			applyReveal("Not it. Another letter revealed.");
		}
		focusTyping();
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
		const text = `🔗 chaingame ${dateKey}\n${lines} ${finalScore}%\nPlay it yourself: https://play.chriskstudios.com/chaingame`;
		let feedback = "Copied! 📋";
		try {
			if (typeof navigator !== "undefined" && navigator.share) {
				await navigator.share({ title: "My chaingame results", text });
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
		const shownCount = index === 0 ? word.length : isSolved ? word.length : 1 + hints[index];
		return (
			<div
				className={`chain-row${isCurrent ? " current" : ""}${isSolved && index > 0 ? " solved" : ""}`}
				key={`${word}-${index}`}
				onClick={isCurrent ? focusTyping : undefined}
			>
				{word.split("").map((letter, letterIndex) => {
					const revealed = letterIndex < shownCount;
					const typedLetter = isCurrent && !revealed ? typed[letterIndex - shownCount] : undefined;
					const isCaret = isCurrent && letterIndex === shownCount + typed.length;
					const classes = ["chain-tile"];
					if (revealed) classes.push("revealed");
					if (typedLetter) classes.push("typed");
					if (isCaret) classes.push("caret");
					return (
						<span className={classes.join(" ")} key={letterIndex}>
							{revealed ? letter : typedLetter ?? ""}
						</span>
					);
				})}
				{index > 0 && isSolved ? (
					<span className={`chain-word-score ${scoreTone(wordScore(word, hints[index]))}`}>
						{wordScore(word, hints[index])}%
					</span>
				) : null}
			</div>
		);
	};

	return (
		<PageShell
			page="chaingame"
			mainClassName="lab-doc"
			headerExtra={
				<div className="reset-countdown">
					<span>Next chain in</span>
					<strong>{resetCountdown}</strong>
				</div>
			}
		>
			<section className="doc-card chain-card">
				<p className="eyebrow">Word chain</p>
				<h2 className="chain-title">One word leads to the next</h2>
				<p className="lab-hint">
					Each word pairs with the one above it. Wrong guesses reveal another letter; a fully
					revealed word scores zero.
				</p>
				<div className="chain-chain">{chain.map(renderWordRow)}</div>
				{isComplete ? (
					<div className="chain-complete">
						<h3 className="chain-final-heading">
							Chain complete: <span className={scoreTone(finalScore)}>{finalScore}%</span>
						</h3>
						<p className="lab-hint next-reset-hint">Next chain in {resetCountdown}</p>
						<div className="lab-controls">
							<button className="primary-btn" type="button" onClick={() => void handleShare()}>
								Share results 🔗
							</button>
							<a
								className="ghost-btn chain-home-link"
								href="/"
								onClick={playClick}
							>
								Back to games
							</a>
						</div>
						{shareFeedback ? <p className="share-feedback">{shareFeedback}</p> : null}
					</div>
				) : (
					<div className="chain-controls">
						<input
							ref={inputRef}
							className="chain-hidden-input"
							type="text"
							value={typed}
							autoFocus
							autoCapitalize="off"
							autoComplete="off"
							autoCorrect="off"
							spellCheck={false}
							aria-label="Type the missing letters of the next word"
							onChange={(event) => handleTypedChange(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									handleSubmit();
								}
							}}
						/>
						<p className="lab-hint chain-typing-hint">
							Type into the boxes, Enter to guess. Tap the row if the keyboard hides.
						</p>
						<div className="chain-input-row">
							<button
								className="primary-btn"
								type="button"
								onClick={handleSubmit}
								disabled={typed.length < remainingSlots}
							>
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
	if (score >= 90) return "chain-score-great";
	if (score >= 50) return "chain-score-ok";
	return "chain-score-poor";
}
