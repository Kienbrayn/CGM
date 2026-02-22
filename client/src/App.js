import React, { useState, useEffect, useCallback, useMemo } from 'react';

// ===============================================
// 1. THEME & CONFIG (Professional Colors)
// ===============================================

const THEME = {
  colors: {
    bg: '#0a0a12', // Darker, richer background
    card: '#151520',
    cardLight: '#1f1f2e',
    accent: '#5eead4', // Teal/Cyan accent
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    text: '#f8fafc',
    muted: '#64748b',
    rarity: {
      Common: '#6b7280', // Gray
      Rare: '#3b82f6',   // Blue
      Mythic: '#d946ef', // Pink/Purple
    }
  },
  shadows: {
    panel: '0 20px 40px rgba(0,0,0,0.6)',
    glow: '0 0 20px rgba(94, 234, 212, 0.3)',
  }
};

const CONFIG = {
  API_URL: "https://cgm-j82x.onrender.com",
  TICK_RATE_MS: 5000, 
  ENERGY_COST: 10,
  PACK_COST: 50,
};

// ===============================================
// 2. CSS ANIMATIONS (Keyframes)
// ===============================================

const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Inter:wght@400;600&display=swap');
    
    body {
      background-color: ${THEME.colors.bg};
      overflow-x: hidden;
    }
    
    @keyframes slideIn {
      from { transform: translateY(-20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(94, 234, 212, 0.4); }
      70% { box-shadow: 0 0 0 20px rgba(94, 234, 212, 0); }
      100% { box-shadow: 0 0 0 0 rgba(94, 234, 212, 0); }
    }
    
    @keyframes shake {
      0% { transform: translate(1px, 1px) rotate(0deg); }
      10% { transform: translate(-1px, -2px) rotate(-1deg); }
      20% { transform: translate(-3px, 0px) rotate(1deg); }
      30% { transform: translate(3px, 2px) rotate(0deg); }
      40% { transform: translate(1px, -1px) rotate(1deg); }
      50% { transform: translate(-1px, 2px) rotate(-1deg); }
      60% { transform: translate(-3px, 1px) rotate(0deg); }
      70% { transform: translate(3px, 1px) rotate(-1deg); }
      80% { transform: translate(-1px, -1px) rotate(1deg); }
      90% { transform: translate(1px, 2px) rotate(0deg); }
      100% { transform: translate(1px, -2px) rotate(-1deg); }
    }

    @keyframes cardReveal {
      0% { transform: rotateY(180deg) scale(0.5); opacity: 0; }
      100% { transform: rotateY(0deg) scale(1); opacity: 1; }
    }

    .shake-anim {
      animation: shake 0.5s ease-in-out;
    }
    
    .card-reveal {
      animation: cardReveal 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
  `}</style>
);

// ===============================================
// 3. COMPONENTS
// ===============================================

// --- UI Helpers ---
const Flex = ({ children, dir = 'row', justify = 'flex-start', align = 'center', style = {} }) => (
  <div style={{ display: 'flex', flexDirection: dir, justifyContent: justify, alignItems: align, ...style }}>
    {children}
  </div>
);

const Spacer = ({ h = 10 }) => <div style={{ height: h }} />;

// --- Advanced Button ---
const Btn = ({ children, onClick, variant = 'primary', disabled, wide, size = 'md' }) => {
  const base = {
    padding: size === 'lg' ? '16px 24px' : '10px 16px',
    borderRadius: '8px',
    border: 'none',
    fontWeight: 'bold',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    width: wide ? '100%' : 'auto',
    transition: 'all 0.2s',
    position: 'relative',
    overflow: 'hidden',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    fontSize: size === 'lg' ? '16px' : '13px',
  };
  
  const vars = {
    primary: { background: THEME.colors.accent, color: THEME.colors.bg },
    secondary: { background: THEME.colors.cardLight, color: THEME.colors.text },
    danger: { background: THEME.colors.danger, color: '#fff' },
    ghost: { background: 'transparent', border: `1px solid ${THEME.colors.muted}`, color: THEME.colors.muted }
  };

  const handleHover = (e) => {
    if(!disabled) {
      e.currentTarget.style.transform = 'translateY(-2px)';
      e.currentTarget.style.boxShadow = THEME.shadows.glow;
    }
  };
  
  const handleOut = (e) => {
    e.currentTarget.style.transform = 'translateY(0)';
    e.currentTarget.style.boxShadow = 'none';
  };

  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      style={{ ...base, ...vars[variant] }}
      onMouseOver={handleHover}
      onMouseOut={handleOut}
    >
      {children}
    </button>
  );
};

// --- Card Display Component (For Inventory) ---
const GameCard = ({ card, onEquip }) => {
  const rarityColor = THEME.colors.rarity[card.rarity] || '#fff';
  const isBroken = card.current_durability <= 0;
  
  return (
    <div style={{
      background: 'linear-gradient(145deg, #1e1e2e, #111118)',
      borderRadius: '12px',
      padding: '15px',
      marginBottom: '12px',
      borderLeft: `4px solid ${rarityColor}`,
      opacity: isBroken ? 0.6 : 1,
      boxShadow: card.equipped ? `0 0 15px ${rarityColor}40` : 'none',
      transition: 'transform 0.2s',
      position: 'relative'
    }}>
      {card.equipped && (
        <div style={{ position: 'absolute', top: 10, right: 10, color: THEME.colors.accent, fontSize: '12px', fontWeight: 'bold' }}>
          EQUIPPED ⚡
        </div>
      )}
      
      <Flex justify="space-between" align="flex-start">
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '5px', color: card.equipped ? THEME.colors.accent : '#fff' }}>
            {card.name}
          </div>
          <Flex style={{ gap: '15px' }}>
            <span style={{ color: THEME.colors.muted, fontSize: '13px' }}>
              Rarity: <span style={{ color: rarityColor, fontWeight: 'bold' }}>{card.rarity}</span>
            </span>
            <span style={{ color: THEME.colors.text, fontSize: '13px' }}>
              PWR: <b>{card.mine_power}</b>
            </span>
          </Flex>
          
          {/* Durability Bar */}
          <Spacer h={8}/>
          <div style={{ background: '#000', height: '6px', borderRadius: '3px', width: '100%', overflow: 'hidden' }}>
            <div style={{ 
              width: `${(card.current_durability / 50) * 100}%`, 
              background: isBroken ? THEME.colors.danger : THEME.colors.success,
              height: '100%',
              transition: 'width 0.3s'
            }}/>
          </div>
          <div style={{ fontSize: '11px', color: THEME.colors.muted, marginTop: '2px' }}>
            Durability: {card.current_durability} / 50
          </div>
        </div>
        
        <div style={{ marginLeft: '15px' }}>
          <Btn 
            variant={card.equipped ? 'danger' : 'secondary'} 
            onClick={() => onEquip(card.id)}
            disabled={isBroken && !card.equipped}
          >
            {isBroken && !card.equipped ? 'BROKEN' : (card.equipped ? 'UNEQUIP' : 'EQUIP')}
          </Btn>
        </div>
      </Flex>
    </div>
  );
};

// ===============================================
// 4. MAIN APP
// ===============================================

export default function App() {
  const [view, setView] = useState('login'); // login, game
  const [user, setUser] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('mine'); // mine, shop, inventory
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({ u: '', p: '' });
  const [miningAnim, setMiningAnim] = useState(false);
  const [revealCard, setRevealCard] = useState(null); // For shop animation

  // --- Helpers ---
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const api = async (endpoint, method = 'GET', body = null) => {
    try {
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(`${CONFIG.API_URL}/api/${endpoint}`, opts);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      return data;
    } catch (err) {
      showToast(err.message, 'danger');
      throw err;
    }
  };

  // --- Actions ---
  const login = async (type) => {
    setLoading(true);
    try {
      const data = await api(type, 'POST', { username: form.u, password: form.p });
      setUser(data.user || data);
      setInventory(data.inventory || []);
      setView('game');
    } catch(e) {} 
    finally { setLoading(false); }
  };

  const fetchState = async () => {
    if(!user) return;
    try {
      const data = await api(`state/${user.id}`);
      setUser(data.user);
      setInventory(data.inventory || []);
    } catch(e) {}
  };

  const mine = async () => {
    if(miningAnim || user.energy < CONFIG.ENERGY_COST) return;
    
    // Trigger Animation
    setMiningAnim(true);
    setTimeout(() => setMiningAnim(false), 500);

    try {
      const data = await api('mine', 'POST', { userId: user.id });
      setUser(prev => ({ ...prev, energy: data.energy, credits: data.credits }));
      showToast(`Mined +${data.minedAmount} Credits!`, 'success');
    } catch(e) {}
  };

  const buyPack = async () => {
    if(loading) return;
    setLoading(true);
    setRevealCard(null);
    
    try {
      const data = await api('buy-pack', 'POST', { userId: user.id });
      // Simulate pack opening
      setTimeout(() => {
        setRevealCard(data.card || { name: "New Card", rarity: "Common", mine_power: 1 }); // Fallback if backend doesn't return card details yet
        showToast("New card acquired!", 'success');
        fetchState();
        setLoading(false);
      }, 1000);
    } catch(e) {
      setLoading(false);
    }
  };

  const equip = async (cardId) => {
    try {
      await api('equip', 'POST', { userId: user.id, cardId });
      fetchState();
    } catch(e) {}
  };

  const logout = () => {
    setUser(null);
    setInventory([]);
    setView('login');
  };

  useEffect(() => {
    if(user) {
      const interval = setInterval(fetchState, CONFIG.TICK_RATE_MS);
      return () => clearInterval(interval);
    }
  }, [user]);

  // --- Derived Stats ---
  const activeCards = useMemo(() => inventory.filter(c => c.equipped), [inventory]);
  const totalPower = useMemo(() => activeCards.reduce((s, c) => s + c.mine_power, 0), [activeCards]);
  
  // Safeguards
  const eNow = user?.energy || 0;
  const eMax = user?.max_energy || 100;
  const creds = user?.credits || 0;

  // --- RENDER LOGIN ---
  if (view === 'login') {
    return (
      <div style={styles.container}>
        <GlobalStyles />
        {toast && <div style={{ ...styles.toast, background: THEME.colors[toast.type] }}>{toast.msg}</div>}
        
        <div style={styles.authBox}>
          <h1 style={{ fontSize: '42px', margin: 0, color: THEME.colors.accent }}>ETHERGRIND</h1>
          <p style={{ color: THEME.colors.muted, marginTop: '10px', letterSpacing: '3px' }}>STARTER EDITION</p>
          
          <Spacer h={30} />
          <input style={styles.input} placeholder="USERNAME" onChange={e => setForm({ ...form, u: e.target.value })} />
          <input style={styles.input} type="password" placeholder="PASSWORD" onChange={e => setForm({ ...form, p: e.target.value })} />
          
          <Spacer h={15} />
          <Btn wide size="lg" onClick={() => login('login')} disabled={loading}>
            {loading ? 'CONNECTING...' : 'ENTER MINE'}
          </Btn>
          
          <div style={{ marginTop: '15px', textAlign: 'center' }}>
            <span style={{ color: THEME.colors.muted }}>New miner? </span>
            <span style={{ color: THEME.colors.accent, cursor: 'pointer', fontWeight: 'bold' }} onClick={() => login('register')}>
              REGISTER FREE
            </span>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER GAME ---
  return (
    <div style={styles.container}>
      <GlobalStyles />
      {toast && <div style={{ ...styles.toast, background: THEME.colors[toast.type] || THEME.colors.accent }}>{toast.msg}</div>}

      {/* HEADER */}
      <div style={styles.headerBar}>
        <div style={{ flex: 1 }}>
          <div style={{ color: THEME.colors.muted, fontSize: '11px' }}>CREDITS</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: THEME.colors.success }}>{creds}</div>
        </div>
        
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ color: THEME.colors.muted, fontSize: '11px' }}>POWER</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: THEME.colors.accent }}>{totalPower}</div>
        </div>
        
        <div style={{ flex: 1, textAlign: 'right' }}>
          <div style={{ color: THEME.colors.muted, fontSize: '11px' }}>ENERGY</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: THEME.colors.warning }}>{eNow} <span style={{fontSize: '14px'}}>/ {eMax}</span></div>
        </div>
      </div>

      {/* TABS */}
      <div style={styles.tabBar}>
        {['mine', 'shop', 'inventory'].map(t => (
          <div 
            key={t} 
            onClick={() => setTab(t)} 
            style={{ 
              ...styles.tabBtn, 
              borderBottom: tab === t ? `2px solid ${THEME.colors.accent}` : 'none',
              color: tab === t ? THEME.colors.accent : THEME.colors.muted
            }}
          >
            {t === 'mine' ? '⛏️ MINE' : t === 'shop' ? '🛒 SHOP' : '🎒 CARDS'}
          </div>
        ))}
      </div>

      {/* CONTENT */}
      <div style={styles.contentArea}>
        
        {/* MINE VIEW */}
        {tab === 'mine' && (
          <div style={{ textAlign: 'center', width: '100%' }}>
            <div style={{ marginBottom: '20px', color: THEME.colors.muted }}>
              Active Tools: <b style={{ color: THEME.colors.text }}>{activeCards.length}</b>
            </div>

            {/* Mine Button */}
            <button 
              onClick={mine} 
              disabled={eNow < CONFIG.ENERGY_COST}
              style={{
                ...styles.mineBtn,
                opacity: eNow < CONFIG.ENERGY_COST ? 0.5 : 1,
                animation: miningAnim ? 'shake 0.5s ease-in-out' : 'pulse 2s infinite'
              }}
            >
              <div style={{ fontSize: '60px' }}>⛏️</div>
              <div style={{ fontSize: '20px', letterSpacing: '3px' }}>MINE</div>
            </button>

            <Spacer h={20} />
            
            {/* Loadout Preview */}
            <div style={{ textAlign: 'left', marginTop: '30px', borderTop: '1px solid #222', paddingTop: '20px' }}>
              <div style={{ color: THEME.colors.muted, fontSize: '12px', marginBottom: '10px' }}>CURRENT LOADOUT</div>
              {activeCards.length === 0 ? (
                <div style={{ color: THEME.colors.danger, fontSize: '14px' }}>No tools equipped! Check Inventory.</div>
              ) : (
                activeCards.map(c => (
                  <Flex key={c.id} justify="space-between" style={{ background: '#111', padding: '8px', borderRadius: '6px', marginBottom: '5px' }}>
                    <span>{c.name}</span>
                    <span style={{ color: THEME.colors.success }}>+{c.mine_power}</span>
                  </Flex>
                ))
              )}
            </div>
          </div>
        )}

        {/* SHOP VIEW */}
        {tab === 'shop' && (
          <div style={{ textAlign: 'center', width: '100%' }}>
            <div style={styles.shopCard}>
              {/* Pack Visual */}
              <div style={{ 
                width: '150px', height: '200px', 
                background: 'linear-gradient(135deg, #2d2d44, #1a1a24)',
                margin: '0 auto',
                borderRadius: '10px',
                border: '2px solid #444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 10px 20px rgba(0,0,0,0.5)'
              }}>
                <div style={{ fontSize: '50px' }}>📦</div>
              </div>
              <Spacer h={15} />
              <h3 style={{ margin: '0 0 5px 0' }}>STARTER PACK</h3>
              <p style={{ color: THEME.colors.muted, fontSize: '13px' }}>Chance for Common, Rare, or Mythic!</p>
              <div style={{ fontSize: '24px', color: THEME.colors.warning, fontWeight: 'bold', marginTop: '10px' }}>
                {CONFIG.PACK_COST} Credits
              </div>
            </div>
            
            <Spacer h={20} />
            
            <Btn variant="primary" wide size="lg" onClick={buyPack} disabled={loading || creds < CONFIG.PACK_COST}>
              {loading ? "OPENING..." : "BUY PACK"}
            </Btn>
            
            {/* Card Reveal Animation */}
            {revealCard && (
              <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setRevealCard(null)}>
                <div className="card-reveal" style={{ textAlign: 'center' }}>
                  <h2 style={{ color: THEME.colors.rarity[revealCard.rarity] || '#fff' }}>NEW CARD!</h2>
                  <div style={{ fontSize: '80px', margin: '20px 0' }}>🃏</div>
                  <h1 style={{ margin: 0 }}>{revealCard.name}</h1>
                  <p style={{ color: THEME.colors.muted }}>{revealCard.rarity}</p>
                  <Spacer h={20} />
                  <Btn onClick={() => setRevealCard(null)}>COLLECT</Btn>
                </div>
              </div>
            )}
          </div>
        )}

        {/* INVENTORY VIEW */}
        {tab === 'inventory' && (
          <div style={{ width: '100%' }}>
            <h3 style={{ marginTop: 0, color: THEME.colors.muted }}>YOUR COLLECTION ({inventory.length})</h3>
            {inventory.length === 0 && <div style={{ textAlign: 'center', color: THEME.colors.muted }}>Empty. Buy a pack!</div>}
            {inventory.map(card => (
              <GameCard key={card.id} card={card} onEquip={equip} />
            ))}
          </div>
        )}

      </div>

      <Btn variant="ghost" onClick={logout} style={{ marginTop: '20px' }}>EXIT GAME</Btn>
    </div>
  );
};

// --- Base Styles Object ---
const styles = {
  container: {
    minHeight: '100vh',
    background: THEME.colors.bg,
    color: THEME.colors.text,
    fontFamily: "'Inter', sans-serif",
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '20px', boxSizing: 'border-box'
  },
  authBox: {
    background: THEME.colors.card,
    padding: '40px',
    borderRadius: '20px',
    boxShadow: THEME.shadows.panel,
    width: '100%',
    maxWidth: '400px',
    textAlign: 'center'
  },
  input: {
    width: '100%', padding: '15px', background: THEME.colors.bg, border: '1px solid #333',
    borderRadius: '8px', color: '#fff', fontSize: '16px', marginBottom: '15px', outline: 'none',
    textTransform: 'uppercase'
  },
  toast: {
    position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
    padding: '12px 25px', borderRadius: '50px', color: '#000', fontWeight: 'bold', zIndex: 1000,
    boxShadow: '0 5px 15px rgba(0,0,0,0.3)'
  },
  headerBar: {
    width: '100%', maxWidth: '450px', display: 'flex', justifyContent: 'space-between',
    background: THEME.colors.card, padding: '15px', borderRadius: '12px', marginBottom: '20px',
    boxShadow: '0 5px 15px rgba(0,0,0,0.3)'
  },
  tabBar: {
    display: 'flex', width: '100%', maxWidth: '450px', marginBottom: '20px', borderBottom: '1px solid #222'
  },
  tabBtn: {
    flex: 1, textAlign: 'center', padding: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', letterSpacing: '1px'
  },
  contentArea: {
    width: '100%', maxWidth: '450px', minHeight: '300px'
  },
  mineBtn: {
    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
    border: 'none', color: '#000', width: '140px', height: '140px', borderRadius: '50%',
    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 0 30px rgba(245, 158, 11, 0.4)', outline: 'none'
  },
  shopCard: {
    padding: '20px', border: '1px dashed #333', borderRadius: '15px', marginBottom: '20px'
  }
};