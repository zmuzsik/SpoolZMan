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
    // Just return the raw response data for info endpoint
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch Spoolman info', details: err.message });
  }
});

// Configurable Spoolman URL (default to Spoolman, no /api/v1)
let spoolmanBaseUrl = 'http://192.168.0.15:7912';
let flowCompensationValue = 1.5; // Add this line

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



function loadSettingsFromDb() {
  // Load Spoolman URL
  db.get('SELECT value FROM settings WHERE key = ?', ['spoolmanUrl'], (err, row) => {
    if (!err && row && typeof row.value === 'string') {
      spoolmanBaseUrl = row.value;
      console.log('Loaded Spoolman URL from DB:', spoolmanBaseUrl);
    } else if (err) {
      console.error('Error loading Spoolman URL from DB:', err.message);
    }
  });

  // Load Flow Compensation Value
  db.get('SELECT value FROM settings WHERE key = ?', ['flowCompensationValue'], (err, row) => {
    if (!err && row) {
      flowCompensationValue = parseFloat(row.value) || 2;
      console.log('Loaded Flow Compensation from DB:', flowCompensationValue);
    } else if (err) {
      console.error('Error loading Flow Compensation from DB:', err.message);
    }
  });
}

// Call the renamed function
loadSettingsFromDb();

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

app.post('/api/config', (req, res) => {
  console.log('POST /api/config called with body:', req.body);
  const { spoolmanUrl, flowCompensationValue: newFlowValue } = req.body;

  if (spoolmanUrl && (typeof spoolmanUrl !== 'string' || !spoolmanUrl.trim())) {
    return res.status(400).json({ success: false, error: 'spoolmanUrl must be a string' });
  }

  try {
    const updates = [];

    // Handle Spoolman URL update
    if (spoolmanUrl) {
      const cleanUrl = spoolmanUrl.replace(/\/api(\/v1)?$/, '');
      updates.push(['spoolmanUrl', cleanUrl]);
    }

    // Handle flow compensation value update
    if (newFlowValue !== undefined) {
      updates.push(['flowCompensationValue', newFlowValue.toString()]);
    }

    // Process all updates
    let completed = 0;
    const total = updates.length;
    let hasError = false;

    if (total === 0) {
      return res.json({ success: true, spoolmanUrl: spoolmanBaseUrl });
    }

    updates.forEach(([key, value]) => {
      console.log('Loop ? to DB: ?', key, value);
      db.run('UPDATE settings SET value = ? WHERE key = ?', [value, key], function (err) {
        if (err && !hasError) {
          hasError = true;
          return res.status(500).json({ success: false, error: 'Failed to update settings' });
        }

        if (this.changes === 0) {
          db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value], function (err2) {
            if (err2 && !hasError) {
              hasError = true;
              return res.status(500).json({ success: false, error: 'Failed to insert settings' });
            }
            // Update the in-memory variable after successful DB operation
            if (key === 'spoolmanUrl') {
              spoolmanBaseUrl = value;
            } else if (key === 'flowCompensationValue') {
              flowCompensationValue = parseFloat(value) || 2;
            }

            completed++;
            if (completed === total && !hasError) {
              res.json({ success: true, spoolmanUrl: spoolmanBaseUrl });
            }
          });
        } else {
          // Update the in-memory variable after successful DB operation
          if (key === 'spoolmanUrl') {
            spoolmanBaseUrl = value;
          } else if (key === 'flowCompensationValue') {
            flowCompensationValue = parseFloat(value) || 2;
          }

          completed++;
          if (completed === total && !hasError) {
            res.json({ success: true, spoolmanUrl: spoolmanBaseUrl });
          }
        }
      });
      console.log('Setting ? to DB: ?', key, value);
    });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Invalid request' });
  }
});

app.get('/api/config', (req, res) => {
  res.json({
    spoolmanUrl: spoolmanBaseUrl,
    flowCompensationValue: flowCompensationValue
  });
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

    // Update Spoolman - if weight would go negative, set to 0
    const spoolmanWeight = Math.max(0, newRemainingWeight);

    console.log(`Current remaining: ${currentSpool.remaining_weight}g, Used: ${weight}g, New remaining: ${newRemainingWeight}g`);

    // Update Spoolman with the new remaining weight
    await axios.patch(`${getSpoolmanApiUrl()}/spool/${spool_id}`, {
      remaining_weight: spoolmanWeight,
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
        res.json({
          success: true,
          wasEmptied: newRemainingWeight < 0
        });
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

app.get('/api/usage', async (req, res) => {
  try {
    const query = `
      SELECT 
        usage.id,
        usage.spool_id,
        usage.used_at as date,
        usage.weight,
        usage.note
      FROM usage 
      ORDER BY usage.used_at DESC`;

    db.all(query, [], async (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      try {
        // Get spool details for each usage record
        const spoolsResponse = await axios.get(`${getSpoolmanApiUrl()}/spool/`, {
          params: {
            allow_archived: true
          }
        });
        const spools = Array.isArray(spoolsResponse.data) ? spoolsResponse.data : spoolsResponse.data.results || [];
        const spoolsMap = {};
        spools.forEach(spool => {
          spoolsMap[spool.id.toString()] = spool; // Convert to string to match usage.spool_id
        });
        /*
                console.log('Available spool IDs:', Object.keys(spoolsMap));
                console.log('Usage record spool_ids:', rows.map(r => r.spool_id));
                console.log('Spools from API:', spools.length, 'spools found');
                console.log('First spool:', spools[0]);
        */
        // Combine usage data with spool information
        const usageWithSpoolInfo = rows.map(row => {
          const spool = spoolsMap[row.spool_id.toString()];
          const cost = (spool?.filament?.price && spool?.initial_weight)
            ? ((row.weight / spool.initial_weight) * spool.filament.price).toFixed(2)
            : null;

          return {
            id: row.id,
            date: row.date,
            weight: row.weight,
            note: row.note,
            cost: cost,
            spool: {
              id: row.spool_id,
              name: spool?.filament?.name || 'Unknown',
              vendor: spool?.filament?.vendor?.name || 'Unknown',
              color_hex: spool?.filament?.color_hex,
              multi_color_hexes: spool?.filament?.multi_color_hexes,
              multi_color_direction: spool?.filament?.multi_color_direction,
              price: spool?.filament?.price,
              initial_weight: spool?.initial_weight
            }
          };
        });

        res.json(usageWithSpoolInfo);
      } catch (spoolError) {
        console.error('Error fetching spool data:', spoolError);
        // Return usage data without spool info if Spoolman is unavailable
        const basicUsage = rows.map(row => ({
          id: row.id,
          date: row.date,
          weight: row.weight,
          note: row.note,
          spool: {
            id: row.spool_id,
            name: 'Unknown',
            vendor: 'Unknown',
            color_hex: null,
            multi_color_hexes: null,
            multi_color_direction: null
          },
          cost: null
        }));
        res.json(basicUsage);
      }
    });
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

// Serve static frontend files from the correct build output
app.use(express.static(path.join(__dirname, 'frontend', 'dist')));

// Fallback for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
});

const PORT = process.env.PORT || 4000;
console.log('Starting Spoolman Usage backend...');
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
