const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const DB_PATH = path.join(app.getPath('userData'), 'app.db');

// Initialize database with schema
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
      if (err) {
        reject(err);
        return;
      }

      // Check if tables exist
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='inventory'", (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (!row) {
          // Tables don't exist, create them
          createTables(db).then(resolve).catch(reject);
        } else {
          resolve();
        }
      });
    });
  });
}

function createTables(db) {
  return new Promise((resolve, reject) => {
    const schemaSQL = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
    
    db.exec(schemaSQL, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function getDbConnection() {
  return new sqlite3.Database(DB_PATH);
}

module.exports = {
  initializeDatabase,
  getDbConnection
};