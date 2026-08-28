const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../scheduler.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
  } else {
    console.log('⚡ Connected to SQLite Database at:', dbPath);
  }
});

// Initialize Tables
function initDb() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 1. Schedules Table
      db.run(`
        CREATE TABLE IF NOT EXISTS schedules (
          id TEXT PRIMARY KEY,
          recipient TEXT NOT NULL,
          message TEXT NOT NULL,
          scheduled_at TEXT NOT NULL,
          recurring_type TEXT DEFAULT 'none',
          recurring_value TEXT,
          status TEXT DEFAULT 'pending',
          created_at TEXT NOT NULL,
          sent_at TEXT,
          error_message TEXT,
          media_url TEXT
        )
      `);

      // 2. Contacts Table
      db.run(`
        CREATE TABLE IF NOT EXISTS contacts (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          phone TEXT NOT NULL UNIQUE,
          tag TEXT DEFAULT 'General',
          created_at TEXT NOT NULL
        )
      `);

      // 3. Templates Table
      db.run(`
        CREATE TABLE IF NOT EXISTS templates (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          category TEXT DEFAULT 'General',
          created_at TEXT NOT NULL
        )
      `);

      // 4. Activity Logs Table
      db.run(`
        CREATE TABLE IF NOT EXISTS logs (
          id TEXT PRIMARY KEY,
          schedule_id TEXT,
          type TEXT NOT NULL,
          message TEXT NOT NULL,
          timestamp TEXT NOT NULL
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

// Database Helpers wrapped in Promises
const dbQuery = {
  all: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },
  get: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  run: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }
};

module.exports = {
  db,
  initDb,
  dbQuery
};
