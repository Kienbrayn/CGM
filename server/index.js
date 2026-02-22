// server/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3001;

// --- CONFIGURATION ---
const SALT_ROUNDS = 10;

// --- SECURITY MIDDLEWARE ---

// 1. Helmet sets various HTTP headers for security
app.use(helmet());

// 2. CORS: This allows your Vercel frontend to talk to this backend
app.use(cors({
  origin: [
    'https://cgm-hbdj-ms2jknubx-kienbrayn2-7108s-projects.vercel.app', // Your specific Vercel URL
    'http://localhost:3001', // Allow local development
    'http://localhost:3000'
  ],
  credentials: true
}));

app.use(express.json());

// --- DATABASE SETUP ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Only use SSL if in production (Render)
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false } 
    : false
});

// Helper for queries
const query = (text, params) => pool.query(text, params);

// --- AUTH ROUTES ---

// REGISTER (Now with Password Hashing!)
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Hash the password before saving
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    // 1. Create User (Store the hash, not plain text!)
    const userRes = await client.query(
      'INSERT INTO users (username, password_hash, credits) VALUES ($1, $2, 100) RETURNING id, username, credits, energy',
      [username, password_hash]
    );
    const newUser = userRes.rows[0];

    // 2. Give Starter Card (Rusty Pickaxe ID = 1)
    // Note: Make sure you have a card with ID 1 in your 'card_types' table
    await client.query(
      `INSERT INTO user_cards (user_id, card_type_id, current_durability, equipped) 
       VALUES ($1, 1, 50, true)`, 
      [newUser.id]
    );

    await client.query('COMMIT');
    res.status(201).json(newUser);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    if (e.code === '23505') {
       return res.status(409).json({ error: "User already exists" });
    }
    res.status(500).json({ error: "Registration failed" });
  } finally {
    client.release();
  }
});

// LOGIN (Now checks Hashed Password)
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const result = await query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Compare typed password with the hashed password in DB
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Return user data (excluding password)
    const { password_hash, ...safeUserData } = user;
    res.json(safeUserData);
    
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Login failed" });
  }
});

// --- GAME LOGIC ---

// Get State
app.get('/api/state/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const userRes = await query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userRes.rows[0];

    if (!user) return res.status(404).json({ error: "User not found" });

    // Energy Regen Logic
    const now = new Date();
    const lastActive = new Date(user.last_mined_at || now);
    const minutesPassed = Math.floor((now - lastActive) / 60000);

    if (minutesPassed > 0) {
        const maxEnergy = user.max_energy || 100;
        const energyGain = minutesPassed * 1; 
        const newEnergy = Math.min(user.energy + energyGain, maxEnergy);
        
        if (newEnergy !== user.energy) {
            await query('UPDATE users SET energy = $1, last_mined_at = NOW() WHERE id = $2', [newEnergy, userId]);
            user.energy = newEnergy;
        }
    }

    const cardsRes = await query(
      `SELECT uc.id, ct.name, ct.rarity, ct.mine_power, uc.current_durability, uc.equipped 
       FROM user_cards uc 
       JOIN card_types ct ON uc.card_type_id = ct.id 
       WHERE uc.user_id = $1`,
      [userId]
    );
    
    res.json({ user, inventory: cardsRes.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// Equip Card
app.post('/api/equip', async (req, res) => {
  const { userId, cardId } = req.body;
  try {
    await query(
      'UPDATE user_cards SET equipped = NOT equipped WHERE id = $1 AND user_id = $2',
      [cardId, userId]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Equip failed" });
  }
});

// Buy Pack
app.post('/api/buy-pack', async (req, res) => {
  const { userId } = req.body;
  const PACK_COST = 50;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    
    const userRes = await client.query('SELECT credits FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const user = userRes.rows[0];

    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.credits < PACK_COST) return res.status(400).json({ error: "Not enough credits!" });

    await client.query('UPDATE users SET credits = credits - $1 WHERE id = $2', [PACK_COST, userId]);

    // Random Card Logic
    const roll = Math.floor(Math.random() * 100) + 1;
    let rarityId;
    
    if (roll <= 70) rarityId = 1;       // Common
    else if (roll <= 95) rarityId = 2;  // Rare
    else rarityId = 3;                  // Mythic

    const cardDefRes = await client.query('SELECT durability FROM card_types WHERE id = $1', [rarityId]);
    if (cardDefRes.rows.length === 0) throw new Error("Card definition missing in DB");
    
    const durability = cardDefRes.rows[0].durability;

    await client.query(
      'INSERT INTO user_cards (user_id, card_type_id, current_durability, equipped) VALUES ($1, $2, $3, false)',
      [userId, rarityId, durability]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: "Pack opened!" });

  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: "Purchase failed" });
  } finally {
    client.release();
  }
});

// Mine
app.post('/api/mine', async (req, res) => {
  const { userId } = req.body;
  const ENERGY_COST = 10;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    
    const userRes = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const user = userRes.rows[0];

    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.energy < ENERGY_COST) return res.status(400).json({ error: "Need 10 Energy!" });

    const activeCardsRes = await client.query(
      'SELECT uc.id, ct.mine_power, uc.current_durability FROM user_cards uc JOIN card_types ct ON uc.card_type_id = ct.id WHERE uc.user_id = $1 AND uc.equipped = true',
      [userId]
    );

    if (activeCardsRes.rows.length === 0) return res.status(400).json({ error: "Equip a card first!" });

    let totalMined = 0;
    for (let card of activeCardsRes.rows) {
      if (card.current_durability > 0) {
        totalMined += card.mine_power;
        await client.query('UPDATE user_cards SET current_durability = current_durability - 1 WHERE id = $1', [card.id]);
      }
    }

    const newEnergy = user.energy - ENERGY_COST;
    const newCredits = user.credits + totalMined;
    
    await client.query('UPDATE users SET energy = $1, credits = $2, last_mined_at = NOW() WHERE id = $3', 
      [newEnergy, newCredits, userId]);

    await client.query('COMMIT');
    res.json({ message: `Mined ${totalMined} credits!`, credits: newCredits, energy: newEnergy, minedAmount: totalMined });

  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: "Mining failed" });
  } finally {
    client.release();
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));