import sqlite3
import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional

DB_PATH = "history.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metrics TEXT,
        quality_report TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations (id)
    )
    ''')
    
    conn.commit()
    conn.close()

def create_conversation(user_id: str, title: str = "New Analysis") -> str:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    conv_id = str(uuid.uuid4())
    cursor.execute(
        "INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)",
        (conv_id, user_id, title)
    )
    conn.commit()
    conn.close()
    return conv_id

def update_conversation_title(conv_id: str, title: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE conversations SET title = ? WHERE id = ?", (title, conv_id))
    conn.commit()
    conn.close()

def add_message(conversation_id: str, role: str, content: str, metrics: Optional[Dict] = None, quality_report: Optional[Dict] = None) -> str:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    msg_id = str(uuid.uuid4())
    metrics_str = json.dumps(metrics) if metrics else None
    qr_str = json.dumps(quality_report) if quality_report else None
    
    cursor.execute(
        "INSERT INTO messages (id, conversation_id, role, content, metrics, quality_report) VALUES (?, ?, ?, ?, ?, ?)",
        (msg_id, conversation_id, role, content, metrics_str, qr_str)
    )
    conn.commit()
    conn.close()
    return msg_id

def get_user_conversations(user_id: str) -> List[Dict]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, title, created_at FROM conversations WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,)
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_conversation_history(conversation_id: str) -> List[Dict]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(
        "SELECT role, content, metrics, quality_report, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
        (conversation_id,)
    )
    rows = cursor.fetchall()
    conn.close()
    
    history = []
    for r in rows:
        msg = dict(r)
        if msg["metrics"]:
            msg["metrics"] = json.loads(msg["metrics"])
        if msg["quality_report"]:
            msg["quality_report"] = json.loads(msg["quality_report"])
        history.append(msg)
    return history

# Initialize DB on import
init_db()
