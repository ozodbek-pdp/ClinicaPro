import express from 'express';
import path from 'path';
import pkg from 'pg';
import compression from 'compression';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDocs, getDoc, setDoc, deleteDoc, updateDoc, query, where, limit, orderBy } from 'firebase/firestore';
import PDFDocument from 'pdfkit';

const { Pool } = pkg;

dotenv.config();

let __filename = null;
let __dirname = null;
try {
  __filename = fileURLToPath(import.meta.url);
  __dirname = path.dirname(__filename);
} catch (e) {
  // When bundled to CommonJS `import.meta` may be undefined. Fall back to
  // `process.argv[1]` (the executed script path) or `process.cwd()`.
  __filename = (process && process.argv && process.argv[1]) ? process.argv[1] : null;
  __dirname = __filename ? path.dirname(__filename) : process.cwd();
}

// Read app metadata (clinic contact info)
const metadataPath = path.join(process.cwd(), 'metadata.json');
let clinicMeta = {};
try {
  if (fs.existsSync(metadataPath)) {
    clinicMeta = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) || {};
    console.log('Loaded clinic metadata from', metadataPath);
  }
} catch (e) {
  console.warn('Failed to read metadata.json:', e.message);
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(compression());
app.use(express.json({ limit: '20mb' }));

// Serve uploaded files
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  try { fs.mkdirSync(uploadsDir); } catch (e) { /* ignore */ }
}
app.use('/uploads', express.static(uploadsDir));

// Server-side spravka PDF generator
app.get('/api/spravka', async (req, res) => {
  try {
    const patientId = req.query.patientId || req.headers['x-user-id'];
    if (!patientId) return res.status(400).send('patientId required');

    // Authorization: allow admin, doctors, reception, or the patient themself
    const requesterId = req.headers['x-user-id'];
    const requesterRole = (req.headers['x-user-role'] || '').toString();
    const allowedRoles = ['admin', 'doctor', 'reception'];
    if (!(allowedRoles.includes(requesterRole) || (requesterId && requesterId === patientId))) {
      return res.status(403).send('Forbidden');
    }

    let user = null;
    if (firestoreDb) {
      try {
        const d = await getDoc(doc(firestoreDb, 'users', patientId));
        if (d.exists()) user = { id: d.id, ...d.data() };
      } catch (e) {
        console.warn('Firestore user fetch error (continuing fallback):', e.message);
      }
    }
    if (!user && pool) {
      try {
        const r = await pool.query('SELECT * FROM users WHERE id = $1', [patientId]);
        if (r.rows.length) user = r.rows[0];
      } catch (e) {
        console.warn('Postgres user fetch error (continuing fallback):', e.message);
      }
    }
    if (!user) {
      user = memoryDb.users.find(u => u.id === patientId) || null;
    }

    if (!user) return res.status(404).send('Patient not found');

    // Fetch diagnoses
    let diagnoses = [];
    if (firestoreDb) {
      try {
        const snaps = await getDocs(query(collection(firestoreDb, 'diagnoses'), where('patient_id', '==', patientId)));
        snaps.forEach(s => diagnoses.push({ id: s.id, ...s.data() }));
      } catch (e) {
        console.warn('Firestore diagnoses fetch error (continuing fallback):', e.message);
      }
    }
    if (!diagnoses.length && pool) {
      try {
        const r = await pool.query('SELECT * FROM diagnoses WHERE patient_id = $1 ORDER BY created_at DESC', [patientId]);
        diagnoses = r.rows;
      } catch (e) {
        console.warn('Postgres diagnoses fetch error (continuing fallback):', e.message);
      }
    }
    if (!diagnoses.length) {
      diagnoses = (memoryDb.diagnoses || []).filter(d => d.patient_id === patientId);
    }

    res.setHeader('Content-Type', 'application/pdf');
    const filename = `Klinika_Ma'lumotnoma_${(user.last_name || 'Bemor')}.pdf`;
    // sanitize filename for filesystem
    const filenameSafe = filename.replace(/["]+/g, '').replace(/\s+/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameSafe}"`);

    const pdfDoc = new PDFDocument({ margin: 48, size: 'A4' });

    // Page numbering and nicer footers
    let pageNumber = 1;
    const drawFooter = () => {
      const bottomY = pdfDoc.page.height - 50;
      pdfDoc.save();
      pdfDoc.strokeColor('#e6e7eb').lineWidth(0.5).moveTo(40, bottomY + 6).lineTo(pdfDoc.page.width - 40, bottomY + 6).stroke();
      pdfDoc.fillColor('#6b7280').font('Helvetica-Oblique').fontSize(9);
      // left page number
      pdfDoc.text(`Sahifa ${pageNumber}`, 48, bottomY, { lineBreak: false });
      // right creation timestamp (compute width to place it without wrapping)
      const rightText = `Yaratildi: ${new Date().toLocaleString()}`;
      const tw = pdfDoc.widthOfString(rightText);
      pdfDoc.text(rightText, pdfDoc.page.width - 48 - tw, bottomY, { lineBreak: false });
      pdfDoc.restore();
    };
    pdfDoc.on('pageAdded', () => { pageNumber += 1; drawFooter(); });

    // save a copy to uploads for consistency/history
    const savedPath = path.join(uploadsDir, filenameSafe);
    let fileStream = null;
    try {
      fileStream = fs.createWriteStream(savedPath);
      fileStream.on('finish', () => console.log('Saved spravka copy to', savedPath));
      fileStream.on('error', (err) => console.warn('File stream error saving spravka:', err.message));
      pdfDoc.pipe(fileStream);
      console.log('Piping PDF to file stream:', savedPath);
    } catch (e) {
      console.warn('Could not create file stream for saving PDF copy:', e.message);
    }
    // pipe to HTTP response
    pdfDoc.pipe(res);

    // Header block with colored bar and logo/address (from metadata if available)
    const clinicName = clinicMeta.name || "CLINICA PRO";
    const clinicAddress = clinicMeta.contact?.address || clinicMeta.address || "Toshkent shahri";
    const clinicPhone = clinicMeta.contact?.phone || '';
    const clinicEmail = clinicMeta.contact?.email || '';
    pdfDoc.rect(0, 0, pdfDoc.page.width, 80).fill('#0d9488');

    // Draw simple circular logo at left
    const logoX = 60;
    const logoY = 40;
    const logoR = 22;
    pdfDoc.save();
    pdfDoc.circle(logoX, logoY, logoR).fill('#ffffff');
    pdfDoc.circle(logoX, logoY, logoR - 4).fill('#0d9488');
    pdfDoc.fillColor('white').font('Helvetica-Bold').fontSize(14).text('KP', logoX - 10, logoY - 8);
    pdfDoc.restore();

    // Clinic name and address centered
    pdfDoc.fillColor('white').font('Helvetica-Bold').fontSize(20).text(clinicName, 0, 28, { align: 'center' });
    pdfDoc.font('Helvetica').fontSize(9).text(clinicAddress, 0, 50, { align: 'center' });
    // contact details under address
    const contactLine = [clinicPhone, clinicEmail].filter(Boolean).join(' • ');
    if (contactLine) pdfDoc.fontSize(8).text(contactLine, 0, 62, { align: 'center' });
    pdfDoc.fillColor('black');

    // initial footer for page 1 (will also be drawn on pageAdded)
    drawFooter();

    // Patient info card
    const startY = 90;
    pdfDoc.roundedRect(40, startY - 6, pdfDoc.page.width - 80, 80, 6).stroke('#e5e7eb');
    pdfDoc.fontSize(12).font('Helvetica-Bold').text('Bemor ma\'lumotlari', 50, startY);
    pdfDoc.font('Helvetica').fontSize(11);
    pdfDoc.text(`F.I.SH: ${(user.last_name || '')} ${(user.first_name || '')}`, 50, startY + 18);
    pdfDoc.text(`Tug'ilgan sana: ${user.birth_date || '-'}`, 50, startY + 36);
    pdfDoc.text(`Telefon: ${user.phone || '-'}`, 300, startY + 18);
    pdfDoc.text(`Manzil: ${user.address || '-'}`, 300, startY + 36);

    // Move below patient box
    let y = startY + 110;

    pdfDoc.moveTo(40, y - 6).lineTo(pdfDoc.page.width - 40, y - 6).stroke('#e6e7eb');

    // Diagnoses
    pdfDoc.fontSize(14).font('Helvetica-Bold').text('Tashxislar', 50, y);
    y += 22;
    pdfDoc.font('Helvetica').fontSize(11);
    if (!diagnoses || diagnoses.length === 0) {
      pdfDoc.text('Hozirda hech qanday tashxis topilmadi.', 50, y);
      y += 18;
    } else {
      diagnoses.forEach((d, i) => {
        if (y > pdfDoc.page.height - 120) { pdfDoc.addPage(); y = 60; }
        const dateStr = d.created_at ? new Date(d.created_at).toLocaleDateString() : '-';
        pdfDoc.font('Helvetica-Bold').text(`${i + 1}. Sana: ${dateStr}`, 50, y);
        y += 16;
        pdfDoc.font('Helvetica').text(d.description || '-', 60, y, { width: pdfDoc.page.width - 120 });
        const consumed = pdfDoc.y;
        y = consumed + 12;
      });
    }

    // Footer: seal and generation info
    if (y > pdfDoc.page.height - 140) { pdfDoc.addPage(); y = 80; }
    const footerY = Math.min(pdfDoc.page.height - 80, y + 20);
    pdfDoc.roundedRect(pdfDoc.page.width - 170, footerY - 10, 120, 60, 6).stroke('#0d9488');
    pdfDoc.font('Helvetica-Bold').fontSize(9).text('TASDIQLANDI', pdfDoc.page.width - 110, footerY + 6, { align: 'center' });

    pdfDoc.font('Helvetica-Oblique').fontSize(9).fillColor('#6b7280').text(`Yaratildi: ${new Date().toLocaleString()}`, 50, pdfDoc.page.height - 60);

    pdfDoc.end();
  } catch (err) {
    console.error('spravka error:', err);
    res.status(500).send('PDF generation error');
  }
});

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  try { fs.mkdirSync(logsDir); } catch (e) { /* ignore */ }
}

function logUnauthorizedDiagnosis(action, details) {
  try {
    const out = {
      ts: new Date().toISOString(),
      action,
      ...details
    };
    fs.appendFileSync(path.join(logsDir, 'unauthorized_diagnoses.log'), JSON.stringify(out) + "\n", 'utf8');
  } catch (e) {
    console.warn('Failed to write unauthorized log:', e.message);
  }
}


// Initialize Firebase Config
let firebaseApp = null;
let firestoreDb = null;

try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    firebaseApp = initializeApp(firebaseConfig);
    firestoreDb = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
    console.log("Firebase Firestore initialized successfully as the primary database.");
  }
} catch (err) {
  console.error("Firebase config read/init error:", err.message);
}

