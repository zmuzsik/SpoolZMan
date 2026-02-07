import React, { useState, useEffect } from 'react';
import './App.css';

// See Spoolman API docs: https://donkie.github.io/Spoolman/
function App() {
  // Default Spoolman URL (no /api)
  const [spoolmanUrl, setSpoolmanUrl] = useState('http://192.168.0.15:7912');
  const [spools, setSpools] = useState([]);
  const [selectedSpool, setSelectedSpool] = useState('');
  const [gramsUsed, setGramsUsed] = useState('');
  const [note, setNote] = useState('');
  const [remaining, setRemaining] = useState([]);
  const [message, setMessage] = useState('');
  const [connected, setConnected] = useState(null); // null: unknown, true: connected, false: not connected
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [spoolmanInfo, setSpoolmanInfo] = useState(null);
  const [infoError, setInfoError] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [flowCompensation, setFlowCompensation] = useState(false); // checkbox state
  const [flowCompensationValue, setFlowCompensationValue] = useState(1.5); // default 1.5g

  // Multi-filament entry state
  const [filamentEntries, setFilamentEntries] = useState([
    { id: Date.now(), spoolId: '', weight: '', dropdownOpen: false }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Print job grouping state
  const [expandedJobs, setExpandedJobs] = useState(new Set());

  // New state for right panel and usage tracking
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [selectedSpoolForUsage, setSelectedSpoolForUsage] = useState(null);
  const [usageHistory, setUsageHistory] = useState({});
  const [currentView, setCurrentView] = useState('remaining'); // 'remaining' or 'history'
  const [allUsageHistory, setAllUsageHistory] = useState([]);

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

  // Fetch usage history for a specific spool
  const fetchUsageHistory = async (spoolId) => {
    try {
      const res = await fetch(`/api/usage/${spoolId}`);
      if (res.ok) {
        const data = await res.json();
        setUsageHistory(prev => ({ ...prev, [spoolId]: data }));
      }
    } catch (err) {
      console.error('Error fetching usage history:', err);
    }
  };

  const fetchAllUsageHistory = async () => {
    try {
      const res = await fetch(`/api/usage`);
      if (res.ok) {
        const data = await res.json();
        setAllUsageHistory(data);
      }
    } catch (err) {
      console.error('Error fetching all usage history:', err);
    }
  };

  useEffect(() => {
    fetch(`/api/config`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch config');
        return res.json();
      })
      .then(data => {
        if (data.spoolmanUrl) {
          let url = data.spoolmanUrl.replace(/\/api$/, '');
          setSpoolmanUrl(url);
          checkConnection(url);
        }
        if (data.flowCompensationValue !== undefined) {
          setFlowCompensationValue(data.flowCompensationValue);
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
      // Fetch all usage history if we're on the history view
      if (currentView === 'history') {
        fetchAllUsageHistory();
      }
    } else {
      setSpools([]);
      setRemaining([]);
    }
  }, [spoolmanUrl, message, connected, refreshTrigger, currentView]); // Add refreshTrigger to dependencies

  const handleConfig = (e) => {
    e.preventDefault();
    let url = spoolmanUrl.replace(/\/api$/, '');
    fetch(`/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spoolmanUrl: url,
        flowCompensationValue: flowCompensationValue
      })
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to set config');
        return res.json();
      })
      .then(data => {
        setMessage('Configuration updated!');
        setSpoolmanUrl(url);
        checkConnection(url);
      })
      .catch(err => {
        setMessage('Error setting config: ' + err.message);
        console.error('Config POST error:', err);
      });
  };

  // Helper functions for multi-filament entry
  const addFilamentEntry = () => {
    setFilamentEntries([...filamentEntries, { id: Date.now(), spoolId: '', weight: '', dropdownOpen: false }]);
  };

  const removeFilamentEntry = (id) => {
    if (filamentEntries.length > 1) {
      setFilamentEntries(filamentEntries.filter(entry => entry.id !== id));
    }
  };

  const updateFilamentEntry = (id, field, value) => {
    setFilamentEntries(filamentEntries.map(entry =>
      entry.id === id ? { ...entry, [field]: value } : entry
    ));
  };

  const toggleDropdown = (id) => {
    setFilamentEntries(filamentEntries.map(entry =>
      entry.id === id ? { ...entry, dropdownOpen: !entry.dropdownOpen } : { ...entry, dropdownOpen: false }
    ));
  };

  const selectSpool = (entryId, spoolId) => {
    setFilamentEntries(filamentEntries.map(entry =>
      entry.id === entryId ? { ...entry, spoolId: spoolId.toString(), dropdownOpen: false } : entry
    ));
  };

  const handleUsage = async (e) => {
    e.preventDefault();
    
    // Validate that we have at least one valid entry
    const validEntries = filamentEntries.filter(entry => entry.spoolId && entry.weight);
    if (validEntries.length === 0) {
      setMessage('Please add at least one filament with spool and weight');
      return;
    }

    setIsSubmitting(true);
    const results = {
      succeeded: [],
      failed: [],
      emptied: []
    };

    try {
      // Submit each filament entry sequentially
      for (const entry of validEntries) {
        const baseWeight = parseFloat(entry.weight);
        const finalWeight = parseFloat(
          flowCompensation ? baseWeight + flowCompensationValue : baseWeight
        ).toFixed(1);

        const spool = spools.find(s => s.id === parseInt(entry.spoolId));
        const spoolName = spool?.filament?.name || `Spool ${entry.spoolId}`;

        try {
          const res = await fetch(`/api/usage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              spool_id: entry.spoolId,
              weight: finalWeight,
              note: note
            })
          });

          if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Failed to register usage');
          }

          const data = await res.json();
          
          if (data.success) {
            results.succeeded.push({
              name: spoolName,
              weight: finalWeight,
              baseWeight: baseWeight
            });
            
            if (data.wasEmptied) {
              results.emptied.push(spoolName);
            }
          } else {
            results.failed.push({
              name: spoolName,
              error: data.error || 'Unknown error'
            });
          }
        } catch (err) {
          results.failed.push({
            name: spoolName,
            error: err.message
          });
        }
      }

      // Build detailed message
      let messageLines = [];
      
      if (results.succeeded.length > 0) {
        const totalWeight = results.succeeded.reduce((sum, r) => sum + parseFloat(r.weight), 0);
        const compensationText = flowCompensation 
          ? ` (includes ${flowCompensationValue}g/filament compensation)`
          : '';
        messageLines.push(`✓ Successfully recorded ${results.succeeded.length} filament(s) - Total: ${totalWeight.toFixed(1)}g${compensationText}`);
        
        if (results.emptied.length > 0) {
          messageLines.push(`⚠ Spool(s) emptied: ${results.emptied.join(', ')}`);
        }
      }
      
      if (results.failed.length > 0) {
        messageLines.push(`✗ Failed to record ${results.failed.length} filament(s):`);
        results.failed.forEach(f => {
          messageLines.push(`  • ${f.name}: ${f.error}`);
        });
      }

      setMessage(messageLines.join('\n'));

      // Reset form if all succeeded
      if (results.failed.length === 0) {
        setNote('');
        setFilamentEntries([{ id: Date.now(), spoolId: '', weight: '', dropdownOpen: false }]);
        setRefreshTrigger(prev => prev + 1);
        if (selectedSpoolForUsage) {
          fetchUsageHistory(selectedSpoolForUsage.id);
        }
        if (currentView === 'history') {
          fetchAllUsageHistory();
        }
      }

    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
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

  // Handle spool row click to show usage details
  const handleSpoolClick = (spool) => {
    setSelectedSpoolForUsage(spool);
    fetchUsageHistory(spool.id);
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

  const rightPanelWidth = rightPanelCollapsed ? '50px' : '280px';

  // Group usage history by print job (same hour + note)
  const groupPrintJobs = (usageHistory) => {
    if (usageHistory.length === 0) return [];
    
    const groups = {};
    
    usageHistory.forEach(usage => {
      const date = new Date(usage.date);
      // Create key: year-month-day-hour + note
      const hourKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
      const note = usage.note || '';
      const groupKey = `${hourKey}|${note}`;
      
      if (!groups[groupKey]) {
        groups[groupKey] = {
          jobKey: groupKey,
          date: usage.date,
          note: note,
          entries: [],
          totalWeight: 0,
          totalCost: 0
        };
      }
      
      groups[groupKey].entries.push(usage);
      groups[groupKey].totalWeight += parseFloat(usage.weight) || 0;
      groups[groupKey].totalCost += parseFloat(usage.cost) || 0;
    });
    
    // Convert to array and sort by date descending
    return Object.values(groups).sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );
  };

  const toggleJobExpansion = (jobKey) => {
    setExpandedJobs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(jobKey)) {
        newSet.delete(jobKey);
      } else {
        newSet.add(jobKey);
      }
      return newSet;
    });
  };

  const groupedJobs = groupPrintJobs(allUsageHistory);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', gap: '0', width: '100%' }}>
      {/* Main Content Area - Now takes more space */}
      <div style={{ flex: 1, padding: '20px', minWidth: '1500px' }}>
        <div className="container" style={{ width: '100%', padding: '0' }}>
          <h1>Spoolman Filament Usage</h1>

          <div style={{
            marginBottom: '24px',
            padding: '20px',
            backgroundColor: '#1e1e1e',
            borderRadius: '8px',
            border: '1px solid #444'
          }}>
            <h2 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px', color: '#ff9800' }}>Record Print Job</h2>
            
            <form onSubmit={handleUsage}>
              {/* Print Job Note */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#b0b0b0' }}>
                  Print Job Note
                </label>
                <input
                  type="text"
                  placeholder="e.g., Dynamic Red Packet: Taking the Lead"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#2a2a2a',
                    color: '#fff',
                    border: '1px solid #444',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Filaments Section */}
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '16px', color: '#fff' }}>Filaments Used</h3>
                
                {filamentEntries.map((entry, index) => {
                  const selectedSpool = entry.spoolId ? spools.find(s => s.id === parseInt(entry.spoolId)) : null;
                  
                  return (
                    <div key={entry.id} style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 140px 40px',
                      gap: '12px',
                      marginBottom: '12px',
                      padding: '12px',
                      backgroundColor: '#2a2a2a',
                      borderRadius: '8px',
                      border: '1px solid #3a3a3a'
                    }}>
                      {/* Custom Spool Dropdown */}
                      <div style={{ position: 'relative' }}>
                        <div
                          onClick={() => toggleDropdown(entry.id)}
                          style={{
                            padding: '10px 12px',
                            backgroundColor: '#1e1e1e',
                            border: '1px solid #444',
                            borderRadius: '6px',
                            color: '#e0e0e0',
                            fontSize: '14px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                        >
                          {selectedSpool ? (
                            <>
                              {selectedSpool.filament?.color_hex ? (
                                <span style={{
                                  display: 'inline-block',
                                  width: '12px',
                                  height: '12px',
                                  borderRadius: '50%',
                                  backgroundColor: `#${selectedSpool.filament.color_hex}`,
                                  border: '1px solid #666',
                                  flexShrink: 0
                                }} />
                              ) : selectedSpool.filament?.multi_color_hexes ? (
                                <span style={{
                                  display: 'inline-block',
                                  width: '12px',
                                  height: '12px',
                                  borderRadius: '50%',
                                  background: `linear-gradient(${selectedSpool.filament.multi_color_direction === 'longitudinal' ? '0deg' : '90deg'}, ${selectedSpool.filament.multi_color_hexes.split(',').map(color => `#${color.trim()}`).join(', ')})`,
                                  border: '1px solid #666',
                                  flexShrink: 0
                                }} />
                              ) : null}
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {selectedSpool.filament?.name || selectedSpool.id}
                              </span>
                            </>
                          ) : (
                            <span>Select filament...</span>
                          )}
                        </div>
                        
                        {entry.dropdownOpen && (
                          <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            maxHeight: '300px',
                            overflowY: 'auto',
                            backgroundColor: '#1e1e1e',
                            border: '1px solid #444',
                            borderRadius: '6px',
                            marginTop: '4px',
                            zIndex: 1000,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                          }}>
                            {spools.map(spool => (
                              <div
                                key={spool.id}
                                onClick={() => selectSpool(entry.id, spool.id)}
                                style={{
                                  padding: '8px 12px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  backgroundColor: parseInt(entry.spoolId) === spool.id ? '#2d2d2d' : '#1e1e1e'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2d2d2d'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = parseInt(entry.spoolId) === spool.id ? '#2d2d2d' : '#1e1e1e'}
                              >
                                {spool.filament?.color_hex ? (
                                  <span style={{
                                    display: 'inline-block',
                                    width: '12px',
                                    height: '12px',
                                    borderRadius: '50%',
                                    backgroundColor: `#${spool.filament.color_hex}`,
                                    border: '1px solid #666',
                                    flexShrink: 0
                                  }} />
                                ) : spool.filament?.multi_color_hexes ? (
                                  <span style={{
                                    display: 'inline-block',
                                    width: '12px',
                                    height: '12px',
                                    borderRadius: '50%',
                                    background: `linear-gradient(${spool.filament.multi_color_direction === 'longitudinal' ? '0deg' : '90deg'}, ${spool.filament.multi_color_hexes.split(',').map(color => `#${color.trim()}`).join(', ')})`,
                                    border: '1px solid #666',
                                    flexShrink: 0
                                  }} />
                                ) : null}
                                <span>{spool.filament?.name || spool.id}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Weight Input */}
                      <div style={{ position: 'relative' }}>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          placeholder="0.0"
                          value={entry.weight}
                          onChange={e => updateFilamentEntry(entry.id, 'weight', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '10px 30px 10px 12px',
                            backgroundColor: '#1e1e1e',
                            border: '1px solid #444',
                            borderRadius: '6px',
                            color: '#e0e0e0',
                            fontSize: '14px',
                            textAlign: 'right',
                            boxSizing: 'border-box'
                          }}
                        />
                        <span style={{
                          position: 'absolute',
                          right: '12px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: '#666',
                          pointerEvents: 'none',
                          fontSize: '14px'
                        }}>g</span>
                      </div>

                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={() => removeFilamentEntry(entry.id)}
                        disabled={filamentEntries.length === 1}
                        title="Remove"
                        style={{
                          background: 'transparent',
                          color: filamentEntries.length === 1 ? '#444' : '#ff6b6b',
                          border: '1px solid #444',
                          borderRadius: '6px',
                          width: '40px',
                          height: '40px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: filamentEntries.length === 1 ? 'not-allowed' : 'pointer',
                          fontSize: '20px',
                          fontWeight: 'bold'
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}

                {/* Add Filament Button */}
                <button
                  type="button"
                  onClick={addFilamentEntry}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    background: 'transparent',
                    color: '#4a9eff',
                    border: '1px dashed #4a9eff',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    marginBottom: '16px'
                  }}
                >
                  + Add Another Filament
                </button>

                {/* Flow Compensation */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px',
                  backgroundColor: '#2a2a2a',
                  borderRadius: '6px'
                }}>
                  <input
                    type="checkbox"
                    id="flowComp"
                    checked={flowCompensation}
                    onChange={e => setFlowCompensation(e.target.checked)}
                    style={{
                      width: '18px',
                      height: '18px',
                      cursor: 'pointer',
                      accentColor: '#ff9800'
                    }}
                  />
                  <label htmlFor="flowComp" style={{
                    margin: 0,
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: '#b0b0b0'
                  }}>
                    Add flow compensation ({flowCompensationValue}g per filament)
                  </label>
                </div>
                
                {/* Total Weight Display */}
                {flowCompensation && filamentEntries.some(e => e.weight) && (
                  <p style={{
                    fontSize: '12px',
                    color: '#888',
                    marginTop: '8px',
                    marginLeft: '12px',
                    marginBottom: 0
                  }}>
                    Total with compensation: {
                      filamentEntries
                        .filter(e => e.weight)
                        .reduce((sum, e) => sum + parseFloat(e.weight) + flowCompensationValue, 0)
                        .toFixed(1)
                    }g
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: isSubmitting ? '#3a3a3a' : '#ff9800',
                  color: isSubmitting ? '#666' : '#000',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer'
                }}
              >
                {isSubmitting ? 'Recording...' : 'Record Usage'}
              </button>
            </form>
          </div>

          {message && (
            <div style={{
              marginBottom: '24px',
              padding: '12px',
              backgroundColor: message.includes('✗') ? '#3a1f1f' : '#1f3a1f',
              border: `1px solid ${message.includes('✗') ? '#ff6b6b' : '#4caf50'}`,
              borderRadius: '6px',
              whiteSpace: 'pre-line',
              fontFamily: 'monospace',
              fontSize: '13px',
              color: message.includes('✗') ? '#ff9999' : '#90ee90'
            }}>
              {message}
            </div>
          )}

          {/* View Toggle Buttons */}
          <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '24px',
            padding: '4px',
            backgroundColor: '#1e1e1e',
            borderRadius: '8px',
            border: '1px solid #444',
            width: 'fit-content'
          }}>
            <button
              onClick={() => setCurrentView('remaining')}
              style={{
                backgroundColor: currentView === 'remaining' ? '#ff9800' : 'transparent',
                color: currentView === 'remaining' ? '#000' : '#fff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Remaining Filament
            </button>
            <button
              onClick={() => setCurrentView('history')}
              style={{
                backgroundColor: currentView === 'history' ? '#ff9800' : 'transparent',
                color: currentView === 'history' ? '#000' : '#fff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Print History
            </button>
          </div>

          <div style={{ display: 'flex', gap: '20px' }}>
            {currentView === 'remaining' ? (
              <>
                {/* Filament Table - Now takes more space */}
                <div style={{ flex: '1', minWidth: '0' }}>
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
                        <tr
                          key={spool.id}
                          style={{
                            borderTop: '1px solid #444',
                            backgroundColor: spool.id === selectedSpoolForUsage?.id ? '#2d2d2d' : 'transparent',
                            cursor: 'pointer'
                          }}
                          onClick={() => handleSpoolClick(spool)}
                        >
                          <td style={{ padding: '8px' }}>
                            {spool.filament?.color_hex ? (
                              <span style={{
                                display: 'inline-block',
                                width: '16px',
                                height: '16px',
                                borderRadius: '50%',
                                backgroundColor: `#${spool.filament.color_hex}`,
                                border: '1px solid #666'
                              }} />
                            ) : spool.filament?.multi_color_hexes ? (
                              <span style={{
                                display: 'inline-block',
                                width: '16px',
                                height: '16px',
                                borderRadius: '50%',
                                background: `linear-gradient(${spool.filament.multi_color_direction === 'longitudinal' ? '0deg' : '90deg'}, ${spool.filament.multi_color_hexes.split(',').map(color => `#${color.trim()}`).join(', ')})`,
                                border: '1px solid #666'
                              }} />
                            ) : null}
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
              </>
            ) : (
              /* Print History View */
              <div style={{ flex: '1', minWidth: '0' }}>
                <h2>Print History</h2>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  backgroundColor: '#1e1e1e',
                  borderRadius: '8px',
                  overflow: 'hidden'
                }}>
                  <thead>
                    <tr style={{ backgroundColor: '#2d2d2d' }}>
                      <th style={{ textAlign: 'left', padding: '12px' }}>Date</th>
                      <th style={{ textAlign: 'left', padding: '8px' }}>Color</th>
                      <th style={{ textAlign: 'left', padding: '8px' }}>Filament</th>
                      <th style={{ textAlign: 'left', padding: '8px' }}>Vendor</th>
                      <th style={{ textAlign: 'right', padding: '8px' }}>Weight (g)</th>
                      <th style={{ textAlign: 'right', padding: '8px' }}>Cost</th>
                      <th style={{ textAlign: 'left', padding: '8px' }}>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedJobs.map(job => {
                      const isExpanded = expandedJobs.has(job.jobKey);
                      const isMultiFilament = job.entries.length > 1;
                      
                      return (
                        <React.Fragment key={job.jobKey}>
                          {/* Main job row */}
                          <tr
                            style={{
                              borderTop: '1px solid #444',
                              backgroundColor: isExpanded ? '#2a2a2a' : 'transparent',
                              cursor: isMultiFilament ? 'pointer' : 'default'
                            }}
                            onClick={() => isMultiFilament && toggleJobExpansion(job.jobKey)}
                          >
                            <td style={{ padding: '8px', fontSize: '14px' }}>
                              {new Date(job.date).toLocaleDateString("en-SG")}
                            </td>
                            <td style={{ padding: '8px' }}>
                              {isMultiFilament ? (
                                <div style={{ display: 'flex', gap: '2px' }}>
                                  {job.entries.slice(0, 5).map((entry, idx) => (
                                    <span key={idx}>
                                      {entry.spool?.color_hex ? (
                                        <span style={{
                                          display: 'inline-block',
                                          width: '16px',
                                          height: '16px',
                                          borderRadius: '50%',
                                          backgroundColor: `#${entry.spool.color_hex}`,
                                          border: '1px solid #666'
                                        }} />
                                      ) : entry.spool?.multi_color_hexes ? (
                                        <span style={{
                                          display: 'inline-block',
                                          width: '16px',
                                          height: '16px',
                                          borderRadius: '50%',
                                          background: `linear-gradient(${entry.spool.multi_color_direction === 'longitudinal' ? '0deg' : '90deg'}, ${entry.spool.multi_color_hexes.split(',').map(color => `#${color.trim()}`).join(', ')})`,
                                          border: '1px solid #666'
                                        }} />
                                      ) : null}
                                    </span>
                                  ))}
                                  {job.entries.length > 5 && (
                                    <span style={{ fontSize: '12px', color: '#999', marginLeft: '4px' }}>
                                      +{job.entries.length - 5}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                job.entries[0].spool?.color_hex ? (
                                  <span style={{
                                    display: 'inline-block',
                                    width: '16px',
                                    height: '16px',
                                    borderRadius: '50%',
                                    backgroundColor: `#${job.entries[0].spool.color_hex}`,
                                    border: '1px solid #666'
                                  }} />
                                ) : job.entries[0].spool?.multi_color_hexes ? (
                                  <span style={{
                                    display: 'inline-block',
                                    width: '16px',
                                    height: '16px',
                                    borderRadius: '50%',
                                    background: `linear-gradient(${job.entries[0].spool.multi_color_direction === 'longitudinal' ? '0deg' : '90deg'}, ${job.entries[0].spool.multi_color_hexes.split(',').map(color => `#${color.trim()}`).join(', ')})`,
                                    border: '1px solid #666'
                                  }} />
                                ) : null
                              )}
                            </td>
                            <td style={{ padding: '8px' }}>
                              {isMultiFilament ? (
                                <span style={{ color: '#999', fontSize: '14px' }}>
                                  {job.entries.length} filaments
                                </span>
                              ) : (
                                job.entries[0].spool?.name || 'Unknown'
                              )}
                            </td>
                            <td style={{ padding: '8px' }}>
                              {isMultiFilament ? (
                                <span style={{ color: '#999', fontSize: '14px' }}>Multiple</span>
                              ) : (
                                job.entries[0].spool?.vendor || 'Unknown'
                              )}
                            </td>
                            <td style={{ textAlign: 'right', padding: '8px', fontWeight: 'bold', color: '#ff9800' }}>
                              {job.totalWeight.toFixed(1)}
                              {isMultiFilament && (
                                <span style={{ 
                                  marginLeft: '8px', 
                                  fontSize: '12px', 
                                  color: '#4a9eff' 
                                }}>
                                  {isExpanded ? '▼' : '▶'}
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right', padding: '8px', color: '#4caf50' }}>
                              ${job.totalCost.toFixed(2)}
                            </td>
                            <td style={{ padding: '8px', fontSize: '14px', fontStyle: 'italic', color: '#ccc' }}>
                              {job.note || '-'}
                            </td>
                          </tr>
                          
                          {/* Expanded detail rows */}
                          {isExpanded && job.entries.map((entry, idx) => (
                            <tr
                              key={`${job.jobKey}-${idx}`}
                              style={{
                                borderTop: '1px solid #333',
                                backgroundColor: '#252525'
                              }}
                            >
                              <td style={{ padding: '8px 8px 8px 24px', fontSize: '13px', color: '#999' }}>
                                └─
                              </td>
                              <td style={{ padding: '8px' }}>
                                {entry.spool?.color_hex ? (
                                  <span style={{
                                    display: 'inline-block',
                                    width: '14px',
                                    height: '14px',
                                    borderRadius: '50%',
                                    backgroundColor: `#${entry.spool.color_hex}`,
                                    border: '1px solid #666'
                                  }} />
                                ) : entry.spool?.multi_color_hexes ? (
                                  <span style={{
                                    display: 'inline-block',
                                    width: '14px',
                                    height: '14px',
                                    borderRadius: '50%',
                                    background: `linear-gradient(${entry.spool.multi_color_direction === 'longitudinal' ? '0deg' : '90deg'}, ${entry.spool.multi_color_hexes.split(',').map(color => `#${color.trim()}`).join(', ')})`,
                                    border: '1px solid #666'
                                  }} />
                                ) : null}
                              </td>
                              <td style={{ padding: '8px', fontSize: '13px' }}>
                                {entry.spool?.name || 'Unknown'}
                              </td>
                              <td style={{ padding: '8px', fontSize: '13px' }}>
                                {entry.spool?.vendor || 'Unknown'}
                              </td>
                              <td style={{ textAlign: 'right', padding: '8px', fontSize: '13px', color: '#ff9800' }}>
                                {entry.weight}
                              </td>
                              <td style={{ textAlign: 'right', padding: '8px', fontSize: '13px', color: '#4caf50' }}>
                                ${entry.cost || 'N/A'}
                              </td>
                              <td style={{ padding: '8px' }}></td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
                {groupedJobs.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
                    No print history found
                  </div>
                )}
              </div>

            )}
            {/* Usage Details Panel - Only show on remaining view */}
            {currentView === 'remaining' && selectedSpoolForUsage && (
              <div style={{
                flex: '0 0 400px',
                backgroundColor: '#1e1e1e',
                border: '1px solid #444',
                borderRadius: '8px',
                padding: '16px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: '0', color: '#ff9800' }}>Usage History</h3>
                  <button
                    onClick={() => setSelectedSpoolForUsage(null)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#999',
                      cursor: 'pointer',
                      fontSize: '18px'
                    }}
                  >
                    ×
                  </button>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    {selectedSpoolForUsage.filament?.color_hex ? (
                      <span style={{
                        display: 'inline-block',
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        backgroundColor: `#${selectedSpoolForUsage.filament.color_hex}`,
                        border: '1px solid #666'
                      }} />
                    ) : selectedSpoolForUsage.filament?.multi_color_hexes ? (
                      <span style={{
                        display: 'inline-block',
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        background: `linear-gradient(${selectedSpoolForUsage.filament.multi_color_direction === 'longitudinal' ? '0deg' : '90deg'}, ${selectedSpoolForUsage.filament.multi_color_hexes.split(',').map(color => `#${color.trim()}`).join(', ')})`,
                        border: '1px solid #666'
                      }} />
                    ) : null}
                    <strong>{selectedSpoolForUsage.filament?.name || 'Unknown'}</strong>
                  </div>
                  <div style={{ fontSize: '14px', color: '#999' }}>
                    {selectedSpoolForUsage.filament?.vendor?.name || 'Unknown Vendor'}
                  </div>
                  <div style={{ fontSize: '14px', color: '#999' }}>
                    Remaining: {selectedSpoolForUsage.remaining_weight?.toFixed(1) || 'N/A'}g
                  </div>
                </div>

                {/* Usage History List */}
                <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                  {usageHistory[selectedSpoolForUsage.id] ? (
                    usageHistory[selectedSpoolForUsage.id].length > 0 ? (
                      usageHistory[selectedSpoolForUsage.id].map((usage, index) => (
                        <div key={index} style={{
                          padding: '8px',
                          marginBottom: '8px',
                          backgroundColor: '#2d2d2d',
                          borderRadius: '4px',
                          border: '1px solid #444'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '14px', color: '#999' }}>
                              {new Date(usage.date).toLocaleDateString("en-SG")}
                            </span>
                            <span style={{ fontWeight: 'bold', color: '#ff9800' }}>
                              {usage.weight}g
                            </span>
                          </div>
                          {usage.note && (
                            <div style={{ fontSize: '12px', color: '#ccc', marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontStyle: 'italic' }}>{usage.note}
                              </span>
                              <span style={{ fontStyle: 'italic' }}>Cost:  ${(() => {
                                const spoolPrice = selectedSpoolForUsage.price ?? selectedSpoolForUsage.filament?.price;
                                return (spoolPrice && selectedSpoolForUsage.initial_weight) ?
                                  ((usage.weight / selectedSpoolForUsage.initial_weight) * spoolPrice).toFixed(2) :
                                  'N/A';
                              })()}
                              </span>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                        No usage history found
                      </div>
                    )
                  ) : (
                    <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                      Loading usage history...
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Collapsible Settings Panel */}
      <div style={{
        width: rightPanelWidth,
        backgroundColor: '#1a1a1a',
        borderLeft: '1px solid #444',
        padding: rightPanelCollapsed ? '10px' : '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        transition: 'width 0.3s ease'
      }}>
        {/* Collapse Toggle */}
        <button
          onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}
          style={{
            background: 'none',
            border: '1px solid #444',
            color: '#fff',
            padding: '8px',
            borderRadius: '4px',
            cursor: 'pointer',
            alignSelf: 'flex-start'
          }}
        >
          {rightPanelCollapsed ? '→' : '←'}
        </button>

        {!rightPanelCollapsed && (
          <>
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

            {/* Configuration Form - Now includes both URL and Flow Compensation */}
            <div style={{
              padding: '16px',
              backgroundColor: '#232323',
              borderRadius: '8px',
              border: '1px solid #444'
            }}>
              <h3 style={{ color: '#ff9800', marginBottom: '12px', fontSize: '16px' }}>Configuration</h3>
              <form onSubmit={handleConfig} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <label style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ marginBottom: '4px' }}>Spoolman URL:</span>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'stretch' }}>
                    <input
                      type="text"
                      value={spoolmanUrl}
                      onChange={e => setSpoolmanUrl(e.target.value)}
                      placeholder="e.g. http://192.168.0.15:7912"
                      style={{
                        flex: 1,
                        backgroundColor: '#1e1e1e',
                        color: '#fff',
                        border: '1px solid #444',
                        borderRadius: '4px',
                        padding: '8px',
                        boxSizing: 'border-box'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => window.open(spoolmanUrl, '_blank')}
                      disabled={!spoolmanUrl}
                      style={{
                        backgroundColor: spoolmanUrl ? '#ff9800' : '#666',
                        border: '1px solid #444',
                        color: '#fff',
                        padding: '4px',
                        borderRadius: '4px',
                        cursor: spoolmanUrl ? 'pointer' : 'not-allowed',
                        fontSize: '12px',
                        whiteSpace: 'nowrap',
                        boxSizing: 'border-box'
                      }}
                    >
                      Open
                    </button>
                  </div>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ marginBottom: '4px' }}>Flow Compensation (grams):</span>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    step="0.1"
                    value={flowCompensationValue}
                    onChange={e => setFlowCompensationValue(parseFloat(e.target.value) || 0)}
                    style={{
                      width: '100%',
                      backgroundColor: '#1e1e1e',
                      color: '#fff',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      padding: '8px',
                      boxSizing: 'border-box'
                    }}
                  />
                  <small style={{ color: '#999', fontSize: '12px', marginTop: '4px' }}>
                    Fixed amount in grams added to actual usage to compensate for flow variations
                  </small>
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
                  Save Configuration
                </button>
              </form>
            </div>
          </>
        )}
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