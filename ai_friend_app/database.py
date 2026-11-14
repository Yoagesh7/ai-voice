import sqlite3
import json
from datetime import datetime
from config import DB_PATH

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # User Profile table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS profile (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_name TEXT DEFAULT 'Friend',
        preferred_language TEXT DEFAULT 'tanglish', -- 'tanglish', 'tamil', 'english'
        ai_friend_name TEXT DEFAULT 'Shanthi',
        ai_voice TEXT DEFAULT 'roopa',              -- 'roopa', 'kavitha', 'priya', 'gokul', 'ratan'
        user_bio TEXT DEFAULT 'A hardworking person who loves casual talks and sharing daily life.',
        relationship_tone TEXT DEFAULT 'calm_mature_confidante',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Long-term Memory Facts table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fact TEXT NOT NULL,
        category TEXT DEFAULT 'general', -- 'work', 'emotion', 'hobby', 'health', 'relationship'
        importance INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Call Logs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS call_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP,
        duration_sec INTEGER DEFAULT 0,
        summary TEXT,
        mood TEXT DEFAULT 'good',
        transcript_json TEXT DEFAULT '[]'
    )
    """)

    # Chat Messages (for both ongoing calls and text chat)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        call_id INTEGER,
        sender TEXT NOT NULL, -- 'user' or 'ai'
        text TEXT NOT NULL,
        audio_base64 TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Initialize default profile if empty
    cursor.execute("SELECT COUNT(*) as cnt FROM profile")
    if cursor.fetchone()["cnt"] == 0:
        cursor.execute("""
        INSERT INTO profile (user_name, preferred_language, ai_friend_name, ai_voice, user_bio)
        VALUES ('Friend', 'tanglish', 'Nila', 'kavitha', 'Someone looking for a warm, caring friend to talk to.')
        """)

        # Add initial starting memories
        cursor.execute("""
        INSERT INTO memories (fact, category) VALUES 
        ('Prefers casual Tanglish conversation with warmth and care', 'preference'),
        ('Likes talking about daily routine, feelings, and unwinding', 'general')
        """)

    conn.commit()
    conn.close()

# Profile helpers
def get_profile():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM profile ORDER BY id DESC LIMIT 1")
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else {}

def update_profile(user_name, preferred_language, ai_friend_name, ai_voice, user_bio=None):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE profile 
    SET user_name = ?, preferred_language = ?, ai_friend_name = ?, ai_voice = ?, user_bio = COALESCE(?, user_bio)
    WHERE id = (SELECT id FROM profile ORDER BY id DESC LIMIT 1)
    """, (user_name, preferred_language, ai_friend_name, ai_voice, user_bio))
    conn.commit()
    conn.close()
    return get_profile()

# Memories helpers
def get_all_memories():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM memories ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_memory(fact, category='general', importance=1):
    conn = get_connection()
    cursor = conn.cursor()
    # Avoid duplicate fact
    cursor.execute("SELECT id FROM memories WHERE fact = ?", (fact,))
    if not cursor.fetchone():
        cursor.execute("INSERT INTO memories (fact, category, importance) VALUES (?, ?, ?)", (fact, category, importance))
        conn.commit()
    conn.close()

def delete_memory(memory_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
    conn.commit()
    conn.close()

# Message and Call logs helpers
def save_message(sender, text, audio_base64=None, call_id=None):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO messages (sender, text, audio_base64, call_id) VALUES (?, ?, ?, ?)",
                   (sender, text, audio_base64, call_id))
    conn.commit()
    msg_id = cursor.lastrowid
    conn.close()
    return msg_id

def get_recent_messages(limit=20):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, sender, text, created_at, call_id FROM messages ORDER BY id DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in reversed(rows)]

def start_call():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO call_logs (start_time) VALUES (?)", (datetime.now().isoformat(),))
    conn.commit()
    call_id = cursor.lastrowid
    conn.close()
    return call_id

def end_call(call_id, duration_sec, summary, mood, transcript):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE call_logs 
    SET end_time = ?, duration_sec = ?, summary = ?, mood = ?, transcript_json = ?
    WHERE id = ?
    """, (datetime.now().isoformat(), duration_sec, summary, mood, json.dumps(transcript), call_id))
    conn.commit()
    conn.close()

def get_call_history(limit=15):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM call_logs ORDER BY id DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        try:
            d["transcript"] = json.loads(d.get("transcript_json", "[]"))
        except:
            d["transcript"] = []
        result.append(d)
    return result

def clear_all_data():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM messages")
    cursor.execute("DELETE FROM call_logs")
    cursor.execute("DELETE FROM memories WHERE category != 'preference'")
    conn.commit()
    conn.close()

init_db()