// Initialize Postgres Pool
let pool = null;

if (process.env.DATABASE_URL) {
  try {
    // Basic validation of connection string format
    new URL(process.env.DATABASE_URL);
    
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 5000,
      query_timeout: 4000,
      max: 15
    });
    console.log("Postgres Pool initialized successfully.");
  } catch (err) {
    console.error("Invalid DATABASE_URL configuration. Falling back to memory database.", err.message);
    pool = null;
  }
} else {
  console.log("DATABASE_URL is not set. Using in-memory fallback database.");
}

const DATA_FILE = path.join(process.cwd(), 'db_fallback.json');

// In-memory fallback dataset
let memoryDb = {
  users: [
    { id: 'a1a1a1a1-1111-1111-1111-111111111111', first_name: 'Asosiy', last_name: 'Admin', email: 'admin@klinika.uz', password: '123', role: 'admin', specialty: null, created_at: new Date().toISOString() },
    { id: 'b2b2b2b2-2222-2222-2222-222222222222', first_name: 'Zahro', last_name: 'Qabulxona', email: 'reception@klinika.uz', password: '123', role: 'reception', specialty: null, created_at: new Date().toISOString() },
    { id: 'c3c3c3c3-3333-3333-3333-333333333333', first_name: 'Ali', last_name: 'Qodirov', email: 'ali@klinika.uz', password: '123', role: 'doctor', specialty: 'Kardiolog', room_number: '101', created_at: new Date().toISOString() },
    { id: 'd4d4d4d4-4444-4444-4444-444444444444', first_name: 'Madina', last_name: 'Karimova', email: 'madina@klinika.uz', password: '123', role: 'doctor', specialty: 'Nevropatolog', room_number: '102', created_at: new Date().toISOString() },
    { id: 'e5e5e5e5-5555-5555-5555-555555555555', first_name: 'Toshmat', last_name: 'Eshmatov', email: 'toshmat@gmail.com', password: '123', role: 'patient', specialty: null, created_at: new Date().toISOString() },
    { id: 'f6f6f6f6-6666-6666-6666-666666666666', first_name: 'Gulnoza', last_name: 'Rahmatova', email: 'gulnoza@gmail.com', password: '123', role: 'patient', specialty: null, created_at: new Date().toISOString() },
    { id: '3c634a8b-1bc9-494c-9058-a577908cc740', first_name: 'Ozodbek', last_name: 'Ahmedov', email: null, password: '123456', role: 'patient', phone: '+998976667466', birth_date: '2026-05-15', address: 'Toshkent', bio: '', status: 'active', created_at: new Date().toISOString() }
  ],
  diagnoses: [
    { id: 'a0a0a0a0-bbbb-cccc-dddd-111122223333', patient_id: 'e5e5e5e5-5555-5555-5555-555555555555', doctor_id: 'c3c3c3c3-3333-3333-3333-333333333333', description: 'Yurak ritmining buzilishi. EKG natijalari qoniqarsiz.', treatment_start_date: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'b0b0b0b0-bbbb-cccc-dddd-111122223333', patient_id: 'f6f6f6f6-6666-6666-6666-666666666666', doctor_id: 'd4d4d4d4-4444-4444-4444-444444444444', description: 'Bosh og\'rig\'i va holsizlik. Nevrologik ko\'rik tayinlandi.', treatment_start_date: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  ],
  rooms: [
    { id: 'r1', room_number: '101', specialty: 'Kardiolog' },
    { id: 'r2', room_number: '102', specialty: 'Nevropatolog' },
    { id: 'r3', room_number: '123', specialty: 'Tish shifokori' },
    { id: 'r4', room_number: '124', specialty: 'Tish shifokori' },
    { id: 'r5', room_number: '201', specialty: 'Oftalmolog' },
    { id: 'r6', room_number: '202', specialty: 'Pediatr' }
  ]
};

if (fs.existsSync(DATA_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (saved.users) memoryDb.users = saved.users;
    if (saved.diagnoses) memoryDb.diagnoses = saved.diagnoses;
    if (saved.rooms) memoryDb.rooms = saved.rooms;
  } catch(e) {
    console.error("Failed to read fallback DB from local JSON");
  }
}

function persistDb() {
  if (!pool) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(memoryDb, null, 2), 'utf8');
  }
}

