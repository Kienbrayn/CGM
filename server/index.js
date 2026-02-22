// server/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// --- CONFIGURATION ---
const CONFIG = {
  PORT: process.env.PORT || 3001,
  SALT_ROUNDS: 10,
  STARTING_CREDITS: 100,
  PACK_COST: 50,
  ENERGY_COST_MINE: 10,
  ENERGY_REGEN_RATE: 1, // Per minute
  MAX_ENERGY: 100, // Fallback if DB default isn't set
  RARITY_CHANCES: {
    COMMON: 70,
    RARE: 25, // 71-95
    MYTHIC: 5 // 96-100
  }
};

// --- DATABASE SETUP ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false } 
    : false
});

// Simple query helper for cleaner code
const query = (text, params) => pool.query(text, params);

// --- EXPRESS SETUP ---
const app = express();

// Security Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate Limiting (Prevent spam)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter);

// --- UTILITIES ---

// Async Handler wrapper to catch errors in async routes
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Custom Error Class
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// --- AUTH ROUTES ---

app.post('/api/register', asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    throw new AppError('Username and password are required', 400);
  }

  const password_hash = await bcrypt.hash(password, CONFIG.SALT_ROUNDS);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Create User
    const userRes = await client.query(
      'INSERT INTO users (username, password_hash, credits) VALUES ($1, $2, $3) RETURNING id, username, credits, energy',
      [username, password_hash, CONFIG.STARTING_CREDITS]
    );
    const newUser = userRes.rows[0];

    // 2. Give Starter Card
    // NOTE: In production, avoid hardcoding ID '1'. Use: SELECT id FROM card_types WHERE name = 'Rusty Pickaxe'
    const starterCardId = 1; 
    
    await client.query(
      `INSERT INTO user_cards (user_id, card_type_id, current_durability, equipped) 
       VALUES ($1, $2, 50, true)`,
      [newUser.id, starterCardId]
    );

    await client.query('COMMIT');
    
    // Return safe user data (no password hash)
    res.status(201).json({ 
      message: "Registration successful", 
      user: newUser 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') { // Unique violation in Postgres
      throw new AppError('Username already exists', 409);
    }
    throw error; // Pass to global error handler
  } finally {
    client.release();
  }
}));

app.post('/api/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  const result = await query(
    'SELECT * FROM users WHERE username = $1',
    [username]
  );

  const user = result.rows[0];

  if (!user) {
    throw new AppError('Invalid credentials', 401);
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);

  if (!isMatch) {
    throw new AppError('Invalid credentials', 401);
  }

  // Return safe user data
  const { password_hash, ...safeUserData } = user;
  res.json({ user: safeUserData });
}));

// --- GAME LOGIC ROUTES ---

// 1. Get State
app.get('/api/state/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const userRes = await query('SELECT * FROM users WHERE id = $1', [userId]);
  const user = userRes.rows[0];

  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Energy Regen Logic
  const now = new Date();
  const lastActive = new Date(user.last_mined_at || now);
  const minutesPassed = Math.floor((now - lastActive) / 60000);

  if (minutesPassed > 0) {
    const maxEnergy = user.max_energy || CONFIG.MAX_ENERGY;
    const energyGain = Math.min(minutesPassed * CONFIG.ENERGY_REGEN_RATE, maxEnergy);
    const newEnergy = Math.min(user.energy + energyGain, maxEnergy);

    // Only update DB if energy actually changed
    if (newEnergy !== user.energy) {
      await query(
        'UPDATE users SET energy = $1, last_mined_at = NOW() WHERE id = $2', 
        [newEnergy, userId]
      );
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
}));

// 2. Toggle Equip Card
app.post('/api/equip', asyncHandler(async (req, res) => {
  const { userId, cardId } = req.body;
  
  // Ideally, check if the card belongs to the user before toggling
  const result = await query(
    'UPDATE user_cards SET equipped = NOT equipped WHERE id = $1 AND user_id = $2 RETURNING equipped',
    [cardId, userId]
  );

  if (result.rowCount === 0) {
    throw new AppError('Card not found or does not belong to user', 404);
  }

  res.json({ success: true, equipped: result.rows[0].equipped });
}));

