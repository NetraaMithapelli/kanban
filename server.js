require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { OAuth2Client } = require('google-auth-library');

const { MONGODB_URI, JWT_SECRET, GOOGLE_CLIENT_ID = '' } = process.env;
const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production';
if (!MONGODB_URI || !JWT_SECRET || JWT_SECRET.length < 16) {
  console.error('Set MONGODB_URI and a JWT_SECRET (16+ chars) in your .env file.');
  process.exit(1);
}

/* ---------- models ---------- */
const User = mongoose.model('User', new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, trim: true, maxlength: 24, default: '' },
  passwordHash: { type: String, default: null },   // null for Google-only accounts
  googleId: { type: String, default: null, index: true },
}, { timestamps: true }));

const Task = mongoose.model('Task', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  t: { type: String, required: true, trim: true, maxlength: 120 },
  d: { type: String, trim: true, maxlength: 300, default: '' },
  c: { type: String, enum: ['todo', 'doing', 'done'], default: 'todo' },
  p: { type: String, enum: ['high', 'med', 'low'], default: 'med' },
}, { timestamps: true }));

/* ---------- helpers ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const publicUser = u => ({ id: u.id, email: u.email, name: u.name });
const publicTask = t => ({ id: t.id, t: t.t, d: t.d || '', c: t.c, p: t.p });

function setSession(res, user) {
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('session', token, {
    httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: 7 * 24 * 3600 * 1000,
  });
}

async function requireAuth(req, res, next) {
  try {
    const { sub } = jwt.verify(req.cookies.session || '', JWT_SECRET);
    const user = await User.findById(sub);
    if (!user) throw new Error('no user');
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Please log in.' });
  }
}

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

/* ---------- app ---------- */
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
const G = 'https://accounts.google.com/gsi/';
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'", "'unsafe-inline'", G + 'client'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', G + 'style'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:', 'https:'],
      'connect-src': ["'self'", G],
      'frame-src': [G],
      'form-action': ["'self'"],
      'upgrade-insecure-requests': PROD ? [] : null,   // keep plain http working on localhost
    },
  },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // needed for the Google popup
}));
app.get('/health', (req, res) => {
  const up = mongoose.connection.readyState === 1;
  res.status(up ? 200 : 503).json({ ok: up });
});
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' },
});

app.get('/api/config', (req, res) => res.json({ googleClientId: GOOGLE_CLIENT_ID }));

app.post('/api/auth/signup', authLimiter, wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const name = String(req.body.name || '').trim().slice(0, 24);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'That email doesn’t look right.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password needs 8+ characters.' });
  if (password.length > 72) return res.status(400).json({ error: 'Password is too long (72 max).' });
  if (await User.exists({ email })) return res.status(409).json({ error: 'That email already has an account. Log in instead.' });
  const user = await User.create({ email, name, passwordHash: await bcrypt.hash(password, 12) });
  setSession(res, user);
  res.status(201).json({ user: publicUser(user) });
}));

app.post('/api/auth/login', authLimiter, wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = await User.findOne({ email });
  if (user && !user.passwordHash) {
    return res.status(401).json({ error: 'This account uses Google sign-in. Please use the Google button.' });
  }
  const ok = user && await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Wrong email or password.' });
  setSession(res, user);
  res.json({ user: publicUser(user) });
}));

const gClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
app.post('/api/auth/google', authLimiter, wrap(async (req, res) => {
  if (!gClient) return res.status(501).json({ error: 'Google sign-in isn’t set up on this server.' });
  let payload;
  try {
    const ticket = await gClient.verifyIdToken({ idToken: String(req.body.credential || ''), audience: GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'Google sign-in failed.' });
  }
  if (!payload.email || !payload.email_verified) return res.status(401).json({ error: 'Your Google email isn’t verified.' });
  const email = payload.email.toLowerCase();
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({ email, name: (payload.given_name || '').slice(0, 24), googleId: payload.sub });
  } else if (!user.googleId) {
    user.googleId = payload.sub;
    await user.save();
  }
  setSession(res, user);
  res.json({ user: publicUser(user) });
}));

app.post('/api/auth/logout', (req, res) => { res.clearCookie('session'); res.json({ ok: true }); });
app.get('/api/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

app.get('/api/tasks', requireAuth, wrap(async (req, res) => {
  const tasks = await Task.find({ user: req.user.id }).sort({ createdAt: 1 });
  res.json({ tasks: tasks.map(publicTask) });
}));

app.post('/api/tasks', requireAuth, wrap(async (req, res) => {
  const t = String(req.body.t || '').trim();
  const p = ['high', 'med', 'low'].includes(req.body.p) ? req.body.p : 'med';
  if (!t) return res.status(400).json({ error: 'Task can’t be empty.' });
  const d = String(req.body.d || '').trim().slice(0, 300);
  const task = await Task.create({ user: req.user.id, t: t.slice(0, 120), d, p });
  res.status(201).json({ task: publicTask(task) });
}));

app.post('/api/tasks/clear-done', requireAuth, wrap(async (req, res) => {
  await Task.deleteMany({ user: req.user.id, c: 'done' });
  res.json({ ok: true });
}));

app.patch('/api/tasks/:id', requireAuth, wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  const update = {};
  if (['todo', 'doing', 'done'].includes(req.body.c)) update.c = req.body.c;
  const task = await Task.findOneAndUpdate({ _id: req.params.id, user: req.user.id }, update, { new: true });
  if (!task) return res.status(404).json({ error: 'Not found.' });
  res.json({ task: publicTask(task) });
}));

app.delete('/api/tasks/:id', requireAuth, wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  await Task.deleteOne({ _id: req.params.id, user: req.user.id });
  res.json({ ok: true });
}));

app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === 11000) return res.status(409).json({ error: 'That email already has an account.' });
  res.status(500).json({ error: 'Server error. Please try again.' });
});

mongoose.connect(MONGODB_URI).then(() => {
  app.listen(PORT, () => console.log('Daily board running on http://localhost:' + PORT));
}).catch(err => { console.error('MongoDB connection failed:', err.message); process.exit(1); });
