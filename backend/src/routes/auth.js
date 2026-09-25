// routes/auth.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { sendOtpEmail } = require('../emailService');

const JWT_SECRET = process.env.JWT_SECRET || 'sahakara-super-secret-jwt-key-2026';

// Helper: Generate a secure 6-digit numeric OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper: Seed initial demo users if not present
function ensureDemoUsers() {
  const check = db.prepare('SELECT count(*) as count FROM users').get();
  if (check.count === 0) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('Sahakara@123', salt);

    const insert = db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, organization, phone, zone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run('usr-donor-1', 'Rajesh Sharma', 'donor@sahakara.org', hash, 'donor', 'Jaipur Marriott & Banquet', '+91 98290 12345', 'Mansarovar');
    insert.run('usr-shelter-1', 'Anjali Sen', 'shelter@sahakara.org', hash, 'shelter', 'Aasha Shelter Home', '+91 94140 54321', 'Malviya Nagar');
    insert.run('usr-driver-1', 'Kabir Verma', 'driver@sahakara.org', hash, 'driver', 'Sahakara Express Fleet', '+91 97850 99887', 'Tonk Road');
    console.log('[Auth] Pre-seeded 3 demo personas (Password: Sahakara@123)');
  }
}
ensureDemoUsers();

// Middleware: Verify JWT Token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Authentication required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ ok: false, error: 'Invalid or expired session token' });
    req.user = user;
    next();
  });
}

/**
 * POST /api/auth/send-otp
 * Body: { email, purpose: 'signup' | 'login', name?: string, role?: string }
 */
