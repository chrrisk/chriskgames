import { useState } from "react";
import {
	DEFAULT_CUSTOM_LADDER,
	LADDER_PRESETS,
	formatSeconds,
	isValidLadder,
	type LadderPresetId,
	type Settings,
} from "./helpers";

type SettingsPanelProps = {
	settings: Settings;
	onChange: (next: Settings) => void;
};

const PRESET_ORDER: LadderPresetId[] = ["easy", "classic", "audiophile", "custom"];

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
	const [artistDraft, setArtistDraft] = useState("");
	const [customDraft, setCustomDraft] = useState(() => settings.customLadder.map(formatSeconds).join(", "));
	const customValid = isValidLadder(parseLadder(customDraft));

	const update = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

	const addExcludedArtist = () => {
		const name = artistDraft.trim();
		if (!name) return;
		if (settings.excludedArtists.some((entry) => entry.toLowerCase() === name.toLowerCase())) {
			setArtistDraft("");
			return;
		}
		update({ excludedArtists: [...settings.excludedArtists, name].slice(0, 30) });
		setArtistDraft("");
	};

	return (
		<div className="ul-settings">
			<section className="ul-setting-group">
				<div className="ul-setting-head">
					<h4>Snippet ladder</h4>
					<p>How much you hear at each step. Every wrong guess or skip unlocks the next.</p>
				</div>
				<div className="ul-preset-row" role="radiogroup" aria-label="Snippet ladder">
					{PRESET_ORDER.map((preset) => {
						const active = settings.ladderPreset === preset;
						const info = preset === "custom" ? { label: "Custom", hint: "Your own steps" } : LADDER_PRESETS[preset];
						return (
							<button
								key={preset}
								type="button"
								role="radio"
								aria-checked={active}
								className={`ul-preset${active ? " active" : ""}`}
								onClick={() => update({ ladderPreset: preset })}
							>
								<span className="ul-preset-label">{info.label}</span>
								<span className="ul-preset-hint">{info.hint}</span>
							</button>
						);
					})}
				</div>
				{settings.ladderPreset === "custom" ? (
					<div className="ul-custom-ladder">
						<label htmlFor="ul-custom-ladder">Steps in seconds, ascending, max 30</label>
						<div className="ul-inline-form">
							<input
								id="ul-custom-ladder"
								type="text"
								inputMode="decimal"
								value={customDraft}
								placeholder={DEFAULT_CUSTOM_LADDER.join(", ")}
								onChange={(event) => setCustomDraft(event.target.value)}
								onBlur={() => {
									const parsed = parseLadder(customDraft);
									if (isValidLadder(parsed)) update({ customLadder: parsed });
								}}
								aria-invalid={!customValid}
							/>
							<button
								type="button"
								className="ghost-btn"
								disabled={!customValid}
								onClick={() => update({ customLadder: parseLadder(customDraft) })}
							>
								Apply
							</button>
						</div>
						{!customValid ? <p className="ul-error">Use 2 to 8 increasing numbers, like 0.25, 0.5, 1, 2, 4, 8.</p> : null}
					</div>
				) : null}
			</section>

			<section className="ul-setting-group">
				<div className="ul-setting-head">
					<h4>Playback</h4>
				</div>
				<label className="ul-switch">
					<input
						type="checkbox"
						checked={settings.randomStart}
						onChange={(event) => update({ randomStart: event.target.checked })}
					/>
					<span className="ul-switch-track" aria-hidden="true" />
					<span className="ul-switch-text">
						<strong>Random start point</strong>
						<small>Snippets begin somewhere inside the preview instead of always at the top.</small>
					</span>
				</label>
				<label className="ul-switch">
					<input
						type="checkbox"
						checked={!settings.compress}
						onChange={(event) => update({ compress: !event.target.checked })}
					/>
					<span className="ul-switch-track" aria-hidden="true" />
					<span className="ul-switch-text">
						<strong>Raw dynamics</strong>
						<small>Bypass the loudness leveler. Quieter masters stay quiet, hot ones stay hot.</small>
					</span>
				</label>
				<label className="ul-switch">
					<input
						type="checkbox"
						checked={settings.artHint}
						onChange={(event) => update({ artHint: event.target.checked })}
					/>
					<span className="ul-switch-track" aria-hidden="true" />
					<span className="ul-switch-text">
						<strong>Album art hint</strong>
						<small>Show the cover blurred, sharpening a little with every step.</small>
					</span>
				</label>
			</section>

			<section className="ul-setting-group">
				<div className="ul-setting-head">
					<h4>Guessing</h4>
				</div>
				<label className="ul-switch">
					<input
						type="checkbox"
						checked={settings.poolSearch}
						onChange={(event) => update({ poolSearch: event.target.checked })}
					/>
					<span className="ul-switch-track" aria-hidden="true" />
					<span className="ul-switch-text">
						<strong>Focused search</strong>
						<small>
							Guesses only list songs this round could have picked, and the answer is always among them. Off searches all of
							Deezer. Quizzes always use full search.
						</small>
					</span>
				</label>
			</section>

			<section className="ul-setting-group">
				<div className="ul-setting-head">
					<h4>Skip artists</h4>
					<p>Never hear these artists in any category.</p>
				</div>
				<div className="ul-inline-form">
					<input
						type="text"
						value={artistDraft}
						placeholder="Artist name"
						aria-label="Artist to skip"
						onChange={(event) => setArtistDraft(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								addExcludedArtist();
							}
						}}
					/>
					<button type="button" className="ghost-btn" onClick={addExcludedArtist} disabled={!artistDraft.trim()}>
						Add
					</button>
				</div>
				{settings.excludedArtists.length > 0 ? (
					<div className="ul-chip-row">
						{settings.excludedArtists.map((artist) => (
							<button
								key={artist}
								type="button"
								className="ul-chip"
								onClick={() => update({ excludedArtists: settings.excludedArtists.filter((entry) => entry !== artist) })}
								aria-label={`Stop skipping ${artist}`}
							>
								{artist} <span aria-hidden="true">×</span>
							</button>
						))}
					</div>
				) : null}
			</section>
		</div>
	);
}

function parseLadder(raw: string) {
	return raw
		.split(/[,\s]+/)
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => Number(entry));
}
