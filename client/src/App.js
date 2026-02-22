import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

// ===============================================
// 1. STYLES & THEME (MOVED TO TOP)
// ===============================================

const THEME = {
  colors: {
    bg: '#0f172a',
    card: '#1e293b',
    cardLight: '#334155',
    accent: '#6366f1',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    text: '#f1f5f9',
    muted: '#94a3b8',
    rarity: {
      Common: '#9ca3af',
      Rare: '#3b82f6',
      Mythic: '#a855f7',
    }
  },
  shadows: {
    panel: '0 10px 25px rgba(0,0,0,0.5)',
    button: '0 4px 14px rgba(0,0,0,0.3)',
  }
};

// Base Container Style defined here so it's available everywhere
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minHeight: '100vh',
    background: THEME.colors.bg,
    color: THEME.colors.text,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    padding: '20px',
    boxSizing: 'border-box'
  }
};

const CONFIG = {
  API_URL: "https://cgm-j82x.onrender.com",
  TICK_RATE_MS: 5000, 
  ENERGY_COST: 10,
  PACK_COST: 50,
};

// ===============================================
// 2. UTILITIES & AUDIO
// ===============================================

const useAudio = () => {
  const playSound = (type) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'mine') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } else if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.setValueAtTime(600, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(50, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      }
    } catch (e) {
      console.log("Audio failed", e);
    }
  };

  return { playSound };
};

// ===============================================
// 3. CUSTOM HOOK: GAME LOGIC
// ===============================================

const useGameLogic = (showToast, playSound) => {
  const [user, setUser] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState('login'); 

  const apiCall = async (endpoint, method = 'GET', body = null) => {
    try {
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (body) options.body = JSON.stringify(body);
      
      const res = await fetch(`${CONFIG.API_URL}/api/${endpoint}`, options);
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Server Error");
      return data;
    } catch (err) {
      showToast(err.message, 'danger');
      playSound('error');
      throw err;
    }
  };

  const fetchState = useCallback(async (userId) => {
    try {
      const data = await apiCall(`state/${userId}`);
      if (data.user) {
        setUser(data.user);
        setInventory(data.inventory || []);
      }
    } catch (e) {
      // Silent fail for background polling
    }
  }, [showToast, playSound]);

  const handleAuth = async (action, username, password) => {
    setIsLoading(true);
    try {
      const data = await apiCall(action, 'POST', { username, password });
      setUser(data.user || data); 
      setInventory(data.inventory || []);
      setView('game');
      playSound('success');
    } catch (e) {
      // Error handled by apiCall
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setInventory([]);
    setView('login');
  };

  const mine = async () => {
    // Safety check: ensure user is loaded
    if (!user || user.energy < CONFIG.ENERGY_COST) {
      showToast("Not enough energy!", "warning");
      playSound('error');
      return;
    }
    
    playSound('mine');
    try {
      const data = await apiCall('mine', 'POST', { userId: user.id });
      setUser(prev => ({ ...prev, energy: data.energy, credits: data.credits }));
      showToast(`Mined +${data.minedAmount || 0} Credits!`, "success");
    } catch (e) {}
  };

  const buyPack = async () => {
    setIsLoading(true);
    try {
      const data = await apiCall('buy-pack', 'POST', { userId: user.id });
      showToast(data.message || "Pack opened!", "success");
      playSound('success');
      await fetchState(user.id); 
    } catch (e) {}
    finally { setIsLoading(false); }
  };

  const toggleEquip = async (cardId) => {
    try {
      await apiCall('equip', 'POST', { userId: user.id, cardId });
      await fetchState(user.id);
    } catch (e) {}
  };

  useEffect(() => {
    if (view === 'game' && user) {
      const interval = setInterval(() => fetchState(user.id), CONFIG.TICK_RATE_MS);
      return () => clearInterval(interval);
    }
  }, [view, user, fetchState]);

  return {
    view,
    setView,
    user,
    inventory,
    isLoading,
    handleAuth,
    logout,
    mine,
    buyPack,
    toggleEquip
  };
};

// ===============================================
// 4. UI COMPONENTS
// ===============================================

const Button = ({ children, onClick, variant = 'primary', style = {}, disabled = false, fullWidth = false }) => {
  const baseStyle = {
    padding: '12px 20px',
    borderRadius: '8px',
    border: 'none',
    fontWeight: 'bold',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    width: fullWidth ? '100%' : 'auto',
    transition: 'transform 0.1s, box-shadow 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: THEME.shadows.button,
    ...style
  };

  const variants = {
    primary: { background: THEME.colors.accent, color: 'white' },
    secondary: { background: THEME.colors.cardLight, color: THEME.colors.text },
    success: { background: THEME.colors.success, color: '#000' },
    warning: { background: THEME.colors.warning, color: '#000' },
    ghost: { background: 'transparent', border: `1px solid ${THEME.colors.accent}`, color: THEME.colors.accent }
  };

  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      style={{ ...baseStyle, ...variants[variant] }}
    >
      {children}
    </button>
  );
};

