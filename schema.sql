CREATE TABLE IF NOT EXISTS articles_sync (
    user_id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id)
);