async function initDB() {
  if (firestoreDb) {
    try {
      console.log("Initializing Firestore database and checking seeds...");
      const usersSnap = await getDocs(query(collection(firestoreDb, 'users'), limit(1)));
      if (usersSnap.empty) {
        console.log("Firestore 'users' collection is empty. Seeding default clinic data...");
        // Seed users
        for (const u of memoryDb.users) {
          const userDoc = { ...u };
          // For Firestore, remove empty / undefined fields
          for (const key of Object.keys(userDoc)) {
            if (userDoc[key] === undefined) {
              delete userDoc[key];
            }
          }
          await setDoc(doc(firestoreDb, 'users', u.id), userDoc);
        }
        // Seed rooms
        for (const r of memoryDb.rooms) {
          await setDoc(doc(firestoreDb, 'rooms', r.id), r);
        }
        // Seed diagnoses
        for (const d of memoryDb.diagnoses) {
          await setDoc(doc(firestoreDb, 'diagnoses', d.id), d);
        }
        console.log("Firestore successfully seeded with default data.");
      } else {
        console.log("Firestore already has data. Seeding is skipped.");
      }
    } catch (err) {
      console.warn("Firestore initialization or seeding warning:", err.message);
    }
    return;
  }

  if (!pool) return;
  try {
    // Test connection first
    await pool.query('SELECT 1');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        email VARCHAR(255) UNIQUE,
        password VARCHAR(255) DEFAULT '123456',
        phone VARCHAR(50),
        birth_date DATE,
        gender VARCHAR(20),
        address TEXT,
        bio TEXT,
        icd_code VARCHAR(50),
        room_number VARCHAR(100),
        role VARCHAR(50) DEFAULT 'patient',
        specialty VARCHAR(100),
        resume_text TEXT,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Add password column if it doesn't exist (handle legacy DB)
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'password') THEN
          ALTER TABLE users ADD COLUMN password VARCHAR(255) DEFAULT '123456';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone') THEN
          ALTER TABLE users ADD COLUMN phone VARCHAR(50);
          ALTER TABLE users ADD COLUMN birth_date DATE;
          ALTER TABLE users ADD COLUMN gender VARCHAR(20);
          ALTER TABLE users ADD COLUMN address TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'bio') THEN
          ALTER TABLE users ADD COLUMN bio TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'icd_code') THEN
          ALTER TABLE users ADD COLUMN icd_code VARCHAR(50);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'room_number') THEN
          ALTER TABLE users ADD COLUMN room_number VARCHAR(100);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'resume_text') THEN
          ALTER TABLE users ADD COLUMN resume_text TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'status') THEN
          ALTER TABLE users ADD COLUMN status VARCHAR(50) DEFAULT 'active';
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS rooms (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_number VARCHAR(50) UNIQUE NOT NULL,
        specialty VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS diagnoses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
        doctor_id UUID REFERENCES users(id) ON DELETE SET NULL,
        description TEXT,
        treatment_start_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Database tables initialized.");

    // Seed default users to PostgreSQL individually if not exists
    console.log("Checking and seeding default users to PostgreSQL...");
    for (const u of memoryDb.users) {
      try {
        const checkUser = await pool.query("SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)", [u.email]);
        if (checkUser.rows.length === 0) {
          await pool.query(
            "INSERT INTO users (id, first_name, last_name, email, password, role, specialty, status, created_at, phone, room_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (email) DO NOTHING",
            [u.id, u.first_name, u.last_name, u.email, u.password, u.role, u.specialty, 'active', u.created_at, u.phone || null, u.room_number || null]
          );
          console.log(`Successfully seeded default user to PostgreSQL: ${u.email || u.phone}`);
        } else {
          // If Ali or Madina are in postgres, ensure room numbers are synced to legacy rows if missing
          if (u.room_number) {
            await pool.query("UPDATE users SET room_number = $1 WHERE LOWER(email) = LOWER($2) AND room_number IS NULL", [u.room_number, u.email]);
          }
        }
      } catch (seedErr) {
        console.warn(`Failed seeding user ${u.email}:`, seedErr.message);
      }
    }

    // Seed default rooms to PostgreSQL
    const countRoomsRes = await pool.query("SELECT COUNT(*) FROM rooms");
    if (parseInt(countRoomsRes.rows[0].count, 10) === 0) {
      console.log("Seeding default rooms into PostgreSQL...");
      for (const r of memoryDb.rooms) {
        try {
          await pool.query(
            "INSERT INTO rooms (room_number, specialty) VALUES ($1, $2) ON CONFLICT (room_number) DO NOTHING",
            [r.room_number, r.specialty]
          );
        } catch (roomErr) {
          console.warn(`Failed seeding room ${r.room_number}:`, roomErr.message);
        }
      }
    }

    // Seed default diagnoses if empty
    const countDiagRes = await pool.query("SELECT COUNT(*) FROM diagnoses");
    if (parseInt(countDiagRes.rows[0].count, 10) === 0) {
      console.log("Seeding default diagnoses to PostgreSQL...");
      for (const d of memoryDb.diagnoses) {
        try {
          await pool.query(
            "INSERT INTO diagnoses (id, patient_id, doctor_id, description, treatment_start_date, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING",
            [d.id, d.patient_id, d.doctor_id, d.description, d.treatment_start_date, d.created_at, d.updated_at]
          );
        } catch (diagErr) {
          console.warn(`Failed seeding diagnosis ${d.id}:`, diagErr.message);
        }
      }
    }
    
    // Quick migration for missing phones
    await pool.query("UPDATE users SET phone = '+998976667466' WHERE id = '3c634a8b-1bc9-494c-9058-a577908cc740' AND phone IS NULL");
    
  } catch (err) {
    console.error("Failed to initialize database, falling back to memory:", err.message);
    pool = null; // Important: Fallback to memory DB
  }
}

// Helper to generate UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Helper to check for duplicate email/phone
async function checkDuplicateUser(id, email, phone) {
  const cleanEmail = email ? String(email).trim().toLowerCase() : null;
  const phoneDigits = phone ? String(phone).replace(/\D/g, '') : '';

  if (firestoreDb) {
    try {
      const snap = await getDocs(collection(firestoreDb, 'users'));
      let emailDup = false;
      let phoneDup = false;
      snap.forEach(dDoc => {
        const u = dDoc.data();
        if (id && dDoc.id === id) return;
        if (cleanEmail && u.email && String(u.email).trim().toLowerCase() === cleanEmail) {
          emailDup = true;
        }
        if (phoneDigits && u.phone) {
          const uPhoneDigits = String(u.phone).replace(/\D/g, '');
          if (uPhoneDigits === phoneDigits) {
            phoneDup = true;
          }
        }
      });
      if (emailDup) {
        return "Ushbu email bilan ro'yxatdan o'tgan maslahatchi/xodim allaqachon mavjud!";
      }
      if (phoneDup) {
        return "Ushbu telefon raqami bilan ro'yxatdan o'tgan foydalanuvchi allaqachon mavjud!";
      }
      return null;
    } catch (err) {
      console.error("Firestore duplicate check error:", err.message);
    }
  }

  if (!pool) {
    for (const u of memoryDb.users) {
      if (id && u.id === id) continue;
      
      if (cleanEmail && u.email && String(u.email).trim().toLowerCase() === cleanEmail) {
        return "Ushbu email bilan ro'yxatdan o'tgan maslahatchi/xodim allaqachon mavjud!";
      }
      
      if (phoneDigits && u.phone) {
        const uPhoneDigits = String(u.phone).replace(/\D/g, '');
        if (uPhoneDigits === phoneDigits) {
          return "Ushbu telefon raqami bilan ro'yxatdan o'tgan foydalanuvchi allaqachon mavjud!";
        }
      }
    }
    return null;
  }

  // PostgreSQL Unique validation Check
  if (cleanEmail) {
    const emailRes = id
      ? await pool.query("SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2 LIMIT 1", [cleanEmail, id])
      : await pool.query("SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1", [cleanEmail]);
    if (emailRes.rows.length > 0) {
      return "Ushbu email bilan ro'yxatdan o'tgan maslahatchi/xodim allaqachon mavjud!";
    }
  }

  if (phoneDigits) {
    const queryStr = id
      ? `SELECT 1 FROM users WHERE REGEXP_REPLACE(COALESCE(phone::text, ''), '[^0-9]', '', 'g') = $1 AND id <> $2 LIMIT 1`
      : `SELECT 1 FROM users WHERE REGEXP_REPLACE(COALESCE(phone::text, ''), '[^0-9]', '', 'g') = $1 LIMIT 1`;
    const params = id ? [phoneDigits, id] : [phoneDigits];
    const phoneRes = await pool.query(queryStr, params);
    if (phoneRes.rows.length > 0) {
      return "Ushbu telefon raqami bilan ro'yxatdan o'tgan foydalanuvchi allaqachon mavjud!";
    }
  }

  return null;
}

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: firestoreDb ? 'firestore' : (pool ? 'postgres' : 'memory') });
});

