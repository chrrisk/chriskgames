CREATE TABLE IF NOT EXISTS results (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	date TEXT NOT NULL,
	game TEXT NOT NULL,
	score INTEGER NOT NULL,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_results_date_game ON results (date, game);

-- songgame unlimited: quizzes people build and send to friends.
CREATE TABLE IF NOT EXISTS quizzes (
	id TEXT PRIMARY KEY,
	payload TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quiz_results (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	quiz_id TEXT NOT NULL,
	score INTEGER NOT NULL,
	name TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quiz_results_quiz ON quiz_results (quiz_id);
