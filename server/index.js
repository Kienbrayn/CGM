// server/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- AUTH ---
// UPDATED: Now gives a free "Rusty Pickaxe" on registration
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Create User
    const userRes = await client.query(
      'INSERT INTO users (username, password_hash, credits) VALUES ($1, $2, 100) RETURNING id, username, credits, energy',
      [username, password] // Giving 100 free credits to start
    );
    const newUser = userRes.rows[0];

    // 2. Give Starter Card (Rusty Pickaxe has ID 1 in your DB)
    await client.query(
      `INSERT INTO user_cards (user_id, card_type_id, current_durability, equipped) 
       VALUES ($1, 1, 50, true)`, // ID 1 = Rusty Pickaxe, equipped = true
      [newUser.id]
    );

    await client.query('COMMIT');
    res.json(newUser);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: "User exists or DB error" });
  } finally {
    client.release();
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await pool.query(
    'SELECT * FROM users WHERE username = $1 AND password_hash = $2',
    [username, password]
  );
  if (result.rows.length > 0) {
    res.json(result.rows[0]);
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

// --- GAME LOGIC ---

// 1. Get State (Inventory + User)
app.get('/api/state/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const cardsRes = await pool.query(
      `SELECT uc.id, ct.name, ct.rarity, ct.mine_power, uc.current_durability, uc.equipped 
       FROM user_cards uc 
       JOIN card_types ct ON uc.card_type_id = ct.id 
       WHERE uc.user_id = $1`,
      [userId]
    );
    
    const user = userRes.rows[0];
    
    // Energy Regen Logic
    const now = new Date();
    const lastActive = new Date(user.last_mined_at);
    const minutesPassed = Math.floor((now - lastActive) / 60000);
    if (minutesPassed > 0) {
        const energyGain = minutesPassed * 1; 
        user.energy = Math.min(user.energy + energyGain, user.max_energy);
        await pool.query('UPDATE users SET energy = $1, last_mined_at = NOW() WHERE id = $2', [user.energy, userId]);
    }

    res.json({ user, inventory: cardsRes.rows });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// 2. Toggle Equip Card
app.post('/api/equip', async (req, res) => {
  const { userId, cardId } = req.body;
  try {
    // Toggle equipped status (true -> false, false -> true)
    await pool.query(
      'UPDATE user_cards SET equipped = NOT equipped WHERE id = $1 AND user_id = $2',
      [cardId, userId]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Equip failed" });
  }
});

// 3. Buy Pack (Shop)
app.post('/api/buy-pack', async (req, res) => {
  const { userId } = req.body;
  const PACK_COST = 50;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    
    // Check balance
    const userRes = await client.query('SELECT credits FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const user = userRes.rows[0];

    if (user.credits < PACK_COST) {
      return res.status(400).json({ error: "Not enough credits!" });
    }

    // Deduct Credits
    await client.query('UPDATE users SET credits = credits - $1 WHERE id = $2', [PACK_COST, userId]);

    // Random Card Logic (Simple Version)
    // Roll 1-100. 1-70=Common, 71-90=Rare, 91-100=Mythic
    const roll = Math.floor(Math.random() * 100) + 1;
    let rarityId;
    
    if (roll <= 70) rarityId = 1;       // Rusty Pickaxe (Common)
    else if (roll <= 95) rarityId = 2;  // Iron Hammer (Rare)
    else rarityId = 3;                  // Quantum Drill (Mythic)

    // Get card durability
    const cardDef = await client.query('SELECT durability FROM card_types WHERE id = $1', [rarityId]);

    // Grant Card
    await client.query(
      'INSERT INTO user_cards (user_id, card_type_id, current_durability, equipped) VALUES ($1, $2, $3, false)',
      [userId, rarityId, cardDef.rows[0].durability]
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

// 4. Mine (Updated to handle 0 energy)
app.post('/api/mine', async (req, res) => {
  const { userId } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    
    const userRes = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const user = userRes.rows[0];

    if (user.energy < 10) {
      return res.status(400).json({ error: "Need 10 Energy! (Regens over time)" });
    }

    // Calculate Power
    const activeCardsRes = await client.query(
      'SELECT uc.id, ct.mine_power, uc.current_durability FROM user_cards uc JOIN card_types ct ON uc.card_type_id = ct.id WHERE uc.user_id = $1 AND uc.equipped = true',
      [userId]
    );

    if (activeCardsRes.rows.length === 0) {
      return res.status(400).json({ error: "Equip a card first!" });
    }

    let totalMined = 0;
    for (let card of activeCardsRes.rows) {
      if (card.current_durability > 0) {
        totalMined += card.mine_power;
        await client.query('UPDATE user_cards SET current_durability = current_durability - 1 WHERE id = $1', [card.id]);
      }
    }

    const newEnergy = user.energy - 10;
    const newCredits = user.credits + totalMined;
    
    await client.query('UPDATE users SET energy = $1, credits = $2, last_mined_at = NOW() WHERE id = $3', 
      [newEnergy, newCredits, userId]);

    await client.query('COMMIT');
    res.json({ message: `Mined ${totalMined} credits!`, credits: newCredits, energy: newEnergy });

  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: "Mining failed" });
  } finally {
    client.release();
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));