const Input = ({ placeholder, type = 'text', onChange, value }) => (
  <input 
    type={type}
    placeholder={placeholder}
    onChange={onChange}
    value={value}
    style={{
      width: '100%',
      padding: '14px',
      background: THEME.colors.bg,
      border: `1px solid ${THEME.colors.cardLight}`,
      borderRadius: '8px',
      color: THEME.colors.text,
      fontSize: '16px',
      marginBottom: '12px',
      outline: 'none',
      transition: 'border-color 0.2s'
    }}
  />
);

const Panel = ({ children, style = {} }) => (
  <div style={{
    background: THEME.colors.card,
    borderRadius: '16px',
    padding: '24px',
    width: '100%',
    maxWidth: '420px',
    boxShadow: THEME.shadows.panel,
    marginBottom: '20px',
    ...style
  }}>
    {children}
  </div>
);

const Toast = ({ message, type }) => {
  const bgColors = {
    success: THEME.colors.success,
    danger: THEME.colors.danger,
    warning: THEME.colors.warning
  };

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      padding: '12px 24px',
      borderRadius: '8px',
      background: bgColors[type] || THEME.colors.cardLight,
      color: type === 'warning' || type === 'success' ? '#000' : '#FFF',
      fontWeight: 'bold',
      zIndex: 9999,
      animation: 'slideIn 0.3s ease-out',
      boxShadow: THEME.shadows.panel
    }}>
      {message}
    </div>
  );
};

const StatBox = ({ label, value, color }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, background: THEME.colors.bg, padding: '12px', borderRadius: '8px' }}>
    <small style={{ color: THEME.colors.muted, fontSize: '12px', textTransform: 'uppercase' }}>{label}</small>
    <span style={{ fontSize: '22px', fontWeight: 'bold', color: color || THEME.colors.text }}>{value}</span>
  </div>
);

const CardItem = ({ card, onEquip }) => {
  const rarityColor = THEME.colors.rarity[card.rarity] || THEME.colors.text;
  const isBroken = card.current_durability <= 0;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      background: THEME.colors.bg,
      padding: '12px',
      borderRadius: '8px',
      marginBottom: '8px',
      borderLeft: `4px solid ${rarityColor}`,
      opacity: isBroken ? 0.5 : 1,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 'bold', color: card.equipped ? THEME.colors.warning : THEME.colors.text }}>
          {card.name} {card.equipped && "⚡"}
        </div>
        <div style={{ fontSize: '12px', color: THEME.colors.muted, marginTop: '4px', display: 'flex', gap: '8px' }}>
          <span>{card.rarity}</span>
          <span>PWR: {card.mine_power}</span>
          <span style={{ color: isBroken ? THEME.colors.danger : THEME.colors.muted }}>
            DUR: {card.current_durability}
          </span>
        </div>
      </div>
      
      <Button 
        variant={card.equipped ? 'warning' : 'secondary'}
        onClick={() => onEquip(card.id)}
        disabled={isBroken}
        style={{ padding: '6px 12px', fontSize: '12px' }}
      >
        {isBroken ? 'BROKEN' : card.equipped ? 'ACTIVE' : 'EQUIP'}
      </Button>
    </div>
  );
};

const MineButton = ({ onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      background: disabled ? THEME.colors.cardLight : 'linear-gradient(135deg, #f59e0b, #d97706)',
      border: disabled ? 'none' : '4px solid #fbbf24',
      color: disabled ? THEME.colors.muted : '#000',
      width: '160px',
      height: '160px',
      borderRadius: '50%',
      fontSize: '24px',
      fontWeight: 'bold',
      cursor: disabled ? 'not-allowed' : 'pointer',
      boxShadow: disabled ? 'none' : '0 0 30px rgba(245, 158, 11, 0.4)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      animation: disabled ? 'none' : 'pulse 2s infinite'
    }}
  >
    <span style={{ fontSize: '40px', marginBottom: '5px' }}>⛏️</span>
    MINE
  </button>
);

// ===============================================
// 5. MAIN APP COMPONENT
// ===============================================

