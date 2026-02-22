import React, { useState, useEffect } from 'react';

// --- STYLES (CSS-in-JS for easy copy/paste) ---
const theme = {
  bg: '#0f172a', card: '#1e293b', accent: '#6366f1', 
  success: '#10b981', warning: '#f59e0b', danger: '#ef4444',
  text: '#f1f5f9', muted: '#94a3b8'
};

const styles = {
  container: { display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh', background: theme.bg, color: theme.text, fontFamily: 'system-ui, sans-serif', padding: '20px' },
  panel: { background: theme.card, borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '420px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', marginBottom: '20px' },
  btnMain: { background: theme.accent, border: 'none', color: 'white', padding: '12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', width: '100%', transition: '0.2s', fontSize: '16px' },
  btnMine: { background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: '4px solid #fbbf24', color: '#000', width: '150px', height: '150px', borderRadius: '50%', fontSize: '24px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 0 20px rgba(245, 158, 11, 0.4)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.1s' },
  btnSmall: { background: '#334155', border: 'none', color: 'white', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
  input: { width: '100%', padding: '12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: 'white', marginBottom: '12px' },
  headerStat: { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, background: '#0f172a', padding: '10px', borderRadius: '8px' },
  cardItem: { display: 'flex', alignItems: 'center', background: '#0f172a', padding: '12px', borderRadius: '8px', marginBottom: '8px', border: '1px solid transparent', transition: '0.2s' },
  toast: { position: 'fixed', top: '20px', right: '20px', padding: '12px 20px', borderRadius: '8px', color: 'white', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 9999, animation: 'slideIn 0.3s ease-out' }
};

// --- MAIN COMPONENT ---
const App = () => {
  const [view, setView] = useState('login');
  const [tab, setTab] = useState('mine');
  const [user, setUser] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [toast, setToast] = useState(null); // { message, type }
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  // REPLACE THIS WITH YOUR RENDER URL
  const API_URL = "https://cgm-j82x.onrender.com"; 

  // Helper for Toast Notifications
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Data Fetching
  const fetchState = async (userId) => {
    try {
      const res = await fetch(`${API_URL}/api/state/${userId}`);
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
        setInventory(data.inventory);
      }
    } catch (e) { showToast("Connection error", "danger"); }
  };

  useEffect(() => {
    if (user) {
      fetchState(user.id);
      const interval = setInterval(() => fetchState(user.id), 5000);
      return () => clearInterval(interval);
    }
  }, [user]);

  // Auth Handlers
  const handleAuth = async (endpoint) => {
    try {
      const res = await fetch(`${API_URL}/api/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (data.id) { setUser(data); setView('game'); fetchState(data.id); }
      else { showToast(data.error || "Error", "danger"); }
    } catch (e) { showToast("Server unreachable", "danger"); }
  };

  // Game Actions
  const handleMine = async () => {
    const res = await fetch(`${API_URL}/api/mine`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id })
    });
    const data = await res.json();
    if (data.credits) {
      setUser({ ...user, credits: data.credits, energy: data.energy });
      showToast(`Mined +${data.message.match(/\d+/)[0]} Credits!`, "success");
    } else {
      showToast(data.error, "warning");
    }
  };

  const handleBuyPack = async () => {
    showToast("Opening pack...", "success");
    const res = await fetch(`${API_URL}/api/buy-pack`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id })
    });
    const data = await res.json();
    if (data.success) {
      fetchState(user.id);
      showToast("New card acquired!", "success");
    } else {
      showToast(data.error, "danger");
    }
  };

  const handleEquip = async (cardId) => {
    const res = await fetch(`${API_URL}/api/equip`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, cardId })
    });
    const data = await res.json();
    if (data.success) fetchState(user.id);
  };

  // --- RENDER LOGIN ---
  if (view === 'login') {
    return (
      <div style={styles.container}>
        {toast && <div style={{...styles.toast, background: toast.type === 'success' ? theme.success : theme.danger}}>{toast.message}</div>}
        
        <div style={{...styles.panel, textAlign: 'center'}}>
          <h1 style={{ fontSize: '32px', marginBottom: '10px' }}>⛏️ EtherGrind</h1>
          <p style={{ color: theme.muted, marginBottom: '30px' }}>Mine, Collect, Earn</p>
          
          <input style={styles.input} placeholder="Username" onChange={e => setUsername(e.target.value)} />
          <input style={styles.input} type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} />
          
          <button style={styles.btnMain} onClick={() => handleAuth('login')}>Login</button>
          <button style={{...styles.btnMain, background: 'transparent', border: '1px solid #4f46e5', marginTop: '10px'}} onClick={() => handleAuth('register')}>
            Register New Account
          </button>
        </div>
      </div>
    );
  }

  // --- RENDER GAME ---
  const activeCards = inventory.filter(c => c.equipped);
  const totalPower = activeCards.reduce((sum, c) => sum + c.mine_power, 0);

  return (
    <div style={styles.container}>
      {/* Notification Toast */}
      {toast && <div style={{...styles.toast, background: toast.type === 'success' ? theme.success : (toast.type === 'warning' ? theme.warning : theme.danger)}}>{toast.message}</div>}

      {/* TOP STATS BAR */}
      <div style={{...styles.panel, display: 'flex', gap: '10px', padding: '15px'}}>
        <div style={styles.headerStat}>
          <small style={{color: theme.muted}}>CREDITS</small>
          <span style={{fontSize: '20px', fontWeight: 'bold', color: theme.success}}>{user?.credits}</span>
        </div>
        <div style={styles.headerStat}>
          <small style={{color: theme.muted}}>ENERGY</small>
          <span style={{fontSize: '20px', fontWeight: 'bold', color: theme.warning}}>{user?.energy}/{user?.max_energy}</span>
        </div>
        <div style={styles.headerStat}>
          <small style={{color: theme.muted}}>POWER</small>
          <span style={{fontSize: '20px', fontWeight: 'bold', color: theme.accent}}>{totalPower}</span>
        </div>
      </div>

      {/* TAB BUTTONS */}
      <div style={{ display: 'flex', gap: '5px', width: '100%', maxWidth: '420px', marginBottom: '15px' }}>
        {[ ['mine', '⛏️ Mine'], ['shop', '🛒 Shop'], ['inventory', '🎒 Cards'] ].map(([key, label]) => (
          <button 
            key={key}
            onClick={() => setTab(key)}
            style={{ 
              ...styles.btnSmall, 
              flex: 1, padding: '12px', 
              background: tab === key ? theme.accent : '#334155',
              fontWeight: tab === key ? 'bold' : 'normal'
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* CONTENT AREA */}
      <div style={styles.panel}>
        
        {/* MINE TAB */}
        {tab === 'mine' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            
            {inventory.length === 0 ? (
              <div style={{textAlign: 'center'}}>
                <h3>No Cards Found</h3>
                <p style={{color: theme.muted, fontSize: '14px'}}>You need a tool to mine.</p>
                <button style={{...styles.btnMain, background: theme.success, marginTop: '15px'}} onClick={handleBuyPack}>
                  Buy Starter Pack (50 Credits)
                </button>
                <p style={{color: theme.muted, fontSize: '12px', marginTop: '10px'}}>Or ask admin to run the SQL fix script.</p>
              </div>
            ) : (
              <>
                <p style={{ color: theme.muted, marginBottom: '20px' }}>Active Tools: {activeCards.length}</p>
                
                <button 
                  style={styles.btnMine} 
                  onClick={handleMine}
                  disabled={user?.energy < 10}
                >
                  <span style={{fontSize: '30px'}}>⛏️</span>
                  MINE
                </button>

                {user?.energy < 10 && <p style={{color: theme.danger, fontSize: '12px', marginTop: '10px'}}>Not enough energy!</p>}
                
                <div style={{ marginTop: '20px', width: '100%', borderTop: '1px solid #334155', paddingTop: '15px' }}>
                  <p style={{fontSize: '12px', color: theme.muted}}>ACTIVE SLOTS</p>
                  {activeCards.map(c => (
                    <div key={c.id} style={{display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginTop: '5px'}}>
                      <span>{c.name}</span>
                      <span style={{color: theme.success}}>+{c.mine_power}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* SHOP TAB */}
        {tab === 'shop' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ border: '1px dashed #4f46e5', padding: '30px', borderRadius: '12px', marginBottom: '20px' }}>
              <div style={{fontSize: '40px', marginBottom: '10px'}}>📦</div>
              <h3>Basic Pack</h3>
              <p style={{color: theme.muted, fontSize: '14px'}}>Contains 1 Card (Common → Mythic)</p>
              <h2 style={{color: theme.success, marginTop: '10px'}}>50 Credits</h2>
            </div>
            <button style={styles.btnMain} onClick={handleBuyPack}>Buy Pack</button>
          </div>
        )}

        {/* INVENTORY TAB */}
        {tab === 'inventory' && (
          <div>
            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '15px'}}>
              <h3>Your Cards ({inventory.length})</h3>
            </div>
            {inventory.length === 0 && <p style={{textAlign: 'center', color: theme.muted}}>Inventory empty.</p>}
            
            {inventory.map(card => (
              <div 
                key={card.id} 
                style={{ 
                  ...styles.cardItem, 
                  border: card.equipped ? `1px solid ${theme.warning}` : '1px solid #1e293b',
                  opacity: card.current_durability > 0 ? 1 : 0.5
                }}
              >
                <div style={{flex: 1}}>
                  <div style={{fontWeight: 'bold', color: card.equipped ? theme.warning : 'white'}}>{card.name}</div>
                  <div style={{fontSize: '12px', color: theme.muted, marginTop: '4px'}}>
                    Rarity: {card.rarity} | PWR: {card.mine_power} | DUR: {card.current_durability}
                  </div>
                </div>
                
                <button 
                  style={{ 
                    ...styles.btnSmall, 
                    background: card.equipped ? theme.warning : '#334155', 
                    color: card.equipped ? '#000' : 'white',
                    width: '80px'
                  }}
                  onClick={() => handleEquip(card.id)}
                  disabled={card.current_durability <= 0}
                >
                  {card.equipped ? "ACTIVE" : "EQUIP"}
                </button>
              </div>
            ))}
          </div>
        )}

      </div>

      <button style={{...styles.btnSmall, background: 'transparent', marginTop: '20px', color: theme.muted}} onClick={() => { setUser(null); setView('login'); }}>
        Logout
      </button>
    </div>
  );
};

export default App;