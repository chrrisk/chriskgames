/**
 * Category catalogue for songgame unlimited. Shared by the worker (which
 * turns sources into track pools) and the client (which renders the lobby).
 *
 * Every source is a public Deezer endpoint that needs no API key:
 *  - playlist: editorial playlists, fetched and cached for a few hours
 *  - radio:    Deezer "radios" hand back a fresh random batch on every call
 *  - chart:    the global top 100 right now
 */

export type UnlimitedSource =
	| { kind: "playlist"; id: string }
	| { kind: "radio"; id: string }
	| { kind: "chart" };

export type CategoryGroup = "eras" | "genres" | "vibes";

export type UnlimitedCategory = {
	id: string;
	title: string;
	blurb: string;
	emoji: string;
	group: CategoryGroup;
	sources: UnlimitedSource[];
};

export const CATEGORY_GROUP_LABELS: Record<CategoryGroup, string> = {
	eras: "By era",
	genres: "By genre",
	vibes: "Vibes & themes",
};

const playlist = (id: string): UnlimitedSource => ({ kind: "playlist", id });
const radio = (id: string): UnlimitedSource => ({ kind: "radio", id });

export const UNLIMITED_CATEGORIES: UnlimitedCategory[] = [
	/* ─── Eras ─── */
	{
		id: "60s",
		title: "1960s",
		blurb: "Motown, the British invasion, surf and soul.",
		emoji: "🕶️",
		group: "eras",
		sources: [playlist("620264073"), playlist("1437011185"), playlist("9002635962"), playlist("11798814481")],
	},
	{
		id: "70s",
		title: "1970s",
		blurb: "Disco, arena rock, singer-songwriters.",
		emoji: "🪩",
		group: "eras",
		sources: [playlist("1470022445"), playlist("8877326262"), playlist("8403499142"), playlist("11798818261")],
	},
	{
		id: "80s",
		title: "1980s",
		blurb: "Synths, big hair, bigger choruses.",
		emoji: "📼",
		group: "eras",
		sources: [
			playlist("867825522"),
			playlist("1913763402"),
			playlist("8512471762"),
			playlist("8873745702"),
			radio("38305"),
		],
	},
	{
		id: "90s",
		title: "1990s",
		blurb: "Grunge, boy bands, R&B and Britpop.",
		emoji: "💿",
		group: "eras",
		sources: [
			playlist("878989033"),
			playlist("2322259622"),
			playlist("8873744282"),
			playlist("8311123682"),
			radio("38315"),
		],
	},
	{
		id: "2000s",
		title: "2000s",
		blurb: "Y2K pop, crunk, emo and ringtone rap.",
		emoji: "📱",
		group: "eras",
		sources: [playlist("248297032"), playlist("1977689462"), playlist("8326097522"), playlist("8873748882")],
	},
	{
		id: "2010s",
		title: "2010s",
		blurb: "EDM drops, streaming-era pop, trap.",
		emoji: "📸",
		group: "eras",
		sources: [playlist("14917741483"), playlist("715215865"), playlist("11153461484"), playlist("5922972724")],
	},
	{
		id: "2020s",
		title: "2020s",
		blurb: "The songs on everyone's feed right now.",
		emoji: "✨",
		group: "eras",
		sources: [playlist("13650084141"), playlist("13681195421"), playlist("4403076402")],
	},
	{
		id: "charts",
		title: "Global top 100",
		blurb: "Whatever the world is streaming this week.",
		emoji: "🌍",
		group: "eras",
		sources: [{ kind: "chart" }],
	},

	/* ─── Genres ─── */
	{
		id: "pop",
		title: "Pop",
		blurb: "Pure hooks from every decade.",
		emoji: "🍭",
		group: "genres",
		sources: [radio("31061"), playlist("1036183001"), playlist("8487199702"), playlist("5052700044")],
	},
	{
		id: "hiphop",
		title: "Hip-hop",
		blurb: "From boom bap to today's charts.",
		emoji: "🎤",
		group: "genres",
		sources: [radio("30991"), radio("31021"), radio("37101"), playlist("1677006641"), playlist("7643119942")],
	},
	{
		id: "rock",
		title: "Rock",
		blurb: "Riffs, anthems and stadium singalongs.",
		emoji: "🎸",
		group: "genres",
		sources: [playlist("1306931615"), radio("37765"), playlist("3126664682"), playlist("1728093421")],
	},
	{
		id: "rnb",
		title: "R&B & soul",
		blurb: "Slow jams, funk and neo-soul.",
		emoji: "🎷",
		group: "genres",
		sources: [radio("30881"), playlist("2021626162"), playlist("8802867742"), playlist("8374115062"), playlist("4160013622")],
	},
	{
		id: "country",
		title: "Country",
		blurb: "Trucks, heartbreak and stadium country.",
		emoji: "🤠",
		group: "genres",
		sources: [playlist("1130102843"), playlist("1294431447"), playlist("1132251583"), radio("36801")],
	},
	{
		id: "indie",
		title: "Indie & alternative",
		blurb: "Festival headliners and bedroom pop.",
		emoji: "🌿",
		group: "genres",
		sources: [playlist("735488796"), playlist("8716319082"), playlist("9341070582"), playlist("8929584182"), playlist("5337198442")],
	},
	{
		id: "dance",
		title: "Dance & electronic",
		blurb: "Club classics and festival drops.",
		emoji: "🔊",
		group: "genres",
		sources: [radio("30951"), radio("36891"), radio("30841"), playlist("10537498422")],
	},
	{
		id: "metal",
		title: "Metal & punk",
		blurb: "Loud, fast, heavy.",
		emoji: "🤘",
		group: "genres",
		sources: [playlist("2655390504"), playlist("1367442165"), playlist("8981140762"), playlist("1371750135"), playlist("861202821")],
	},
	{
		id: "latin",
		title: "Latin",
		blurb: "Reggaeton, salsa and Latin pop.",
		emoji: "💃",
		group: "genres",
		sources: [playlist("5104249748"), playlist("178699142"), playlist("13288040963"), radio("30941")],
	},
	{
		id: "kpop",
		title: "K-pop",
		blurb: "Idol groups from 2nd gen to now.",
		emoji: "🇰🇷",
		group: "genres",
		sources: [playlist("4096400722"), playlist("9001527742"), playlist("7482846624")],
	},

	/* ─── Vibes ─── */
	{
		id: "party",
		title: "Party starters",
		blurb: "Songs that fill a dance floor instantly.",
		emoji: "🎉",
		group: "vibes",
		sources: [radio("36871"), playlist("1913763402"), playlist("2322259622"), playlist("1977689462"), playlist("715215865")],
	},
	{
		id: "onehit",
		title: "One-hit wonders",
		blurb: "You know the song. Do you know who sang it?",
		emoji: "🎯",
		group: "vibes",
		sources: [playlist("4437217166"), playlist("4437759126"), playlist("5928559924")],
	},
	{
		id: "soundtracks",
		title: "Movie soundtracks",
		blurb: "Songs you know from the big screen.",
		emoji: "🎬",
		group: "vibes",
		sources: [playlist("754776991")],
	},
	{
		id: "disney",
		title: "Disney",
		blurb: "From the vault to the latest hits.",
		emoji: "🏰",
		group: "vibes",
		sources: [playlist("1962379246"), playlist("11817251201")],
	},
	{
		id: "yacht",
		title: "Yacht rock",
		blurb: "Smooth 70s and 80s soft rock.",
		emoji: "⛵",
		group: "vibes",
		sources: [playlist("4728353304"), playlist("11218552684")],
	},
	{
		id: "emo",
		title: "Emo & pop punk",
		blurb: "Eyeliner optional.",
		emoji: "🖤",
		group: "vibes",
		sources: [playlist("7780640082"), playlist("861202821"), playlist("10415648522")],
	},
	{
		id: "wedding",
		title: "Wedding classics",
		blurb: "First dances and last-call singalongs.",
		emoji: "💍",
		group: "vibes",
		sources: [playlist("2252328026"), playlist("10487541482"), playlist("7456464544")],
	},
	{
		id: "holiday",
		title: "Holiday",
		blurb: "It's always the season somewhere.",
		emoji: "🎄",
		group: "vibes",
		sources: [playlist("8454338222"), playlist("2435431886")],
	},
];

/** A special category that draws one song from each of several random categories. */
export const MIX_CATEGORY_ID = "mix";

export function findCategory(id: string) {
	return UNLIMITED_CATEGORIES.find((category) => category.id === id) ?? null;
}
