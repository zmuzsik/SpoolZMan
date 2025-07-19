const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Get Spoolman info (for connection check)
app.get('/api/info', async (req, res) => {
  try {
    const response = await axios.get(`${getSpoolmanApiUrl()}/info/`);
    // Always return { results: [...] } for frontend compatibility
    if (Array.isArray(response.data)) {
      res.json({ results: response.data });
    } else if (Array.isArray(response.data.results)) {
      res.json({ results: response.data.results });
    } else {
      res.json({ results: [] });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch Spoolman info', details: err.message });
  }
});

// Configurable Spoolman URL (default to Spoolman, no /api/v1)
let spoolmanBaseUrl = 'http://192.168.0.15:7912';
function getSpoolmanApiUrl() {
  // Always append /api/v1
  return spoolmanBaseUrl.replace(/\/$/, '') + '/api/v1';
}

// SQLite DB setup
const dbPath = path.join(__dirname, 'usage.db');
const db = new sqlite3.Database(dbPath);
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spool_id TEXT,
    used_at TEXT,
    weight REAL,
    note TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);
});

// Load Spoolman URL from DB on startup
function loadSpoolmanUrlFromDb() {
  db.get('SELECT value FROM settings WHERE key = ?', ['spoolmanUrl'], (err, row) => {
    if (!err && row && typeof row.value === 'string') {
      spoolmanBaseUrl = row.value;
      console.log('Loaded Spoolman URL from DB:', spoolmanBaseUrl);
    } else if (err) {
      console.error('Error loading Spoolman URL from DB:', err.message);
    }
  });
}
loadSpoolmanUrlFromDb();


function getUsageHistory(spoolId) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT used_at as date, weight, note FROM usage WHERE spool_id = ? ORDER BY used_at DESC`;
    db.all(query, [spoolId], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        const usageHistory = rows.map(row => ({
          date: row.date,
          weight: row.weight,
          ...(row.note && { note: row.note })
        }));
        resolve(usageHistory);
      }
    });
  });
}

// Set Spoolman URL and save to DB
app.post('/api/config', (req, res) => {
  console.log('POST /api/config called with body:', req.body);
  const url = req.body.spoolmanUrl;
  console.log('spoolmanUrl received:', url);
  if (typeof url !== 'string' || !url.trim()) {
    console.log('Validation failed for spoolmanUrl:', url);
    return res.status(400).json({ success: false, error: 'spoolmanUrl is required and must be a string' });
  }
  try {
    const cleanUrl = url.replace(/\/api(\/v1)?$/, '');
    spoolmanBaseUrl = cleanUrl;
    // Try update first
    db.run('UPDATE settings SET value = ? WHERE key = ?', [cleanUrl, 'spoolmanUrl'], function (err) {
      if (err) {
        console.error('DB update error:', err);
        return res.status(500).json({ success: false, error: 'Failed to update URL in DB' });
      }
      if (this.changes === 0) {
        // No row updated, insert new
        db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['spoolmanUrl', cleanUrl], function (err2) {
          if (err2) {
            console.error('DB insert error:', err2);
            return res.status(500).json({ success: false, error: 'Failed to insert URL in DB' });
          }
          res.json({ success: true, spoolmanUrl: spoolmanBaseUrl });
        });
      } else {
        res.json({ success: true, spoolmanUrl: spoolmanBaseUrl });
      }
    });
  } catch (err) {
    console.error('Exception in /api/config:', err);
    res.status(400).json({ success: false, error: 'Invalid request' });
  }
});

// Get Spoolman URL
app.get('/api/config', (req, res) => {
  res.json({ spoolmanUrl: spoolmanBaseUrl });
});

// Get spools from Spoolman
app.get('/api/spools', async (req, res) => {
  console.log('GET /api/spools called');
  try {
    const apiUrl = `${getSpoolmanApiUrl()}/spool/`;
    console.log('Fetching spools from:', apiUrl);
    const response = await axios.get(apiUrl);
    // Pass through Spoolman's response
    res.json(response.data);
  } catch (err) {
    console.error('Error fetching spools:', err);
    res.status(500).json({ error: 'Failed to fetch spools' });
  }
});

// Register usage
app.post('/api/usage', async (req, res) => {
  const { spool_id, weight, note } = req.body;
  const used_at = new Date().toISOString();
  
  try {
    console.log(`Updating Spoolman spool ${spool_id} with additional weight ${weight} and last_used ${used_at} and note "${note}"`);
    
    // First, get the current spool data to calculate the new remaining weight
    const currentSpoolResponse = await axios.get(`${getSpoolmanApiUrl()}/spool/${spool_id}`);
    const currentSpool = currentSpoolResponse.data;
    
    // Calculate new remaining weight: current remaining - weight used
    const newRemainingWeight = currentSpool.remaining_weight - parseFloat(weight);
    
    console.log(`Current remaining: ${currentSpool.remaining_weight}g, Used: ${weight}g, New remaining: ${newRemainingWeight}g`);
    
    // Update Spoolman with the new remaining weight
    await axios.patch(`${getSpoolmanApiUrl()}/spool/${spool_id}`, { 
      remaining_weight: newRemainingWeight,
      last_used: used_at
    });

    // Then save to local DB if Spoolman update was successful
    db.run(
      'INSERT INTO usage (spool_id, used_at, weight, note) VALUES (?, ?, ?, ?)',
      [spool_id, used_at, weight, note],
      function (err) {
        if (err) {
          console.error('Error saving to local DB:', err);
          return res.status(500).json({ error: 'Failed to save to local DB' });
        }
        res.json({ success: true });
      }
    );
  } catch (err) {
    console.error('Error updating Spoolman:', err.response?.data || err.message);
    return res.status(500).json({ 
      error: 'Failed to update Spoolman',
      details: err.response?.data?.detail || err.message 
    });
  }
});

app.get('/api/usage/:spoolId', async (req, res) => {
  try {
    const spoolId = req.params.spoolId;
    // Fetch usage history for this spool from your database
    const usageHistory = await getUsageHistory(spoolId);
    res.json(usageHistory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get remaining filament for each spool
app.get('/api/remaining', async (req, res) => {
  try {
    const response = await axios.get(`${getSpoolmanApiUrl()}/spool/`);
    const spools = response.data.results || [];
    const remaining = spools.map(spool => ({
      id: spool.id,
      name: spool.display_name,
      remaining_weight: spool.remaining_weight
    }));
    res.json(remaining);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch remaining filament' });
  }
});

const PORT = process.env.PORT || 4000;
console.log('Starting Spoolman Usage backend...');
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