router.post('/send-otp', async (req, res) => {
  try {
    const { email, purpose = 'signup', name, role, organization } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ ok: false, error: 'Please provide a valid email address' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // If purpose is signup, check if user already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (purpose === 'signup' && existingUser) {
      return res.status(409).json({ ok: false, error: 'An account with this email already exists. Please log in instead.' });
    }

    if (purpose === 'login' && !existingUser) {
      return res.status(404).json({ ok: false, error: 'No account found with this email. Please sign up first.' });
    }

    const otpCode = generateOtp();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    const id = 'otp_' + crypto.randomUUID();

    const payload = JSON.stringify({ name, role, organization });

    // Invalidate prior unused OTPs for this email & purpose
    db.prepare('UPDATE otp_verifications SET verified = 1 WHERE email = ? AND purpose = ?').run(normalizedEmail, purpose);

    db.prepare(`
      INSERT INTO otp_verifications (id, email, otp_code, purpose, payload, expires_at, verified)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(id, normalizedEmail, otpCode, purpose, payload, expiresAt);

    const emailResult = await sendOtpEmail({
      toEmail: normalizedEmail,
      otpCode,
      purpose,
      userName: name || (existingUser ? existingUser.name : 'Sahakara Member'),
    });

    return res.json({
      ok: true,
      message: `Verification code sent to ${normalizedEmail}`,
      expiresInMinutes: 10,
      devOtp: emailResult.devOtp || undefined, // Provided in development for instant auto-testing
      mode: emailResult.mode,
    });
  } catch (err) {
    console.error('Error in send-otp:', err);
    res.status(500).json({ ok: false, error: 'Failed to generate and dispatch OTP' });
  }
});

/**
 * POST /api/auth/verify-and-register
 * Body: { email, otp, password, name, role, organization, phone, zone }
 */
router.post('/verify-and-register', async (req, res) => {
  try {
    const { email, otp, password, name, role = 'donor', organization, phone, zone } = req.body;

    if (!email || !otp || !password || !name) {
      return res.status(400).json({ ok: false, error: 'Email, OTP, Name, and Password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Verify OTP record
    const otpRecord = db.prepare(`
      SELECT * FROM otp_verifications
      WHERE email = ? AND otp_code = ? AND purpose = 'signup' AND verified = 0
      ORDER BY created_at DESC LIMIT 1
    `).get(normalizedEmail, otp.trim());

    if (!otpRecord) {
      return res.status(400).json({ ok: false, error: 'Invalid verification code' });
    }

    if (Date.now() > otpRecord.expires_at) {
      return res.status(400).json({ ok: false, error: 'Verification code has expired. Please request a new one.' });
    }

    // Mark OTP as verified
    db.prepare('UPDATE otp_verifications SET verified = 1 WHERE id = ?').run(otpRecord.id);

    // Hash password
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);
    const userId = 'usr_' + crypto.randomUUID();

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, organization, phone, zone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, name.trim(), normalizedEmail, passwordHash, role, organization || null, phone || null, zone || 'Central');

    const user = {
      id: userId,
      name: name.trim(),
      email: normalizedEmail,
      role,
      organization: organization || null,
      phone: phone || null,
      zone: zone || 'Central',
    };

    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      ok: true,
      message: 'Account created and verified successfully',
      token,
      user,
    });
  } catch (err) {
    console.error('Error in verify-and-register:', err);
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ ok: false, error: 'An account with this email already exists' });
    }
    res.status(500).json({ ok: false, error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/signup
 * Direct email + password signup for donor/shelter/driver accounts
 * Body: { email, password, name, role, organization, phone, zone }
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name, role = 'donor', organization, phone, zone } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ ok: false, error: 'Email, Name, and Password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      return res.status(409).json({ ok: false, error: 'An account with this email already exists. Please sign in.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);
    const userId = 'usr_' + crypto.randomUUID();

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, organization, phone, zone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, name.trim(), normalizedEmail, passwordHash, role, organization || null, phone || null, zone || 'Central');

    const user = {
      id: userId,
      name: name.trim(),
      email: normalizedEmail,
      role,
      organization: organization || null,
      phone: phone || null,
      zone: zone || 'Central',
    };

    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      ok: true,
      message: 'Account created successfully',
      token,
      user,
    });
  } catch (err) {
    console.error('Error in signup:', err);
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ ok: false, error: 'An account with this email already exists' });
    }
    res.status(500).json({ ok: false, error: 'Account creation failed' });
  }
});

/**
 * POST /api/auth/login-password
 * Body: { email, password }
 */
router.post('/login-password', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'Email and password are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);

    if (!userRow) {
      return res.status(401).json({ ok: false, error: 'Invalid email or password' });
    }

    const isMatch = bcrypt.compareSync(password, userRow.password_hash);
    if (!isMatch) {
      return res.status(401).json({ ok: false, error: 'Invalid email or password' });
    }

    const user = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      role: userRow.role,
      organization: userRow.organization,
      phone: userRow.phone,
      zone: userRow.zone,
    };

    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      ok: true,
      message: 'Logged in successfully',
      token,
      user,
    });
  } catch (err) {
    console.error('Error in login-password:', err);
    res.status(500).json({ ok: false, error: 'Authentication failed' });
  }
});

/**
 * POST /api/auth/login-otp
 * Body: { email, otp }
 */
router.post('/login-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ ok: false, error: 'Email and OTP code are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const otpRecord = db.prepare(`
      SELECT * FROM otp_verifications
      WHERE email = ? AND otp_code = ? AND purpose = 'login' AND verified = 0
      ORDER BY created_at DESC LIMIT 1
    `).get(normalizedEmail, otp.trim());

    if (!otpRecord) {
      return res.status(400).json({ ok: false, error: 'Invalid OTP code' });
    }

    if (Date.now() > otpRecord.expires_at) {
      return res.status(400).json({ ok: false, error: 'OTP code expired. Please request a new code.' });
    }

    // Mark verified
    db.prepare('UPDATE otp_verifications SET verified = 1 WHERE id = ?').run(otpRecord.id);

    const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
    if (!userRow) {
      return res.status(404).json({ ok: false, error: 'User record not found' });
    }

    const user = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      role: userRow.role,
      organization: userRow.organization,
      phone: userRow.phone,
      zone: userRow.zone,
    };

    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      ok: true,
      message: 'Logged in successfully via OTP',
      token,
      user,
    });
  } catch (err) {
    console.error('Error in login-otp:', err);
    res.status(500).json({ ok: false, error: 'OTP login failed' });
  }
});

/**
 * GET /api/auth/me
 * Headers: Authorization: Bearer <token>
 */
router.get('/me', authenticateToken, (req, res) => {
  const userRow = db.prepare('SELECT id, name, email, role, organization, phone, zone, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!userRow) {
    return res.status(404).json({ ok: false, error: 'User not found' });
  }
  res.json({ ok: true, user: userRow });
});

/**
 * GET /api/auth/demo-personas
 * Returns pre-configured demo personas with 1-click credentials for immediate testing
 */
router.get('/demo-personas', (req, res) => {
  res.json({
    ok: true,
    personas: [
      {
        role: 'donor',
        label: 'Commercial Donor (Restaurant/Hotel)',
        name: 'Rajesh Sharma',
        email: 'donor@sahakara.org',
        password: 'Sahakara@123',
        org: 'Jaipur Marriott & Banquet',
      },
      {
        role: 'shelter',
        label: 'Shelter Coordinator (NGO)',
        name: 'Anjali Sen',
        email: 'shelter@sahakara.org',
        password: 'Sahakara@123',
        org: 'Aasha Shelter Home',
      },
      {
        role: 'driver',
        label: 'Volunteer Rescue Driver',
        name: 'Kabir Verma',
        email: 'driver@sahakara.org',
        password: 'Sahakara@123',
        org: 'Sahakara Express Fleet',
      },
    ],
  });
});

module.exports = router;
