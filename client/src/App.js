import React, { useState, useEffect } from 'react';

const App = () => {
  const [view, setView] = useState('login'); // login, game
  const [tab, setTab] = useState('mine'); // mine, shop, inventory
  const [user, setUser] = useState(null);
  const [inventory, setInventory] = useState([]);
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const API_URL = "https://cgm-j82x.onrender.com"; // REPLACE THIS

  const styles = {
    container: { display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh', backgroundColor: '#0f172a', color: 'white', fontFamily: 'sans-serif', padding: '20px' },
    card: { backgroundColor: '#1e293b', padding: '2rem', borderRadius: '1rem', width: '100%', maxWidth: '400px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' },
    btn: { backgroundColor: '#4f46e5', color: 'white', padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer', width: '100%', marginTop: '10px', fontWeight: 'bold' },
    btnSecondary: { backgroundColor: '#334155', color: 'white', padding: '8px', borderRadius: '6px', border: 'none', cursor: 'pointer', width: '100%', marginTop: '5px' },
    input: { width: '100%', padding: '10px', margin: '5px 0', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white' },
    header: { display: 'flex', justifyContent: 'space-between', backgroundColor: '#0f172a', padding: '10px', borderRadius: '10px', marginBottom: '20px' },
    mineBtn: { backgroundColor: '#f59e0b', color: 'black', padding: '30px', borderRadius: '50%', fontSize: '24px', fontWeight: 'bold', border: '5px solid #fbbf24', cursor: 'pointer', boxShadow: '0 0 20px rgba(245, 158, 11, 0.5)' },
    tabBtn: (active) => ({ backgroundColor: active ? '#4f46e5' : '#334155', padding: '10px', border: 'none', color: 'white', cursor: 'pointer', flex: 1, borderRadius: '5px', margin: '0 2px' })
  };

  const fetchState = async (userId) => {
    try {
      const res = await fetch(`${API_URL}/api/state/${userId}`);
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
        setInventory(data.inventory);
      }
    } catch (e) { console.error("Connection error"); }
  };

  useEffect(() => {
    if (user) {
      fetchState(user.id); // Initial fetch
      const interval = setInterval(() => fetchState(user.id), 10000); // Sync every 10s
      return () => clearInterval(interval);
    }
  }, [user]);

  const handleAuth = async (endpoint) => {
    const res = await fetch(`${API_URL}/api/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.id) { setUser(data); setView('game'); } 
    else { alert(data.error); }
  };

  const handleMine = async () => {
    const res = await fetch(`${API_URL}/api/mine`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id })
    });
    const data = await res.json();
    if (data.credits) setUser({ ...user, credits: data.credits, energy: data.energy });
    else alert(data.error);
  };

  const handleBuyPack = async () => {
    const res = await fetch(`${API_URL}/api/buy-pack`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id })
    });
    const data = await res.json();
    if (data.success) {
      alert("You got a new card! Check Inventory.");
      fetchState(user.id); // Refresh data
    } else {
      alert(data.error);
    }
  };

  const handleEquip = async (cardId) => {
    await fetch(`${API_URL}/api/equip`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, cardId })
    });
    fetchState(user.id);
  };

  if (view === 'login') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={{ textAlign: 'center', fontSize: '32px', marginBottom: '20px' }}>⛏️ EtherGrind</h1>
          <input style={styles.input} placeholder="Username" onChange={e => setUsername(e.target.value)} />
          <input style={styles.input} type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} />
          <button style={styles.btn} onClick={() => handleAuth('login')}>Login</button>
          <button style={styles.btnSecondary} onClick={() => handleAuth('register')}>Register (Get Free Starter)</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        
        {/* Header Stats */}
        <div style={styles.header}>
          <div>
            <small>CREDITS</small><br/>
            <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#4ade80' }}>{user?.credits}</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <small>ENERGY</small><br/>
            <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#fb923c' }}>{user?.energy} / {user?.max_energy}</span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', marginBottom: '20px' }}>
          <button style={styles.tabBtn(tab === 'mine')} onClick={() => setTab('mine')}>MINE</button>
          <button style={styles.tabBtn(tab === 'shop')} onClick={() => setTab('shop')}>SHOP</button>
          <button style={styles.tabBtn(tab === 'inventory')} onClick={() => setTab('inventory')}>INVENTORY</button>
        </div>

        {/* Content */}
        <div style={styles.card}>
          
          {tab === 'mine' && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#94a3b8' }}>Click to mine using active cards</p>
              <button style={styles.mineBtn} onClick={handleMine}>
                MINE
              </button>
              <p style={{ marginTop: '20px', color: '#64748b' }}>Active Tools: {inventory.filter(c => c.equipped).length}</p>
            </div>
          )}

          {tab === 'shop' && (
            <div style={{ textAlign: 'center' }}>
              <h3>Card Pack</h3>
              <div style={{ border: '1px dashed #4f46e5', padding: '20px', borderRadius: '10px', marginBottom: '15px' }}>
                <span style={{ fontSize: '40px' }}>📦</span>
                <p>Mystery Pack</p>
                <p style={{ color: '#4ade80' }}>Cost: 50 Credits</p>
              </div>
              <button style={styles.btn} onClick={handleBuyPack}>Buy Pack</button>
            </div>
          )}

          {tab === 'inventory' && (
            <div>
              <h3 style={{ marginBottom: '15px' }}>Your Cards</h3>
              {inventory.map(card => (
                <div key={card.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a', padding: '10px', borderRadius: '8px', marginBottom: '8px', border: card.equipped ? '1px solid #f59e0b' : 'none' }}>
                  <div>
                    <span style={{ fontWeight: 'bold' }}>{card.name}</span><br/>
                    <small style={{ color: '#94a3b8' }}>PWR: {card.mine_power} | DUR: {card.current_durability}</small>
                  </div>
                  <button 
                    style={{ ...styles.btnSecondary, width: 'auto', background: card.equipped ? '#f59e0b' : '#334155', color: card.equipped ? 'black' : 'white' }}
                    onClick={() => handleEquip(card.id)}
                  >
                    {card.equipped ? "ACTIVE" : "EQUIP"}
                  </button>
                </div>
              ))}
              {inventory.length === 0 && <p style={{ color: '#64748b', textAlign: 'center' }}>No cards yet.</p>}
            </div>
          )}
          
        </div>

        <button style={{ ...styles.btnSecondary, marginTop: '20px', backgroundColor: '#1e293b' }} onClick={() => { setUser(null); setView('login'); }}>Logout</button>
      </div>
    </div>
  );
};

export default App;