export default function App() {
  const [toast, setToast] = useState(null);
  const [tab, setTab] = useState('mine');
  const [form, setForm] = useState({ user: '', pass: '' });
  
  const { playSound } = useAudio();
  
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const game = useGameLogic(showToast, playSound);

  // Derived State with Fallbacks
  const activeCards = useMemo(() => game.inventory.filter(c => c.equipped), [game.inventory]);
  const totalPower = useMemo(() => activeCards.reduce((sum, c) => sum + c.mine_power, 0), [activeCards]);
  
  // Safe access to user data for display
  const currentEnergy = game.user?.energy || 0;
  const maxEnergy = game.user?.max_energy || 100;
  const currentCredits = game.user?.credits || 0;

  // --- RENDER LOGIN ---
  if (game.view === 'login') {
    return (
      <div style={styles.container}>
        <style>{`@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
        {toast && <Toast {...toast} />}
        
        <Panel style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '36px', marginBottom: '10px' }}>⛏️ EtherGrind</h1>
          <p style={{ color: THEME.colors.muted, marginBottom: '30px' }}>Mine, Collect, Earn</p>
          
          <Input placeholder="Username" onChange={e => setForm({ ...form, user: e.target.value })} />
          <Input type="password" placeholder="Password" onChange={e => setForm({ ...form, pass: e.target.value })} />
          
          <Button 
            fullWidth 
            onClick={() => game.handleAuth('login', form.user, form.pass)}
            disabled={game.isLoading}
          >
            {game.isLoading ? 'Connecting...' : 'Login'}
          </Button>
          
          <Button 
            fullWidth 
            variant="ghost" 
            style={{ marginTop: '10px' }}
            onClick={() => game.handleAuth('register', form.user, form.pass)}
            disabled={game.isLoading}
          >
            Create Account
          </Button>
        </Panel>
      </div>
    );
  }

  // --- RENDER GAME ---
  return (
    <div style={styles.container}>
      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
      `}</style>

      {toast && <Toast {...toast} />}

      {/* HEADER STATS - Using safe variables */}
      <Panel style={{ display: 'flex', gap: '10px', padding: '15px' }}>
        <StatBox label="Credits" value={currentCredits} color={THEME.colors.success} />
        <StatBox label="Energy" value={`${currentEnergy}/${maxEnergy}`} color={THEME.colors.warning} />
        <StatBox label="Power" value={totalPower} color={THEME.colors.accent} />
      </Panel>

      {/* TAB BUTTONS */}
      <div style={{ display: 'flex', gap: '5px', width: '100%', maxWidth: '420px', marginBottom: '15px' }}>
        {['mine', 'shop', 'inventory'].map(key => (
          <Button 
            key={key}
            onClick={() => setTab(key)}
            variant={tab === key ? 'primary' : 'secondary'}
            fullWidth
          >
            {key === 'mine' && '⛏️ Mine'}
            {key === 'shop' && '🛒 Shop'}
            {key === 'inventory' && '🎒 Cards'}
          </Button>
        ))}
      </div>

      {/* CONTENT AREA */}
      <Panel>
        {tab === 'mine' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {game.inventory.length === 0 ? (
              <div style={{ textAlign: 'center' }}>
                <h3>No Tools</h3>
                <p style={{ color: THEME.colors.muted, fontSize: '14px' }}>Visit the shop to buy a pack!</p>
              </div>
            ) : (
              <>
                <p style={{ color: THEME.colors.muted, marginBottom: '20px' }}>
                  Active Tools: {activeCards.length}
                </p>
                
                <MineButton onClick={game.mine} disabled={currentEnergy < CONFIG.ENERGY_COST} />
                
                <div style={{ marginTop: '30px', width: '100%', borderTop: `1px solid ${THEME.colors.cardLight}`, paddingTop: '15px' }}>
                  <p style={{ fontSize: '12px', color: THEME.colors.muted, textTransform: 'uppercase', fontWeight: 'bold' }}>
                    Active Loadout
                  </p>
                  {activeCards.length === 0 ? (
                    <p style={{color: THEME.colors.danger, fontSize: '14px'}}>No tools equipped! Go to Cards.</p>
                  ) : (
                    activeCards.map(c => (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginTop: '8px' }}>
                        <span>{c.name}</span>
                        <span style={{ color: THEME.colors.success }}>+{c.mine_power}</span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'shop' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ border: `1px dashed ${THEME.colors.accent}`, padding: '30px', borderRadius: '12px', marginBottom: '20px' }}>
              <div style={{ fontSize: '50px', marginBottom: '10px' }}>📦</div>
              <h3>Standard Pack</h3>
              <p style={{ color: THEME.colors.muted, fontSize: '14px' }}>Contains 1 Tool Card</p>
              <h2 style={{ color: THEME.colors.success, marginTop: '10px' }}>{CONFIG.PACK_COST} Credits</h2>
            </div>
            <Button fullWidth onClick={game.buyPack} disabled={game.isLoading || currentCredits < CONFIG.PACK_COST}>
              {game.isLoading ? "Opening..." : "Buy Pack"}
            </Button>
          </div>
        )}

        {tab === 'inventory' && (
          <div>
            <h3 style={{ marginBottom: '15px' }}>Your Collection ({game.inventory.length})</h3>
            {game.inventory.length === 0 && <p style={{ textAlign: 'center', color: THEME.colors.muted }}>Empty</p>}
            {game.inventory.map(card => (
              <CardItem key={card.id} card={card} onEquip={game.toggleEquip} />
            ))}
          </div>
        )}
      </Panel>

      <Button variant="ghost" onClick={game.logout} style={{ marginTop: '10px' }}>
        Logout
      </Button>
    </div>
  );
};