import React, { useState, useEffect } from 'react';
import './App.css';

// See Spoolman API docs: https://donkie.github.io/Spoolman/
function App() {
  // Default Spoolman URL (no /api)
  const [spoolmanUrl, setSpoolmanUrl] = useState('http://192.168.0.15:7912');
  const [spools, setSpools] = useState([]);
  const [selectedSpool, setSelectedSpool] = useState('');
  const [gramsUsed, setGramsUsed] = useState('');
  const [remaining, setRemaining] = useState([]);
  const [message, setMessage] = useState('');
  const [connected, setConnected] = useState(null); // null: unknown, true: connected, false: not connected
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [spoolmanInfo, setSpoolmanInfo] = useState(null);
  const [infoError, setInfoError] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Add refresh trigger

  // Check connection to Spoolman using /api/info
  const checkConnection = (url) => {
    fetch(`/api/info`)
      .then(res => {
        if (res.ok) {
          setConnected(true);
        } else {
          setConnected(false);
        }
      })
      .catch(() => setConnected(false));
  };

  useEffect(() => {
    fetch(`/api/config`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch config');
        return res.json();
      })
      .then(data => {
        // Remove trailing /api if present
        if (data.spoolmanUrl) {
          let url = data.spoolmanUrl.replace(/\/api$/, '');
          setSpoolmanUrl(url);
          checkConnection(url);
        }
      })
      .catch(err => {
        setMessage('Error loading config: ' + err.message);
        console.error('Config fetch error:', err);
      });
  }, []);

  useEffect(() => {
    if (connected) {
      fetch(`/api/spools`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch spools');
          return res.json();
        })
        .then(data => setSpools(Array.isArray(data) ? data : data.results || []))
        .catch(err => {
          setMessage('Error loading spools: ' + err.message);
          console.error('Spools fetch error:', err);
        });
      fetch(`/api/remaining`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch remaining');
          return res.json();
        })
        .then(data => setRemaining(data))
        .catch(err => {
          setMessage('Error loading remaining filament: ' + err.message);
          console.error('Remaining fetch error:', err);
        });
    } else {
      setSpools([]);
      setRemaining([]);
    }
  }, [spoolmanUrl, message, connected, refreshTrigger]); // Add refreshTrigger to dependencies

  const handleConfig = (e) => {
    e.preventDefault();
    // Remove trailing /api if present
    let url = spoolmanUrl.replace(/\/api$/, '');
    fetch(`/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spoolmanUrl: url })
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to set config');
        return res.json();
      })
      .then(data => {
        setMessage('Spoolman URL updated!');
        setSpoolmanUrl(url);
        checkConnection(url);
      })
      .catch(err => {
        setMessage('Error setting config: ' + err.message);
        console.error('Config POST error:', err);
      });
  };

  const handleUsage = (e) => {
    e.preventDefault();
    if (!selectedSpool || !gramsUsed) return;
    fetch(`/api/usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spool_id: selectedSpool, weight: parseFloat(gramsUsed) })
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to register usage');
        return res.json();
      })
      .then(data => {
        if (data.success) {
          setMessage('Usage registered!');
          setGramsUsed('');
          setRefreshTrigger(prev => prev + 1); // Force refresh
        } else {
          setMessage(data.error || 'Error registering usage');
        }
      })
      .catch(err => {
        setMessage('Error registering usage: ' + err.message);
        console.error('Usage POST error:', err);
      });
  };

  const fetchSpoolmanInfo = async () => {
    setInfoError(null);
    try {
      const res = await fetch('/api/info');
      const data = await res.json();
      if (res.ok) {
        setSpoolmanInfo(data);
      } else {
        setSpoolmanInfo(null);
        setInfoError(data.error || 'Unknown error');
      }
    } catch (err) {
      setSpoolmanInfo(null);
      setInfoError('Failed to fetch info');
    }
    setInfoModalOpen(true);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.custom-select')) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', gap: '0' }}>
      {/* Main Content Area */}
      <div style={{ flex: 1, padding: '20px' }}>
        <div className="container" style={{ maxWidth: 'none', margin: '0', padding: '0' }}>
          <h1>Spoolman Filament Usage</h1>
          
          <form onSubmit={handleUsage} className="usage-form" style={{ 
            display: 'flex', 
            gap: '16px', 
            alignItems: 'flex-end',
            marginBottom: '24px',
            padding: '16px',
            backgroundColor: '#1e1e1e',
            borderRadius: '8px',
            border: '1px solid #444'
          }}>
            <label style={{ flex: 1 }}>
              Select Spool:
              <div className="custom-select" style={{ position: 'relative', marginTop: '8px' }}>
                <div
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  style={{
                    minWidth: '300px',
                    padding: '5px 10px',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    backgroundColor: '#1e1e1e',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  {selectedSpool ? (
                    <>
                      {spools.find(s => s.id === parseInt(selectedSpool))?.filament?.color_hex && (
                        <span style={{
                          display: 'inline-block',
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          backgroundColor: `#${spools.find(s => s.id === parseInt(selectedSpool))?.filament?.color_hex}`,
                          border: '1px solid #666'
                        }} />
                      )}
                      {spools.find(s => s.id === parseInt(selectedSpool))?.filament?.name || selectedSpool}
                    </>
                  ) : '--Choose--'}
                </div>
                {dropdownOpen && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    maxHeight: '250px',
                    overflowY: 'auto',
                    backgroundColor: '#1e1e1e',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    marginTop: '2px',
                    zIndex: 1000,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                  }}>
                    {spools.map(spool => (
                      <div
                        key={spool.id}
                        onClick={() => {
                          setSelectedSpool(spool.id.toString());
                          setDropdownOpen(false);
                        }}
                        style={{
                          padding: '8px 10px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          backgroundColor: parseInt(selectedSpool) === spool.id ? '#2d2d2d' : '#1e1e1e',
                          color: '#fff',
                          ':hover': {
                            backgroundColor: '#2d2d2d'
                          }
                        }}
                      >
                        {spool.filament?.color_hex && (
                          <span style={{
                            display: 'inline-block',
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            backgroundColor: `#${spool.filament.color_hex}`,
                            border: '1px solid #666'
                          }} />
                        )}
                        {spool.filament?.name || spool.id}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </label>
            <label style={{ width: '150px' }}>
              Grams Used:
              <input
                type="number"
                min="0"
                step="0.1"
                value={gramsUsed}
                onChange={e => setGramsUsed(e.target.value)}
                style={{ 
                  width: '100%',
                  backgroundColor: '#1e1e1e',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  padding: '8px',
                  marginTop: '8px'
                }}
              />
            </label>
            <button 
              type="submit"
              style={{
                backgroundColor: '#ff9800',
                border: 'none',
                color: '#000',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Register Usage
            </button>
          </form>
          
          {message && <p style={{ color: 'green', marginBottom: '24px' }}>{message}</p>}
          
          <hr style={{ margin: '24px 0' }} />
          
          <h2>Remaining Filament</h2>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            backgroundColor: '#1e1e1e',
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#2d2d2d' }}>
                <th style={{ textAlign: 'left', padding: '12px' }}>Color</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>Filament</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>Vendor</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>Remaining (g)</th>
              </tr>
            </thead>
            <tbody>
              {spools.map(spool => (
                <tr key={spool.id} style={{ 
                  borderTop: '1px solid #444',
                  backgroundColor: spool.id === parseInt(selectedSpool) ? '#2d2d2d' : 'transparent'
                }}>
                  <td style={{ padding: '8px' }}>
                    {spool.filament?.color_hex && (
                      <span style={{
                        display: 'inline-block',
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        backgroundColor: `#${spool.filament.color_hex}`,
                        border: '1px solid #666'
                      }} />
                    )}
                  </td>
                  <td style={{ padding: '8px' }}>{spool.filament?.name || 'Unknown'}</td>
                  <td style={{ padding: '8px' }}>{spool.filament?.vendor?.name || 'Unknown'}</td>
                  <td style={{ textAlign: 'right', padding: '8px' }}>
                    {spool.remaining_weight?.toFixed(1) || 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Settings Panel */}
      <div style={{ 
        width: '350px', 
        backgroundColor: '#1a1a1a', 
        borderLeft: '1px solid #444',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        <h2 style={{ color: '#ff9800', marginBottom: '0' }}>Settings</h2>
        
        {/* Connection Status */}
        <div style={{ 
          padding: '16px',
          backgroundColor: '#232323',
          borderRadius: '8px',
          border: '1px solid #444'
        }}>
          <h3 style={{ color: '#ff9800', marginBottom: '12px', fontSize: '16px' }}>Connection Status</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{
              display: 'inline-block',
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              background: connected === null ? '#888' : connected ? '#4caf50' : '#f44336',
              border: '2px solid #222'
            }} />
            <span style={{ 
              color: connected === null ? '#888' : connected ? '#4caf50' : '#f44336', 
              fontWeight: 'bold' 
            }}>
              {connected === null ? 'Unknown' : connected ? 'Connected' : 'Not Connected'}
            </span>
          </div>
          <button 
            onClick={fetchSpoolmanInfo} 
            style={{
              backgroundColor: '#2d2d2d',
              border: '1px solid #444',
              color: '#fff',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              marginTop: '12px',
              width: '100%'
            }}
          >
            Show Spoolman Info
          </button>
        </div>

        {/* URL Configuration */}
        <div style={{ 
          padding: '16px',
          backgroundColor: '#232323',
          borderRadius: '8px',
          border: '1px solid #444'
        }}>
          <h3 style={{ color: '#ff9800', marginBottom: '12px', fontSize: '16px' }}>Spoolman Configuration</h3>
          <form onSubmit={handleConfig} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ marginBottom: '4px' }}>Spoolman URL:</span>
              <input
                type="text"
                value={spoolmanUrl}
                onChange={e => setSpoolmanUrl(e.target.value)}
                placeholder="e.g. http://192.168.0.15:7912"
                style={{ 
                  width: '100%',
                  backgroundColor: '#1e1e1e',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  padding: '8px'
                }}
              />
            </label>
            <button 
              type="submit"
              style={{
                backgroundColor: '#4caf50',
                border: 'none',
                color: '#000',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Update URL
            </button>
          </form>
        </div>
      </div>

      {/* Info Modal */}
      {infoModalOpen && (
        <div className="modal-overlay" onClick={() => setInfoModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Spoolman Info</h2>
            {infoError ? (
              <div className="error">{infoError}</div>
            ) : (
              <pre>{JSON.stringify(spoolmanInfo, null, 2)}</pre>
            )}
            <button onClick={() => setInfoModalOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;