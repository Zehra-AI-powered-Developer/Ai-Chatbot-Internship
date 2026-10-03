"""
Database Access Layer for AI Chatbot
XICTEK Systems Internship - Day 2 & Day 3 Production Architecture

Provides SQLite-backed persistence for chat sessions and message history.
Uses SQLite with WAL mode for fast concurrent reads and writes.
"""

import os
import sqlite3
import uuid
from datetime import datetime

DB_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(DB_DIR, "chat_history.db")


def get_db_connection():
    """Create a thread-safe connection to SQLite with row dictionary factory."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # Enable Write-Ahead Logging for better concurrent read/write performance
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def init_db():
    """Initialize database tables if they do not exist."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        persona TEXT NOT NULL DEFAULT 'helpful',
        model TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        provider TEXT DEFAULT '',
        model TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    """)

    # Indices for fast retrieval
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC);")

    conn.commit()
    conn.close()


def create_session(title="New Conversation", persona="helpful", model="") -> str:
    """Create a new chat session and return its unique ID."""
    session_id = str(uuid.uuid4())
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO sessions (id, title, persona, model) VALUES (?, ?, ?, ?)",
        (session_id, title, persona, model)
    )
    conn.commit()
    conn.close()
    return session_id


def get_sessions():
    """Retrieve all sessions ordered by most recently updated."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT s.id, s.title, s.persona, s.model, s.created_at, s.updated_at,
               COUNT(m.id) as message_count
        FROM sessions s
        LEFT JOIN messages m ON s.id = m.session_id
        GROUP BY s.id
        ORDER BY s.updated_at DESC
    """)
    rows = cursor.fetchall()
    sessions = [dict(row) for row in rows]
    conn.close()
    return sessions


def get_session(session_id: str):
    """Retrieve a single session by its ID."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def update_session(session_id: str, title: str = None, persona: str = None):
    """Update session title or persona and touch updated_at timestamp."""
    conn = get_db_connection()
    cursor = conn.cursor()
    if title and persona:
        cursor.execute(
            "UPDATE sessions SET title = ?, persona = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (title, persona, session_id)
        )
    elif title:
        cursor.execute(
            "UPDATE sessions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (title, session_id)
        )
    elif persona:
        cursor.execute(
            "UPDATE sessions SET persona = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (persona, session_id)
        )
    conn.commit()
    conn.close()


def delete_session(session_id: str) -> bool:
    """Delete a session and all its associated messages."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
    cursor.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    affected = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return affected


def clear_session_messages(session_id: str):
    """Delete all messages in a session but keep the session intact."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
    cursor.execute("UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (session_id,))
    conn.commit()
    conn.close()


def add_message(session_id: str, role: str, content: str, provider: str = "", model: str = "") -> str:
    """Insert a new message into a session."""
    msg_id = str(uuid.uuid4())
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO messages (id, session_id, role, content, provider, model)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (msg_id, session_id, role, content, provider, model)
    )
    # Touch session updated_at
    cursor.execute("UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (session_id,))
    conn.commit()
    conn.close()
    return msg_id


def get_messages(session_id: str, limit: int = 100):
    """Retrieve ordered messages for a given session."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """SELECT id, session_id, role, content, provider, model, created_at
           FROM messages
           WHERE session_id = ?
           ORDER BY created_at ASC
           LIMIT ?""",
        (session_id, limit)
    )
    rows = cursor.fetchall()
    messages = [dict(row) for row in rows]
    conn.close()
    return messages


# Ensure tables are ready on module load
init_db()
