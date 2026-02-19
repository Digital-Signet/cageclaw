use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const DB_FILENAME: &str = "cageclaw.db";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkEvent {
    pub id: Option<i64>,
    pub timestamp: String,
    pub direction: String, // "outbound" | "inbound"
    pub method: String,
    pub url: String,
    pub host: String,
    pub status_code: Option<i32>,
    pub action: String, // "allowed" | "blocked"
    pub bytes_sent: Option<i64>,
    pub bytes_received: Option<i64>,
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new() -> Result<Self, rusqlite::Error> {
        let db_path = Self::db_path();
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let conn = Connection::open(&db_path)?;

        // Enable WAL mode for concurrent reads
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;

        let db = Self { conn };
        db.create_tables()?;
        Ok(db)
    }

    fn db_path() -> PathBuf {
        dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("cageclaw")
            .join(DB_FILENAME)
    }

    fn create_tables(&self) -> Result<(), rusqlite::Error> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS network_events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp   TEXT NOT NULL,
                direction   TEXT NOT NULL DEFAULT 'outbound',
                method      TEXT NOT NULL DEFAULT 'GET',
                url         TEXT NOT NULL,
                host        TEXT NOT NULL,
                status_code INTEGER,
                action      TEXT NOT NULL DEFAULT 'allowed',
                bytes_sent  INTEGER,
                bytes_recv  INTEGER
            );

            CREATE INDEX IF NOT EXISTS idx_network_timestamp ON network_events(timestamp);
            CREATE INDEX IF NOT EXISTS idx_network_host ON network_events(host);
            CREATE INDEX IF NOT EXISTS idx_network_action ON network_events(action);

            CREATE TABLE IF NOT EXISTS sessions (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at TEXT NOT NULL,
                ended_at   TEXT,
                runtime    TEXT NOT NULL,
                image      TEXT NOT NULL
            );
            ",
        )?;
        Ok(())
    }

    pub fn insert_network_event(&self, event: &NetworkEvent) -> Result<i64, rusqlite::Error> {
        self.conn.execute(
            "INSERT INTO network_events (timestamp, direction, method, url, host, status_code, action, bytes_sent, bytes_recv)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                event.timestamp,
                event.direction,
                event.method,
                event.url,
                event.host,
                event.status_code,
                event.action,
                event.bytes_sent,
                event.bytes_received,
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn get_network_events(
        &self,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<NetworkEvent>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp, direction, method, url, host, status_code, action, bytes_sent, bytes_recv
             FROM network_events
             ORDER BY id DESC
             LIMIT ?1 OFFSET ?2",
        )?;

        let events = stmt
            .query_map(params![limit, offset], |row| {
                Ok(NetworkEvent {
                    id: Some(row.get(0)?),
                    timestamp: row.get(1)?,
                    direction: row.get(2)?,
                    method: row.get(3)?,
                    url: row.get(4)?,
                    host: row.get(5)?,
                    status_code: row.get(6)?,
                    action: row.get(7)?,
                    bytes_sent: row.get(8)?,
                    bytes_received: row.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(events)
    }

    /// Get distinct blocked hosts since a given timestamp (for toast notifications).
    pub fn get_recent_blocked_hosts(
        &self,
        since: &str,
    ) -> Result<Vec<String>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT host FROM network_events
             WHERE action = 'blocked' AND timestamp > ?1
             ORDER BY timestamp DESC",
        )?;
        let hosts = stmt
            .query_map(params![since], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        Ok(hosts)
    }

    pub fn get_event_counts(&self) -> Result<EventCounts, rusqlite::Error> {
        let total: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM network_events", [], |row| row.get(0))?;
        let blocked: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM network_events WHERE action = 'blocked'",
            [],
            |row| row.get(0),
        )?;
        Ok(EventCounts {
            total_requests: total,
            blocked_requests: blocked,
            allowed_requests: total - blocked,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventCounts {
    pub total_requests: i64,
    pub blocked_requests: i64,
    pub allowed_requests: i64,
}
