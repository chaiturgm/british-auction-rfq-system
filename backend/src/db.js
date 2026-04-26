const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "..", "rfq-auction.sqlite");
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, function onGet(error, row) {
      if (error) reject(error);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, function onAll(error, rows) {
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

async function initDb() {
  await run("PRAGMA foreign_keys = ON");

  await run(`
    CREATE TABLE IF NOT EXISTS rfqs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      reference_id TEXT NOT NULL UNIQUE,
      is_british_auction INTEGER NOT NULL DEFAULT 1,
      bid_start_time TEXT NOT NULL,
      bid_close_time TEXT NOT NULL,
      original_bid_close_time TEXT NOT NULL,
      forced_bid_close_time TEXT NOT NULL,
      pickup_service_date TEXT NOT NULL,
      trigger_window_minutes INTEGER NOT NULL,
      extension_duration_minutes INTEGER NOT NULL,
      extension_trigger_type TEXT NOT NULL CHECK (
        extension_trigger_type IN (
          'BID_RECEIVED',
          'ANY_RANK_CHANGE',
          'L1_RANK_CHANGE'
        )
      ),
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rfq_id INTEGER NOT NULL,
      carrier_name TEXT NOT NULL,
      freight_charges REAL NOT NULL,
      origin_charges REAL NOT NULL,
      destination_charges REAL NOT NULL,
      transit_time TEXT NOT NULL,
      quote_validity TEXT NOT NULL,
      total_price REAL NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (rfq_id) REFERENCES rfqs(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rfq_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (
        type IN ('RFQ_CREATED', 'BID_SUBMITTED', 'TIME_EXTENDED')
      ),
      message TEXT NOT NULL,
      reason TEXT,
      old_close_time TEXT,
      new_close_time TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (rfq_id) REFERENCES rfqs(id) ON DELETE CASCADE
    )
  `);
}

module.exports = {
  db,
  run,
  get,
  all,
  initDb,
};
