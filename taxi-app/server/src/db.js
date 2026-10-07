/**
 * db.js — قاعدة البيانات (SQLite للتطوير)
 * ─────────────────────────────────────────
 * ملاحظة للإنتاج: نفس المخطط يعمل على PostgreSQL/PostGIS.
 * كل الاستعلامات هنا معزولة بهاد الملف لتسهيل التبديل لاحقاً.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'taxi.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* ═══════════ المخطط (Schema) ═══════════ */
db.exec(`
-- المستخدمون: راكب / كابتن / أدمن
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  phone         TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL DEFAULT '',
  role          TEXT    NOT NULL DEFAULT 'rider',   -- rider | driver | admin
  email         TEXT,
  photo_url     TEXT,
  rating_sum    REAL    NOT NULL DEFAULT 0,
  rating_count  INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,
  is_blocked    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- أكواد التحقق OTP (بالتطوير: الكود ثابت 1234)
CREATE TABLE IF NOT EXISTS otps (
  phone       TEXT PRIMARY KEY,
  code        TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0
);

-- مركبات الكباتن
CREATE TABLE IF NOT EXISTS vehicles (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_id  INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  make       TEXT NOT NULL DEFAULT '',
  model      TEXT NOT NULL DEFAULT '',
  year       INTEGER,
  color      TEXT NOT NULL DEFAULT '',
  plate      TEXT NOT NULL DEFAULT '',
  category   TEXT NOT NULL DEFAULT 'economy',  -- economy | comfort | xl
  seats      INTEGER NOT NULL DEFAULT 4,
  is_active  INTEGER NOT NULL DEFAULT 1
);

-- حالة الكابتن اللحظية (أونلاين/أوفلاين + آخر موقع)
CREATE TABLE IF NOT EXISTS driver_status (
  driver_id   INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  is_online   INTEGER NOT NULL DEFAULT 0,
  lat         REAL,
  lng         REAL,
  heading     REAL DEFAULT 0,
  speed_kmh   REAL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- الرحلات
CREATE TABLE IF NOT EXISTS rides (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  code              TEXT NOT NULL UNIQUE,               -- رقم مقروء مثل R-1042
  rider_id          INTEGER NOT NULL REFERENCES users(id),
  driver_id         INTEGER REFERENCES users(id),
  status            TEXT NOT NULL DEFAULT 'searching',
  -- searching | accepted | arrived | started | completed | cancelled | no_drivers
  category          TEXT NOT NULL DEFAULT 'economy',
  pickup_lat        REAL NOT NULL,
  pickup_lng        REAL NOT NULL,
  pickup_address    TEXT NOT NULL DEFAULT '',
  dropoff_lat       REAL NOT NULL,
  dropoff_lng       REAL NOT NULL,
  dropoff_address   TEXT NOT NULL DEFAULT '',
  distance_km       REAL NOT NULL DEFAULT 0,
  duration_min      REAL NOT NULL DEFAULT 0,
  surge_multiplier  REAL NOT NULL DEFAULT 1.0,
  fare_estimate     REAL NOT NULL DEFAULT 0,
  fare_final        REAL,
  payment_method    TEXT NOT NULL DEFAULT 'cash',        -- cash | card | wallet
  cancel_reason     TEXT,
  cancelled_by      TEXT,                                -- rider | driver | system
  requested_at      TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at       TEXT,
  arrived_at        TEXT,
  started_at        TEXT,
  completed_at      TEXT,
  cancelled_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_rides_status ON rides(status);
CREATE INDEX IF NOT EXISTS idx_rides_rider  ON rides(rider_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_rides_driver ON rides(driver_id, requested_at DESC);

-- مسار الرحلة (لرسم الخط على الخريطة + حساب المسافة الفعلية)
CREATE TABLE IF NOT EXISTS ride_track (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ride_id   INTEGER NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  lat       REAL NOT NULL,
  lng       REAL NOT NULL,
  at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_track_ride ON ride_track(ride_id, id);

-- التقييمات
CREATE TABLE IF NOT EXISTS ratings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ride_id       INTEGER NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  from_user_id  INTEGER NOT NULL REFERENCES users(id),
  to_user_id    INTEGER NOT NULL REFERENCES users(id),
  stars         INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ride_id, from_user_id)
);

-- المحفظة + العمليات المالية
CREATE TABLE IF NOT EXISTS wallet_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  ride_id     INTEGER REFERENCES rides(id),
  type        TEXT NOT NULL,        -- earning | commission | topup | refund | payout
  amount      REAL NOT NULL,        -- موجب = إضافة، سالب = خصم
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- إعدادات التسعير والنظام (قابلة للتعديل من لوحة الإدارة)
CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- عروض الأسعار المسبقة (لعرض 3 خيارات للراكب قبل الطلب)
CREATE TABLE IF NOT EXISTS fare_quotes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rider_id    INTEGER REFERENCES users(id),
  category    TEXT NOT NULL,
  distance_km REAL NOT NULL,
  duration_min REAL NOT NULL,
  price       REAL NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

/* ═══════════ الإعدادات الافتراضية ═══════════ */
const DEFAULT_SETTINGS = {
  currency: 'USD',
  currency_symbol: '$',
  base_fare: '2.00',          // أجرة البداية
  per_km: '0.90',             // لكل كيلومتر
  per_min: '0.15',            // لكل دقيقة
  min_fare: '3.50',           // الحد الأدنى للأجرة
  commission_pct: '20',       // عمولة المنصة %
  search_radius_km: '5',      // نطاق البحث عن كابتن
  search_timeout_sec: '45',   // مهلة البحث قبل ما يتحول لـ no_drivers
  cancel_fee: '1.50',         // رسوم إلغاء بعد قبول الكابتن
  surge_multiplier: '1.0',    // مضاعف الطلب
  city_center_lat: '37.3541', // مركز المدينة الافتراضي (Santa Clara)
  city_center_lng: '-121.9552',
  category_multipliers: JSON.stringify({ economy: 1.0, comfort: 1.35, xl: 1.8 }),
};

export const settings = {
  get(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : DEFAULT_SETTINGS[key];
  },
  getNum(key) { return Number(this.get(key)); },
  getJSON(key) { try { return JSON.parse(this.get(key)); } catch { return null; } },
  set(key, value) {
    db.prepare(`INSERT INTO settings(key, value) VALUES(?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, String(value));
  },
  all() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  },
  ensureDefaults() {
    const tx = db.transaction(() => {
      for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
        if (!db.prepare('SELECT 1 FROM settings WHERE key = ?').get(k)) this.set(k, v);
      }
    });
    tx();
  },
};
settings.ensureDefaults();

/* ═══════════ دوال مساعدة ═══════════ */
export const nowISO = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export function computeRating(row) {
  if (!row || !row.rating_count) return 5.0;
  return Math.round((row.rating_sum / row.rating_count) * 10) / 10;
}

/** يحوّل صف مستخدم لشكل نظيف للـ API (بدون حقول حساسة) */
export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    phone: u.phone,
    name: u.name,
    role: u.role,
    photoUrl: u.photo_url,
    rating: computeRating(u),
    ratingCount: u.rating_count,
    isBlocked: !!u.is_blocked,
  };
}

export default db;