// A simple login/auth endpoint
app.post('/api/auth/login', async (req, res) => {
  console.log("Login attempt received:", req.body);
  let { email, password } = req.body;
  
  if (!password) {
    console.log("Login failed: Password missing");
    return res.status(400).json({ error: 'Parol kiritilishi shart' });
  }

  // Trim credentials to prevent issues with copy-paste or trailing spaces
  const cleanEmail = email ? String(email).trim() : '';
  const cleanPassword = password ? String(password).trim() : '';

  if (firestoreDb) {
    try {
      let matchedUser = null;
      if (cleanEmail.includes('@')) {
        const q = query(collection(firestoreDb, 'users'), where('email', '==', cleanEmail.toLowerCase()));
        const snap = await getDocs(q);
        if (!snap.empty) {
          matchedUser = { id: snap.docs[0].id, ...snap.docs[0].data() };
        }
      } else {
        const sPhoneDigits = cleanEmail.replace(/\D/g, '');
        if (sPhoneDigits !== '') {
          const snap = await getDocs(collection(firestoreDb, 'users'));
          snap.forEach(dDoc => {
            const u = dDoc.data();
            if (u.phone) {
              const uPhoneDigits = String(u.phone).replace(/\D/g, '');
              if (uPhoneDigits === sPhoneDigits || 
                  (uPhoneDigits.length >= 9 && sPhoneDigits.length >= 9 && uPhoneDigits.slice(-9) === sPhoneDigits.slice(-9))) {
                matchedUser = { id: dDoc.id, ...u };
              }
            }
          });
        }
      }

      if (!matchedUser) {
        if (cleanEmail.toLowerCase() === 'admin@klinika.uz' && cleanPassword === '123') {
          const newUser = { id: generateUUID(), first_name: 'Admin', last_name: 'User', email: cleanEmail, password: cleanPassword, role: 'admin', created_at: new Date().toISOString() };
          await setDoc(doc(firestoreDb, 'users', newUser.id), newUser);
          return res.json({ user: newUser });
        }
        return res.status(401).json({ error: 'Email/telefon yoki parol noto`g\'ri.' });
      }

      const dbPassword = matchedUser.password ? String(matchedUser.password).trim() : '';
      if (dbPassword !== cleanPassword) {
        return res.status(401).json({ error: 'Email/telefon yoki parol noto`g\'ri.' });
      }
      return res.json({ user: matchedUser });
    } catch (err) {
      console.error("Firestore Auth error:", err);
      return res.status(500).json({ error: 'Tizimga kirishda xatolik yuz berdi: ' + err.message });
    }
  }

  if (!pool) {
    let user = memoryDb.users.find(u => {
      const uEmail = u.email ? String(u.email).trim().toLowerCase() : '';
      const sVal = cleanEmail.toLowerCase();
      
      const pwdMatch = String(u.password).trim() === cleanPassword;
      if (!pwdMatch) return false;

      // Match email if it contains '@'
      if (cleanEmail.includes('@')) {
        return uEmail === sVal;
      } else {
        // Match numbers only for phone comparisons
        const uPhoneDigits = u.phone ? String(u.phone).replace(/\D/g, '') : '';
        const sPhoneDigits = cleanEmail.replace(/\D/g, '');
        if (uPhoneDigits === '' || sPhoneDigits === '') return false;
        return uPhoneDigits === sPhoneDigits || 
          (uPhoneDigits.length >= 9 && sPhoneDigits.length >= 9 && uPhoneDigits.slice(-9) === sPhoneDigits.slice(-9));
      }
    });
    
    if (!user) {
      if (cleanEmail.toLowerCase() === 'admin@klinika.uz' && cleanPassword === '123') {
         user = { id: generateUUID(), first_name: 'Admin', last_name: 'User', email: cleanEmail, password: cleanPassword, role: 'admin', created_at: new Date().toISOString() };
         memoryDb.users.push(user);
         persistDb();
         return res.json({ user });
      }
      return res.status(401).json({ error: 'Email/telefon yoki parol noto`g\'ri.' });
    }
    return res.json({ user });
  }
  
  try {
    let result;
    // Determine database lookup based on input format
    if (cleanEmail.includes('@')) {
      result = await pool.query(
        'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
        [cleanEmail]
      );
    } else {
      const phoneDigits = cleanEmail.replace(/\D/g, '');
      result = await pool.query(
        `SELECT * FROM users WHERE 
           REGEXP_REPLACE(COALESCE(phone::text, ''), '[^0-9]', '', 'g') = $1 
           OR (
             LENGTH(REGEXP_REPLACE(COALESCE(phone::text, ''), '[^0-9]', '', 'g')) >= 9 
             AND LENGTH($1::text) >= 9 
             AND RIGHT(REGEXP_REPLACE(COALESCE(phone::text, ''), '[^0-9]', '', 'g'), 9) = RIGHT($1::text, 9)
           )`,
        [phoneDigits]
      );
    }

    if (result.rows.length === 0) {
      if (cleanEmail.toLowerCase() === 'admin@klinika.uz' && cleanPassword === '123') {
        result = await pool.query(
          "INSERT INTO users (first_name, last_name, email, password, role) VALUES ($1, $2, $3, $4, $5) RETURNING *",
          ['Admin', 'User', cleanEmail, cleanPassword, 'admin']
        );
        return res.json({ user: result.rows[0] });
      }
      return res.status(401).json({ error: 'Email/telefon yoki parol noto`g\'ri.' });
    }
    
    const user = result.rows[0];
    if (String(user.password).trim() !== cleanPassword) {
      return res.status(401).json({ error: 'Email/telefon yoki parol noto`g\'ri.' });
    }
    res.json({ user });
  } catch (err) {
    console.error("Auth login error:", err);
    res.status(500).json({ error: 'Tizimga kirishda xatolik yuz berdi: ' + err.message });
  }
});

