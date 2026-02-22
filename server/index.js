// server/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection (Supabase/Postgres)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Required for Supabase/Render
});

// --- AUTH (Simplified for MVP) ---
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body; // NOTE: Hash password in real production!
  try {
    const result = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, credits, energy',
      [username, password] 
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(400).json({ error: "User exists or DB error" });
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

// 1. Get User State
app.get('/api/state/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const cardsRes = await pool.query(
      'SELECT uc.id, ct.name, ct.rarity, ct.mine_power, uc.current_durability, uc.equipped FROM user_cards uc JOIN card_types ct ON uc.card_type_id = ct.id WHERE uc.user_id = $1',
      [userId]
    );
    
    const user = userRes.rows[0];
    
    // Energy Regeneration Logic (1 Energy per minute)
    const now = new Date();
    const lastActive = new Date(user.last_mined_at);
    const minutesPassed = Math.floor((now - lastActive) / 60000);
    const energyGain = minutesPassed * 1; // 1 energy per min
    
    if (energyGain > 0) {
        user.energy = Math.min(user.energy + energyGain, user.max_energy);
        await pool.query('UPDATE users SET energy = $1, last_mined_at = NOW() WHERE id = $2', [user.energy, userId]);
    }

    res.json({ user, inventory: cardsRes.rows });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// 2. Mining Action (The Core Loop)
app.post('/api/mine', async (req, res) => {
  const { userId } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    
    // Lock user row for transaction
    const userRes = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const user = userRes.rows[0];

    if (user.energy < 10) {
      return res.status(400).json({ error: "Not enough energy! Wait or watch Ad." });
    }

    // Get equipped cards (Active Miners)
    const activeCardsRes = await client.query(
      'SELECT uc.id, ct.mine_power, uc.current_durability FROM user_cards uc JOIN card_types ct ON uc.card_type_id = ct.id WHERE uc.user_id = $1 AND uc.equipped = true',
      [userId]
    );

    if (activeCardsRes.rows.length === 0) {
      return res.status(400).json({ error: "No cards equipped!" });
    }

    // Calculate Rewards
    let totalMined = 0;
    for (let card of activeCardsRes.rows) {
      if (card.current_durability > 0) {
        totalMined += card.mine_power;
        // Decrease durability
        await client.query('UPDATE user_cards SET current_durability = current_durability - 1 WHERE id = $1', [card.id]);
      }
    }

    // Update User
    const newEnergy = user.energy - 10;
    const newCredits = user.credits + totalMined;
    
    await client.query('UPDATE users SET energy = $1, credits = $2, last_mined_at = NOW() WHERE id = $3', 
      [newEnergy, newCredits, userId]);

    // Log Transaction
    await client.query('INSERT INTO transaction_log (user_id, amount, source) VALUES ($1, $2, $3)', 
      [userId, totalMined, 'mining']);

    await client.query('COMMIT');
    res.json({ message: `Mined ${totalMined} credits!`, credits: newCredits, energy: newEnergy });

  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: "Mining failed" });
  } finally {
    client.release();
  }
});

// 3. Offerwall Webhook (Where you make money)
// This is a placeholder for AdGate/OfferToro integration
app.post('/api/webhook/reward', async (req, res) => {
  // In reality, verify the signature here
  const { userId, amount_usd } = req.body; 
  
  // CONVERSION: $1.00 USD = 1000 Credits
  const userShare = amount_usd * 0.40; // User gets 40%
  const creditsAwarded = userShare * 1000; 

  try {
    await pool.query('UPDATE users SET credits = credits + $1 WHERE id = $2', [creditsAwarded, userId]);
    console.log(`User ${userId} earned ${creditsAwarded} credits. Owner kept $${amount_usd * 0.60}`);
    res.status(200).send("OK");
  } catch (e) {
    res.status(500).send("Error");
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));