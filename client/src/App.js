import React, { useState, useEffect } from 'react';

const App = () => {
  const [view, setView] = useState('login'); // login, register, game
  const [user, setUser] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [logs, setLogs] = useState([]);
  
  // Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const API_URL = "https://cgm-j82x.onrender.com";
  // Basic Styling (Simulating Tailwind with inline styles for simplicity)
  const styles = {
    container: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#111827', color: 'white', fontFamily: 'sans-serif' },
    card: { backgroundColor: '#1F2937', padding: '2rem', borderRadius: '1rem', boxShadow: '0 4px 6px rgba(0,0,0,0.3)', width: '300px', textAlign: 'center' },
    button: { backgroundColor: '#4F46E5', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer', marginTop: '1rem', width: '100%' },
    input: { width: '100%', padding: '0.5rem', marginBottom: '1rem', borderRadius: '0.25rem', border: '1px solid #374151', backgroundColor: '#374151', color: 'white' },
    stat: { fontSize: '1.5rem', fontWeight: 'bold', color: '#10B981' },
    mineBtn: { backgroundColor: '#F59E0B', padding: '2rem', borderRadius: '50%', fontSize: '1.5rem', fontWeight: 'bold', border: 'none', cursor: 'pointer', marginTop: '1rem' }
  };

  const fetchState = async (userId) => {
    try {
      const res = await fetch(`${API_URL}/api/state/${userId}`);
      const data = await res.json();
      setUser(data.user);
      setInventory(data.inventory);
    } catch (e) {
      console.error("Failed to fetch state");
    }
  };

  useEffect(() => {
    if (user) {
      const interval = setInterval(() => fetchState(user.id), 5000); // Sync every 5s
      return () => clearInterval(interval);
    }
  }, [user]);

  const handleRegister = async () => {
    const res = await fetch(`${API_URL}/api/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.id) { setUser(data); setView('game'); } 
    else { alert("Error: " + data.error); }
  };

  const handleLogin = async () => {
    const res = await fetch(`${API_URL}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.id) { setUser(data); setView('game'); } 
    else { alert("Error: " + data.error); }
  };

  const handleMine = async () => {
    const res = await fetch(`${API_URL}/api/mine`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id })
    });
    const data = await res.json();
    if (data.credits) {
      setUser({ ...user, credits: data.credits, energy: data.energy });
      alert(data.message);
    } else {
      alert(data.error);
    }
  };

  if (view === 'login' || view === 'register') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>EtherGrind</h1>
          <input style={styles.input} placeholder="Username" onChange={e => setUsername(e.target.value)} />
          <input style={styles.input} type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} />
          {view === 'login' ? (
            <>
              <button style={styles.button} onClick={handleLogin}>Login</button>
              <p style={{ cursor: 'pointer', color: '#60A5FA' }} onClick={() => setView('register')}>Need an account? Register</p>
            </>
          ) : (
            <>
              <button style={styles.button} onClick={handleRegister}>Register</button>
              <p style={{ cursor: 'pointer', color: '#60A5FA' }} onClick={() => setView('login')}>Have an account? Login</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1>Mining Dashboard</h1>
        <p>Welcome, {user?.username}</p>
        
        <div style={{ display: 'flex', justifyContent: 'space-around', margin: '20px 0' }}>
          <div>
            <p>Credits</p>
            <p style={styles.stat}>{user?.credits}</p>
          </div>
          <div>
            <p>Energy</p>
            <p style={{...styles.stat, color: '#F59E0B'}}>{user?.energy} / {user?.max_energy}</p>
          </div>
        </div>

        <button style={styles.mineBtn} onClick={handleMine}>
          ⛏️ MINE
        </button>

        <div style={{ marginTop: '2rem', textAlign: 'left' }}>
          <h3>Inventory ({inventory.length})</h3>
          {inventory.map(card => (
            <div key={card.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #374151', padding: '5px 0' }}>
              <span>{card.name} ({card.rarity})</span>
              <span>PWR: {card.mine_power}</span>
            </div>
          ))}
        </div>
        
        <button style={{...styles.button, backgroundColor: '#6B7280', marginTop: '2rem'}} 
          onClick={() => { setUser(null); setView('login'); }}>
          Logout
        </button>
      </div>
    </div>
  );
};

export default App;