import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { connectDb } from './startup/connectDb.js';
import { seedAdmin } from './startup/seedAdmin.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

import { authRoutes } from './routes/authRoutes.js';
import { adminRoutes } from './routes/adminRoutes.js';
import { studentRoutes } from './routes/studentRoutes.js';

const app = express();

const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Same Wi‑Fi / private LAN (Vite on another host:port) without editing .env when DHCP changes IP */
function isPrivateLanOrigin(origin) {
  try {
    const { hostname } = new URL(origin);
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    const m = /^172\.(\d{1,3})\./.exec(hostname);
    if (m) {
      const n = Number(m[1]);
      if (n >= 16 && n <= 31) return true;
    }
    return false;
  } catch {
    return false;
  }
}

app.use(helmet());
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (corsOrigins.length === 0) return cb(null, true);
      if (corsOrigins.includes(origin)) return cb(null, true);
      if (process.env.NODE_ENV === 'development' && isPrivateLanOrigin(origin)) {
        return cb(null, true);
      }
      return cb(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || '0.0.0.0';

await connectDb();
await seedAdmin();

app.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://${HOST}:${PORT}`);
});