app.get('/api/users', async (req, res) => {
  const { role, id } = req.query;
  if (firestoreDb) {
    try {
      const snap = await getDocs(collection(firestoreDb, 'users'));
      let results = [];
      snap.forEach(dDoc => {
        const data = dDoc.data();
        results.push({ id: dDoc.id, ...data, doctorId: data.doctorId || data.doctor_id || null });
      });
      if (role) {
        results = results.filter(u => u.role === role);
      }
      if (id) {
        results = results.filter(u => u.id === id);
      }
      return res.json(results);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (!pool) {
    let result = memoryDb.users;
    if (role) result = result.filter(u => u.role === role);
    if (id) result = result.filter(u => u.id === id);
    return res.json(result.map(u => ({ ...u, doctorId: u.doctorId || u.doctor_id || null })));
  }
  try {
    let query = 'SELECT * FROM users WHERE 1=1';
    let params = [];
    if (role) {
      params.push(role);
      query += ` AND role = $${params.length}`;
    }
    if (id) {
      params.push(id);
      query += ` AND id = $${params.length}`;
    }
    const result = await pool.query(query, params);
    res.json(result.rows.map(row => ({ ...row, doctorId: row.doctor_id || row.doctorId || null })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { first_name, last_name, email, password, role, specialty, phone, birth_date, gender, address, bio, resume_text, status, icd_code, room_number, doctorId } = req.body;
  const cleanUserEmail = (email && String(email).trim() !== "") ? String(email).trim().toLowerCase() : null;
  // Server-side role enforcement:
  // - Reception (`reception`) may only create users with role 'patient'.
  // - Doctors (`doctor`) are not allowed to create users.
  // - Creating non-patient roles (e.g., 'doctor', 'admin') requires an 'admin' header role.
  try {
    const hdrRole = String(req.headers['x-user-role'] || '').toLowerCase();
    const hdrId = String(req.headers['x-user-id'] || '').trim();
    let targetRole = (role || 'patient').toLowerCase();
    let assignedDoctorId = doctorId || null;

    // Doctors are allowed to create ONLY patients; when a doctor creates a patient,
    // automatically assign the doctor as that patient's `doctorId`.
    if (hdrRole === 'doctor') {
      if (targetRole !== 'patient') {
        return res.status(403).json({ error: 'Ruxsat etilmagan: shifokor faqat bemor qo\'sha oladi.' });
      }
      // enforce server-side assignment of doctorId
      assignedDoctorId = hdrId || assignedDoctorId;
    }

    if (hdrRole === 'reception' && targetRole !== 'patient') {
      return res.status(403).json({ error: 'Ruxsat etilmagan: qabul bo\'limi faqat bemorlarni qo\'sha oladi.' });
    }
    if (targetRole !== 'patient' && hdrRole !== 'admin') {
      return res.status(403).json({ error: 'Ruxsat etilmagan: faqat admin yangi shifokor yoki admin hisobini qo\'sha oladi.' });
    }
    // replace doctorId in the request body for downstream usage
    req.body.assignedDoctorId = assignedDoctorId;
  } catch (e) {
    // header parsing failed, continue (will be subject to other validations)
  }
  
  try {
    const dupError = await checkDuplicateUser(null, cleanUserEmail, phone);
    if (dupError) {
      return res.status(400).json({ error: dupError });
    }
  } catch (err) {
    return res.status(500).json({ error: "Xatolik: " + err.message });
  }

  if (firestoreDb) {
    try {
      const newId = generateUUID();
      const user = { 
        id: newId, 
        first_name: first_name || null, 
        last_name: last_name || null, 
        email: cleanUserEmail, 
        password: password || '123456', 
        role: role || 'patient', 
        specialty: specialty || null, 
        phone: phone || null, 
        birth_date: birth_date || null, 
        gender: gender || null, 
        address: address || null, 
        bio: bio || null, 
        resume_text: resume_text || null, 
        status: status || 'active', 
        icd_code: icd_code || null, 
        room_number: room_number || null, 
        doctorId: req.body.assignedDoctorId || doctorId || null,
        doctor_id: req.body.assignedDoctorId || doctorId || null,
        created_at: new Date().toISOString() 
      };
      
      // Clean undefined fields for Firestore
      for (const key of Object.keys(user)) {
        if (user[key] === undefined) {
          delete user[key];
        }
      }

      await setDoc(doc(firestoreDb, 'users', newId), user);
      return res.json(user);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (!pool) {
    const user = { id: generateUUID(), first_name, last_name, email: cleanUserEmail, password, role, specialty, phone, birth_date, gender, address, bio, resume_text, status: status || 'active', icd_code: icd_code || null, room_number: room_number || null, doctorId: req.body.assignedDoctorId || doctorId || null, doctor_id: req.body.assignedDoctorId || doctorId || null, created_at: new Date().toISOString() };
    memoryDb.users.push(user);
    persistDb();
    return res.json(user);
  }
  try {
    const result = await pool.query(
      "INSERT INTO users (first_name, last_name, email, password, role, specialty, phone, birth_date, gender, address, bio, resume_text, status, icd_code, room_number, doctor_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *",
      [first_name, last_name, cleanUserEmail, password, role, specialty, phone || null, birth_date || null, gender || null, address || null, bio || null, resume_text || null, status || 'active', icd_code || null, room_number || null, req.body.assignedDoctorId || doctorId || null]
    );
    res.json({ ...result.rows[0], doctorId: result.rows[0].doctor_id || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rooms Management Web Endpoints
app.get('/api/rooms', async (req, res) => {
  if (firestoreDb) {
    try {
      const snap = await getDocs(collection(firestoreDb, 'rooms'));
      const rooms = [];
      snap.forEach(dDoc => {
        rooms.push({ id: dDoc.id, ...dDoc.data() });
      });
      rooms.sort((a,b) => String(a.room_number || '').localeCompare(String(b.room_number || ''), undefined, { numeric: true }));
      return res.json(rooms);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (!pool) {
    return res.json(memoryDb.rooms || []);
  }
  try {
    const result = await pool.query('SELECT * FROM rooms ORDER BY room_number ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rooms', async (req, res) => {
  // Basic role check: if client provides X-User-Role header and it's 'doctor', disallow
  try {
    const hdrRole = String(req.headers['x-user-role'] || '').toLowerCase();
    if (hdrRole === 'doctor') {
      return res.status(403).json({ error: 'Ruxsat etilmagan: shifokorlar xonalarni qo\'sholmaydi.' });
    }
  } catch (e) {
    // ignore header parsing errors and continue
  }
  const { room_number, specialty } = req.body;
  if (!room_number || !specialty) {
    return res.status(400).json({ error: "Xona raqami va xona ixtisosi kiritilishi shart" });
  }
  const cleanRoomNumber = String(room_number).trim();
  const cleanSpecialty = String(specialty).trim();

  if (firestoreDb) {
    try {
      const snap = await getDocs(collection(firestoreDb, 'rooms'));
      let exists = false;
      snap.forEach(dDoc => {
        if (String(dDoc.data().room_number || '').toLowerCase() === cleanRoomNumber.toLowerCase()) {
          exists = true;
        }
      });
      if (exists) {
        return res.status(400).json({ error: "Ushbu raqamli xona allaqachon mavjud" });
      }
      const newId = generateUUID();
      const newRoom = { id: newId, room_number: cleanRoomNumber, specialty: cleanSpecialty, created_at: new Date().toISOString() };
      await setDoc(doc(firestoreDb, 'rooms', newId), newRoom);
      return res.json(newRoom);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (!pool) {
    const exists = memoryDb.rooms.some(r => String(r.room_number).toLowerCase() === cleanRoomNumber.toLowerCase());
    if (exists) {
      return res.status(400).json({ error: "Ushbu raqamli xona allaqachon mavjud" });
    }
    const newRoom = { id: generateUUID(), room_number: cleanRoomNumber, specialty: cleanSpecialty };
    memoryDb.rooms.push(newRoom);
    persistDb();
    return res.json(newRoom);
  }
  try {
    const checkExists = await pool.query("SELECT 1 FROM rooms WHERE LOWER(room_number) = LOWER($1)", [cleanRoomNumber]);
    if (checkExists.rows.length > 0) {
      return res.status(400).json({ error: "Ushbu raqamli xona allaqachon mavjud" });
    }
    const result = await pool.query(
      "INSERT INTO rooms (room_number, specialty) VALUES ($1, $2) RETURNING *",
      [cleanRoomNumber, cleanSpecialty]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/rooms/:id', async (req, res) => {
  const roomId = req.params.id;

  // Basic role check: if client provides X-User-Role header and it's 'doctor', disallow
  try {
    const hdrRole = String(req.headers['x-user-role'] || '').toLowerCase();
    if (hdrRole === 'doctor') {
      return res.status(403).json({ error: 'Ruxsat etilmagan: shifokorlar xonalarni o\'chirishi mumkin emas.' });
    }
  } catch (e) {
    // ignore header parsing errors and continue
  }

  if (firestoreDb) {
    try {
      const rRef = doc(firestoreDb, 'rooms', roomId);
      const rDoc = await getDoc(rRef);
      if (rDoc.exists()) {
        const roomNum = rDoc.data().room_number;
        if (roomNum) {
          // Check if occupied by any doctor in users
          const usersSnap = await getDocs(collection(firestoreDb, 'users'));
          let isOccupied = false;
          usersSnap.forEach(uDoc => {
            if (String(uDoc.data().room_number || '') === String(roomNum)) {
              isOccupied = true;
            }
          });
          if (isOccupied) {
            return res.status(400).json({ error: "Ushbu xona hozirda shifokorga biriktirilgan. Uni o'chira olmaysiz." });
          }
        }
      }
      await deleteDoc(rRef);
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (!pool) {
    const room = memoryDb.rooms.find(r => r.id === roomId);
    if (room) {
      const isOccupied = memoryDb.users.some(u => String(u.room_number) === String(room.room_number));
      if (isOccupied) {
        return res.status(400).json({ error: "Ushbu xona hozirda shifokorga biriktirilgan. Uni o'chira olmaysiz." });
      }
    }
    memoryDb.rooms = memoryDb.rooms.filter(r => r.id !== roomId);
    persistDb();
    return res.json({ success: true });
  }
  try {
    const roomResult = await pool.query("SELECT room_number FROM rooms WHERE id = $1", [roomId]);
    if (roomResult.rows.length > 0) {
      const roomNum = roomResult.rows[0].room_number;
      if (roomNum) {
        const checkOccupied = await pool.query("SELECT 1 FROM users WHERE room_number = $1 LIMIT 1", [roomNum]);
        if (checkOccupied.rows.length > 0) {
          return res.status(400).json({ error: "Ushbu xona hozirda shifokorga biriktirilgan. Uni o'chira olmaysiz." });
        }
      }
    }
    await pool.query("DELETE FROM rooms WHERE id = $1", [roomId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/users/:id', async (req, res) => {
  const { status } = req.body;
  if (firestoreDb) {
    try {
      const uRef = doc(firestoreDb, 'users', req.params.id);
      const uDoc = await getDoc(uRef);
      if (uDoc.exists()) {
        const updated = { ...uDoc.data(), status };
        await setDoc(uRef, updated);
        return res.json({ id: req.params.id, ...updated });
      }
      return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (!pool) {
    const user = memoryDb.users.find(u => u.id === req.params.id);
    if (user) {
      user.status = status;
      persistDb();
    }
    return res.json(user || { error: 'Not found' });
  }
  try {
    const result = await pool.query(
      "UPDATE users SET status = $1 WHERE id = $2 RETURNING *",
      [status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  const { first_name, last_name, email, password, role, specialty, phone, birth_date, gender, address, bio, resume_text, status, icd_code, room_number, doctorId } = req.body;
  const cleanUserEmail = (email && String(email).trim() !== "") ? String(email).trim().toLowerCase() : null;
  
  try {
    const dupError = await checkDuplicateUser(req.params.id, cleanUserEmail, phone);
    if (dupError) {
      return res.status(400).json({ error: dupError });
    }
  } catch (err) {
    return res.status(500).json({ error: "Xatolik: " + err.message });
  }

  if (firestoreDb) {
    try {
      const uRef = doc(firestoreDb, 'users', req.params.id);
      const uDoc = await getDoc(uRef);
      if (uDoc.exists()) {
        const existing = uDoc.data();
        const updated = {
          ...existing,
          first_name: first_name !== undefined ? first_name : (existing.first_name || null),
          last_name: last_name !== undefined ? last_name : (existing.last_name || null),
          email: email !== undefined ? cleanUserEmail : (existing.email || null),
          password: password !== undefined ? password : (existing.password || '123456'),
          role: role !== undefined ? role : (existing.role || 'patient'),
          specialty: specialty !== undefined ? specialty : (existing.specialty || null),
          phone: phone !== undefined ? phone : (existing.phone || null),
          birth_date: birth_date !== undefined ? birth_date : (existing.birth_date || null),
          gender: gender !== undefined ? gender : (existing.gender || null),
          address: address !== undefined ? address : (existing.address || null),
          bio: bio !== undefined ? bio : (existing.bio || null),
          resume_text: resume_text !== undefined ? resume_text : (existing.resume_text || null),
          status: status !== undefined ? status : (existing.status || 'active'),
          icd_code: icd_code !== undefined ? icd_code : (existing.icd_code || null),
          room_number: room_number !== undefined ? room_number : (existing.room_number || null),
          doctorId: doctorId !== undefined ? doctorId : (existing.doctorId || existing.doctor_id || null),
          doctor_id: doctorId !== undefined ? doctorId : (existing.doctor_id || existing.doctorId || null)
        };

        // Clean undefined fields
        for (const key of Object.keys(updated)) {
          if (updated[key] === undefined) {
            delete updated[key];
          }
        }

        await setDoc(uRef, updated);
        return res.json({ id: req.params.id, ...updated });
      }
      return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (!pool) {
    const user = memoryDb.users.find(u => u.id === req.params.id);
    if (user) {
      if (first_name !== undefined) user.first_name = first_name;
      if (last_name !== undefined) user.last_name = last_name;
      if (email !== undefined) user.email = cleanUserEmail;
      if (password !== undefined) user.password = password;
      if (role !== undefined) user.role = role;
      if (specialty !== undefined) user.specialty = specialty;
      if (phone !== undefined) user.phone = phone;
      if (birth_date !== undefined) user.birth_date = birth_date;
      if (gender !== undefined) user.gender = gender;
      if (address !== undefined) user.address = address;
      if (bio !== undefined) user.bio = bio;
      if (resume_text !== undefined) user.resume_text = resume_text;
      if (status !== undefined) user.status = status;
      if (icd_code !== undefined) user.icd_code = icd_code;
      if (room_number !== undefined) user.room_number = room_number;
      if (doctorId !== undefined) { user.doctorId = doctorId; user.doctor_id = doctorId; }
      persistDb();
      return res.json(user);
    }
    return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  }
  try {
    const result = await pool.query(
      "UPDATE users SET first_name = $1, last_name = $2, email = $3, password = $4, role = $5, specialty = $6, phone = $7, birth_date = $8, gender = $9, address = $10, bio = $11, resume_text = $12, status = $13, icd_code = $14, room_number = $15, doctor_id = $16 WHERE id = $17 RETURNING *",
      [first_name, last_name, cleanUserEmail, password, role, specialty, phone, birth_date, gender, address, bio, resume_text, status, icd_code, room_number, doctorId || null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    }
    res.json({ ...result.rows[0], doctorId: result.rows[0].doctor_id || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  const userIdToDelete = req.params.id;

  if (firestoreDb) {
    try {
      // Cascade/Nullify diagnoses linked to this user so we can delete them cleanly
      const snap = await getDocs(collection(firestoreDb, 'diagnoses'));
      for (const dDoc of snap.docs) {
        const dData = dDoc.data();
        if (dData.doctor_id === userIdToDelete) {
          await updateDoc(doc(firestoreDb, 'diagnoses', dDoc.id), { doctor_id: null });
        }
        if (dData.patient_id === userIdToDelete) {
          await deleteDoc(doc(firestoreDb, 'diagnoses', dDoc.id));
        }
      }

      await deleteDoc(doc(firestoreDb, 'users', userIdToDelete));
      memoryDb.users = memoryDb.users.filter(u => u.id !== userIdToDelete);
      memoryDb.diagnoses = memoryDb.diagnoses.map(d => {
        if (d.doctor_id === userIdToDelete) return { ...d, doctor_id: null };
        return d;
      }).filter(d => d.patient_id !== userIdToDelete);
      persistDb();
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (!pool) {
    memoryDb.users = memoryDb.users.filter(u => u.id !== userIdToDelete);
    memoryDb.diagnoses = memoryDb.diagnoses.map(d => {
      if (d.doctor_id === userIdToDelete) return { ...d, doctor_id: null };
      return d;
    }).filter(d => d.patient_id !== userIdToDelete);
    persistDb();
    return res.json({ success: true });
  }
  try {
    // In PostgreSQL diagnoses table has foreign-keys:
    // patient_id UUID REFERENCES users(id) ON DELETE CASCADE
    // doctor_id UUID REFERENCES users(id) ON DELETE SET NULL
    await pool.query('DELETE FROM users WHERE id = $1', [userIdToDelete]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/diagnoses', async (req, res) => {
  const { patient_id, doctor_id } = req.query;
  // Read role/id from headers to enforce server-side filtering
  const hdrRole = String(req.headers['x-user-role'] || '').toLowerCase();
  const hdrId = String(req.headers['x-user-id'] || '').trim();

  if (firestoreDb) {
    try {
      const snap = await getDocs(collection(firestoreDb, 'diagnoses'));
      let results = [];
      snap.forEach(dDoc => {
        results.push({ id: dDoc.id, ...dDoc.data() });
      });
      if (patient_id) {
        results = results.filter(d => d.patient_id === patient_id);
      }
      if (doctor_id) {
        results = results.filter(d => d.doctor_id === doctor_id);
      }
      // Server-side role filtering: patients/doctors only get their own records
      if (hdrRole === 'patient' && hdrId) {
        results = results.filter(d => d.patient_id === hdrId);
      } else if (hdrRole === 'doctor' && hdrId) {
        results = results.filter(d => d.doctor_id === hdrId);
      }
      results.sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      return res.json(results);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (!pool) {
    let result = memoryDb.diagnoses;
    if (patient_id) result = result.filter(d => d.patient_id === patient_id);
    if (doctor_id) result = result.filter(d => d.doctor_id === doctor_id);
    if (hdrRole === 'patient' && hdrId) result = result.filter(d => d.patient_id === hdrId);
    if (hdrRole === 'doctor' && hdrId) result = result.filter(d => d.doctor_id === hdrId);
    return res.json(result.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)));
  }
  try {
    let query = 'SELECT * FROM diagnoses WHERE 1=1';
    let params = [];
    if (patient_id) {
       params.push(patient_id);
       query += ` AND patient_id = $${params.length}`;
    }
    if (doctor_id) {
       params.push(doctor_id);
       query += ` AND doctor_id = $${params.length}`;
    }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    let rows = result.rows;
    if (hdrRole === 'patient' && hdrId) rows = rows.filter(d => d.patient_id === hdrId);
    if (hdrRole === 'doctor' && hdrId) rows = rows.filter(d => d.doctor_id === hdrId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/diagnoses', async (req, res) => {
  const { patient_id, doctor_id, description, treatment_start_date } = req.body;
  // Only doctors and admins may create diagnoses. Receptionists and patients cannot.
  try {
    const hdrRole = String(req.headers['x-user-role'] || '').toLowerCase();
    const hdrId = String(req.headers['x-user-id'] || '').trim();
    // Only allow doctors and admins to create diagnoses
    if (!(hdrRole === 'doctor' || hdrRole === 'admin')) {
      logUnauthorizedDiagnosis('create', { role: hdrRole, userId: hdrId, ip: req.ip, body: req.body });
      return res.status(403).json({ error: 'Ruxsat etilmagan: faqat shifokor yoki admin tashxis qo\'yishi mumkin.' });
    }
  } catch (e) {
    // ignore header parsing errors
  }

  if (firestoreDb) {
    try {
      const newId = generateUUID();
      const diag = {
        id: newId,
        patient_id: patient_id || null,
        doctor_id: doctor_id || null,
        description: description || null,
        treatment_start_date: treatment_start_date || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      // Clean undefined fields
      for (const key of Object.keys(diag)) {
        if (diag[key] === undefined) {
          delete diag[key];
        }
      }

      await setDoc(doc(firestoreDb, 'diagnoses', newId), diag);
      return res.json(diag);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (!pool) {
    const diag = { id: generateUUID(), patient_id, doctor_id, description, treatment_start_date, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    memoryDb.diagnoses.push(diag);
    persistDb();
    return res.json(diag);
  }
  try {
    const result = await pool.query(
      "INSERT INTO diagnoses (patient_id, doctor_id, description, treatment_start_date) VALUES ($1, $2, $3, $4) RETURNING *",
      [patient_id, doctor_id, description, treatment_start_date]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Simple file upload endpoint accepting base64 payloads
app.post('/api/uploads', async (req, res) => {
  const { filename, data, userId } = req.body || {};
  if (!filename || !data) return res.status(400).json({ error: 'filename and data (base64) are required' });
  try {
    const safeName = filename.replace(/[^a-z0-9\.\-_]/ig, '_');
    const outName = `${Date.now()}-${safeName}`;
    const outPath = path.join(uploadsDir, outName);
    const buf = Buffer.from(data, 'base64');
    fs.writeFileSync(outPath, buf);
    const publicUrl = `/uploads/${outName}`;

    // Attach to user record metadata if userId provided
    if (userId) {
      if (firestoreDb) {
        try {
          const uRef = doc(firestoreDb, 'users', userId);
          const uDoc = await getDoc(uRef);
          if (uDoc.exists()) {
            const u = uDoc.data();
            const files = Array.isArray(u.files) ? u.files : [];
            files.push({ filename: safeName, url: publicUrl, uploaded_at: new Date().toISOString() });
            await setDoc(uRef, { ...u, files }, { merge: true });
          }
        } catch (e) {
          console.warn('Failed to attach upload to firestore user', e.message);
        }
      } else if (!pool) {
        const u = memoryDb.users.find(x => x.id === userId);
        if (u) {
          if (!Array.isArray(u.files)) u.files = [];
          u.files.push({ filename: safeName, url: publicUrl, uploaded_at: new Date().toISOString() });
          persistDb();
        }
      }
    }

    res.json({ url: publicUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/diagnoses/:id', async (req, res) => {
  const { patient_id, description, treatment_start_date } = req.body;

  // Only admin or the doctor who owns the diagnosis may update it
  const hdrRole = String(req.headers['x-user-role'] || '').toLowerCase();
  const hdrId = String(req.headers['x-user-id'] || '').trim();

  if (firestoreDb) {
    try {
      const dRef = doc(firestoreDb, 'diagnoses', req.params.id);
      const dDoc = await getDoc(dRef);
      if (dDoc.exists()) {
        const existing = dDoc.data();
        // Permission: only admin or the assigned doctor can update
        if (!(hdrRole === 'admin' || (hdrRole === 'doctor' && existing.doctor_id && String(existing.doctor_id) === hdrId))) {
          logUnauthorizedDiagnosis('update', { role: hdrRole, userId: hdrId, ip: req.ip, diagnosisId: req.params.id });
          return res.status(403).json({ error: 'Ruxsat etilmagan: bu tashxisni yangilashga ruxsat yo\'q.' });
        }
        const updated = {
          ...existing,
          patient_id: patient_id !== undefined ? patient_id : (existing.patient_id || null),
          description: description !== undefined ? description : (existing.description || null),
          treatment_start_date: treatment_start_date !== undefined ? treatment_start_date : (existing.treatment_start_date || null),
          updated_at: new Date().toISOString()
        };

        // Clean undefined fields
        for (const key of Object.keys(updated)) {
          if (updated[key] === undefined) {
            delete updated[key];
          }
        }

        await setDoc(dRef, updated);
        return res.json({ id: req.params.id, ...updated });
      }
      return res.status(404).json({ error: 'Tashxis topilmadi' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (!pool) {
    const d = memoryDb.diagnoses.find(x => x.id === req.params.id);
    if (d) {
      // Permission check
      if (!(hdrRole === 'admin' || (hdrRole === 'doctor' && String(d.doctor_id) === hdrId))) {
        logUnauthorizedDiagnosis('update', { role: hdrRole, userId: hdrId, ip: req.ip, diagnosisId: req.params.id });
        return res.status(403).json({ error: 'Ruxsat etilmagan: bu tashxisni yangilashga ruxsat yo\'q.' });
      }
      d.patient_id = patient_id !== undefined ? patient_id : d.patient_id;
      d.description = description !== undefined ? description : d.description;
      d.treatment_start_date = treatment_start_date !== undefined ? treatment_start_date : d.treatment_start_date;
      d.updated_at = new Date().toISOString();
      persistDb();
    }
    return res.json(d || {});
  }
  try {
    // Fetch existing to enforce permissions
    const existRes = await pool.query('SELECT * FROM diagnoses WHERE id = $1', [req.params.id]);
    if (existRes.rows.length === 0) return res.status(404).json({ error: 'Tashxis topilmadi' });
    const existing = existRes.rows[0];
    if (!(hdrRole === 'admin' || (hdrRole === 'doctor' && String(existing.doctor_id) === hdrId))) {
      logUnauthorizedDiagnosis('update', { role: hdrRole, userId: hdrId, ip: req.ip, diagnosisId: req.params.id });
      return res.status(403).json({ error: 'Ruxsat etilmagan: bu tashxisni yangilashga ruxsat yo\'q.' });
    }
    const result = await pool.query(
      "UPDATE diagnoses SET patient_id = $1, description = $2, treatment_start_date = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *",
      [patient_id, description, treatment_start_date, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/diagnoses/:id', async (req, res) => {
  const hdrRole = String(req.headers['x-user-role'] || '').toLowerCase();
  const hdrId = String(req.headers['x-user-id'] || '').trim();

  if (firestoreDb) {
    try {
      const dRef = doc(firestoreDb, 'diagnoses', req.params.id);
      const dDoc = await getDoc(dRef);
      if (!dDoc.exists()) return res.status(404).json({ error: 'Tashxis topilmadi' });
      const existing = dDoc.data();
      if (!(hdrRole === 'admin' || (hdrRole === 'doctor' && existing.doctor_id && String(existing.doctor_id) === hdrId))) {
        logUnauthorizedDiagnosis('delete', { role: hdrRole, userId: hdrId, ip: req.ip, diagnosisId: req.params.id });
        return res.status(403).json({ error: 'Ruxsat etilmagan: bu tashxisni o\'chirishga ruxsat yo\'q.' });
      }
      await deleteDoc(dRef);
      memoryDb.diagnoses = memoryDb.diagnoses.filter(x => x.id !== req.params.id);
      persistDb();
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (!pool) {
    const existing = memoryDb.diagnoses.find(x => x.id === req.params.id);
    if (!existing) return res.status(404).json({ error: 'Tashxis topilmadi' });
    if (!(hdrRole === 'admin' || (hdrRole === 'doctor' && String(existing.doctor_id) === hdrId))) {
      logUnauthorizedDiagnosis('delete', { role: hdrRole, userId: hdrId, ip: req.ip, diagnosisId: req.params.id });
      return res.status(403).json({ error: 'Ruxsat etilmagan: bu tashxisni o\'chirishga ruxsat yo\'q.' });
    }
    memoryDb.diagnoses = memoryDb.diagnoses.filter(x => x.id !== req.params.id);
    persistDb();
    return res.json({ success: true });
  }
  try {
    const existRes = await pool.query('SELECT * FROM diagnoses WHERE id = $1', [req.params.id]);
    if (existRes.rows.length === 0) return res.status(404).json({ error: 'Tashxis topilmadi' });
    const existing = existRes.rows[0];
    if (!(hdrRole === 'admin' || (hdrRole === 'doctor' && String(existing.doctor_id) === hdrId))) {
      return res.status(403).json({ error: 'Ruxsat etilmagan: bu tashxisni o\'chirishga ruxsat yo\'q.' });
    }
    await pool.query('DELETE FROM diagnoses WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Initialize Gemini client (Lazy initialization to prevent startup crashes when API key is missing)
let aiClient = null;
function getGeminiClient() {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("GEMINI_API_KEY is not configured in secrets.");
      return null;
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiClient;
}

// AI Assist bio generation route
app.post('/api/ai/generate-bio', async (req, res) => {
  const { name, specialty, raw_resume, existing_bio } = req.body;
  const ai = getGeminiClient();
  if (!ai) {
    return res.status(400).json({ 
      error: "Tizimda Gemini AI kaliti topilmadi (GEMINI_API_KEY). AI xizmatidan foydalanish uchun Secrets bo'limida kalitni sozlang." 
    });
  }

  try {
    const prompt = `
      Sen professional klinika kadrlar boshqaruvchisi va tibbiyot yozuvchisisan.
      Quyidagi ma'lumotlar asosida shifokor uchun batafsil, jozibali, professional va o'zbek tilida Tarjimai hol (Bio) va ish tajribasini yozib ber.
      Ushbu bio o'rta uzunlikda (taxminan 100-150 ta so'z), shifokorning malakasini, ko'p yillik tajribasini va bemorlarga g'amxo'rligini yoritib beruvchi bo'lishi kerak.
      
      Shifokor ismi: ${name}
      Mutaxassisligi: ${specialty || 'Terapevt'}
      Mavjud bio (agar bo'lsa): ${existing_bio || 'Kiritilmagan'}
      Rezyume matni (yuklangan fayldan olingan ma'lumot): ${raw_resume || 'Kiritilmagan'}
      
      Natija faqat tayyor matn ko'rinishida bo'lsin, hech qanday qo'shimcha tushuntirish, sarlavha va kirish yoki xulosa gaplarsiz. To'g'ridan to'g'ri o'qiladigan matn qaytarilsin.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    res.json({ text: response.text });
  } catch (err) {
    console.error("Gemini Generation Error:", err);
    res.status(500).json({ error: "AI orqali javob tayyorlashda xatolik yuz berdi: " + err.message });
  }
});



async function startServer() {
  await initDB();

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    // Note: createViteServer expects to be imported dynamically or from vite
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production: serve static files
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, {
      maxAge: '1y',
      immutable: true
    }));
    app.get('*', (req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