// 3. Buy Pack
app.post('/api/buy-pack', asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock row for update
    const userRes = await client.query('SELECT credits FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (userRes.rows.length === 0) throw new AppError('User not found', 404);
    
    const user = userRes.rows[0];

    if (user.credits < CONFIG.PACK_COST) {
      throw new AppError('Not enough credits!', 400);
    }

    // Deduct Credits
    await client.query('UPDATE users SET credits = credits - $1 WHERE id = $2', [CONFIG.PACK_COST, userId]);

    // Determine Rarity
    const roll = Math.floor(Math.random() * 100) + 1;
    let rarityId;

    if (roll <= CONFIG.RARITY_CHANCES.COMMON) rarityId = 1;        // Rusty Pickaxe
    else if (roll <= CONFIG.RARITY_CHANCES.COMMON + CONFIG.RARITY_CHANCES.RARE) rarityId = 2; // Iron Hammer
    else rarityId = 3;                                              // Quantum Drill

    // Get Card Definition
    // Note: Ideally select name as well to return it to frontend
    const cardDefRes = await client.query('SELECT durability, name FROM card_types WHERE id = $1', [rarityId]);
    if (cardDefRes.rows.length === 0) throw new AppError('Invalid card configuration', 500);

    const cardDef = cardDefRes.rows[0];

    // Grant Card
    await client.query(
      'INSERT INTO user_cards (user_id, card_type_id, current_durability, equipped) VALUES ($1, $2, $3, false)',
      [userId, rarityId, cardDef.durability]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: `You found a ${cardDef.name}!` });

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

// 4. Mine
app.post('/api/mine', asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock user row
    const userRes = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const user = userRes.rows[0];

    if (!user) throw new AppError('User not found', 404);

    if (user.energy < CONFIG.ENERGY_COST_MINE) {
      throw new AppError(`Need ${CONFIG.ENERGY_COST_MINE} Energy! (Regens over time)`, 400);
    }

    // Get Active Equipment
    const activeCardsRes = await client.query(
      `SELECT uc.id, ct.mine_power, uc.current_durability 
       FROM user_cards uc 
       JOIN card_types ct ON uc.card_type_id = ct.id 
       WHERE uc.user_id = $1 AND uc.equipped = true`,
      [userId]
    );

    if (activeCardsRes.rows.length === 0) {
      throw new AppError('Equip a card first!', 400);
    }

    let totalMined = 0;
    const updatePromises = [];

    // Process Mining
    for (let card of activeCardsRes.rows) {
      if (card.current_durability > 0) {
        totalMined += card.mine_power;
        // Collect promises to run in parallel later (or sequentially if preferred)
        updatePromises.push(
          client.query('UPDATE user_cards SET current_durability = current_durability - 1 WHERE id = $1', [card.id])
        );
      }
    }

    // Update durability for all used cards
    await Promise.all(updatePromises);

    const newEnergy = user.energy - CONFIG.ENERGY_COST_MINE;
    const newCredits = user.credits + totalMined;
    
    await client.query(
      'UPDATE users SET energy = $1, credits = $2, last_mined_at = NOW() WHERE id = $3', 
      [newEnergy, newCredits, userId]
    );

    await client.query('COMMIT');
    res.json({ 
      message: `Mined ${totalMined} credits!`, 
      credits: newCredits, 
      energy: newEnergy,
      minedAmount: totalMined
    });

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

// --- GLOBAL ERROR HANDLER ---
// This must be defined last
app.use((err, req, res, next) => {
  console.error(err.stack);

  // Handle known operational errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Handle specific Postgres errors
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Duplicate entry detected.' });
  }

  // Generic error
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

// --- START SERVER ---
app.listen(CONFIG.PORT, () => {
  console.log(`Server running on port ${CONFIG.PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});