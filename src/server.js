const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const Database = require('better-sqlite3');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data directory and DB file
const dataDir = path.join(__dirname, '..', 'data');
const uploadsDir = path.join(dataDir, 'uploads');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// DB setup
const dbPath = path.join(dataDir, 'parcauto.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS cars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    price REAL,
    year INTEGER,
    image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add optional columns if missing
const existingColumns = db.prepare("PRAGMA table_info(cars)").all().map(r => r.name);
if (!existingColumns.includes('brand')) {
  db.exec('ALTER TABLE cars ADD COLUMN brand TEXT');
}
if (!existingColumns.includes('model')) {
  db.exec('ALTER TABLE cars ADD COLUMN model TEXT');
}
if (!existingColumns.includes('fuel_type')) {
  db.exec("ALTER TABLE cars ADD COLUMN fuel_type TEXT");
}
if (!existingColumns.includes('mileage')) {
  db.exec('ALTER TABLE cars ADD COLUMN mileage INTEGER');
}
if (!existingColumns.includes('transmission')) {
  db.exec('ALTER TABLE cars ADD COLUMN transmission TEXT');
}

// Images table for galleries
db.exec(`
  CREATE TABLE IF NOT EXISTS car_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_id INTEGER NOT NULL,
    image TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE CASCADE
  );
`);

// Templating & static
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(uploadsDir));

// Sessions for simple auth
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: dataDir,
  }),
  secret: process.env.SESSION_SECRET || 'parcautofogo-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 },
}));

// Expose auth state to templates
app.use((req, res, next) => {
  res.locals.isAuthenticated = !!(req.session && req.session.authenticated);
  next();
});

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Fogo2025';

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.redirect('/login');
}

// Multer config for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname || '');
    cb(null, `car-${unique}${ext}`);
  }
});
const upload = multer({ storage });

// Separate storage for owner photo (public path)
const ownerPhotoPath = path.join(__dirname, '..', 'public', 'images', 'owner-placeholder.jpg');
const ownerStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '..', 'public', 'images'));
  },
  filename: function (req, file, cb) {
    cb(null, 'owner-placeholder.jpg');
  }
});
const uploadOwner = multer({ storage: ownerStorage });

// Owner and park info
const OWNER = {
  name: 'Ibrahima Fogo Diallo',
  phone: '+224 620 05 64 33 / 620 48 00 05',
  email: 'diallofogo1999@gmail.com',
  snap: 'fogoboy19',
  address: 'Cameroun super bobo, commune de Dixin – Conakry, Guinée'
};

// Helpers
function getAllCars() {
  const stmt = db.prepare('SELECT * FROM cars ORDER BY created_at DESC');
  return stmt.all();
}
function getCarById(id) {
  const stmt = db.prepare('SELECT * FROM cars WHERE id = ?');
  return stmt.get(id);
}
function getImagesByCarId(id) {
  return db.prepare('SELECT * FROM car_images WHERE car_id = ? ORDER BY id').all(id);
}

function searchCars(q, fuel, advanced = {}) {
  const where = [];
  const params = [];
  if (q) {
    where.push('(title LIKE ? OR brand LIKE ? OR model LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (fuel) {
    where.push('fuel_type = ?');
    params.push(fuel);
  }
  if (advanced.brand) { where.push('brand LIKE ?'); params.push(`%${advanced.brand}%`); }
  if (advanced.model) { where.push('model LIKE ?'); params.push(`%${advanced.model}%`); }
  if (advanced.transmission) { where.push('transmission = ?'); params.push(advanced.transmission); }
  if (advanced.minPrice) { where.push('price >= ?'); params.push(Number(advanced.minPrice)); }
  if (advanced.maxPrice) { where.push('price <= ?'); params.push(Number(advanced.maxPrice)); }
  if (advanced.minYear) { where.push('year >= ?'); params.push(Number(advanced.minYear)); }
  if (advanced.maxYear) { where.push('year <= ?'); params.push(Number(advanced.maxYear)); }
  if (advanced.maxKm) { where.push('mileage <= ?'); params.push(Number(advanced.maxKm)); }
  const sql = `SELECT * FROM cars ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`;
  return db.prepare(sql).all(...params);
}

// Routes
app.get('/', (req, res) => {
  const cars = getAllCars();
  res.render('home', { owner: OWNER, cars });
});

app.get('/cars', (req, res) => {
  const { q, fuel, brand, model, transmission, minPrice, maxPrice, minYear, maxYear, maxKm } = req.query;
  const cars = (q || fuel || brand || model || transmission || minPrice || maxPrice || minYear || maxYear || maxKm)
    ? searchCars(q, fuel, { brand, model, transmission, minPrice, maxPrice, minYear, maxYear, maxKm })
    : getAllCars();
  res.render('cars', { cars, q: q || '', fuel: fuel || '', brand: brand || '', model: model || '', transmission: transmission || '', minPrice: minPrice || '', maxPrice: maxPrice || '', minYear: minYear || '', maxYear: maxYear || '', maxKm: maxKm || '' });
});

app.get('/cars/:id', (req, res) => {
  const car = getCarById(req.params.id);
  if (!car) return res.status(404).send('Voiture introuvable');
  const images = getImagesByCarId(car.id);
  res.render('car_detail', { car, images, owner: OWNER });
});

// Favorites helper API
app.get('/api/cars', (req, res) => {
  const ids = (req.query.ids || '').split(',').map(s => Number(s)).filter(Boolean);
  if (!ids.length) return res.json([]);
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM cars WHERE id IN (${placeholders})`).all(...ids);
  res.json(rows);
});

// Admin simple routes (no auth yet)
app.get('/admin/cars', requireAuth, (req, res) => {
  const cars = getAllCars();
  res.render('admin_list', { cars });
});

app.get('/admin/cars/new', requireAuth, (req, res) => {
  res.render('admin_form', { car: null, images: [] });
});

app.post('/admin/cars', requireAuth, upload.fields([{ name: 'image', maxCount: 1 }, { name: 'gallery', maxCount: 10 }]), (req, res) => {
  const { title, description, price, year, brand, model, fuel_type, mileage, transmission } = req.body;
  const cover = req.files && req.files.image && req.files.image[0] ? `/uploads/${req.files.image[0].filename}` : null;
  const stmt = db.prepare('INSERT INTO cars (title, description, price, year, image, brand, model, fuel_type, mileage, transmission) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const info = stmt.run(title, description || null, price ? Number(price) : null, year ? Number(year) : null, cover, brand || null, model || null, fuel_type || null, mileage ? Number(mileage) : null, transmission || null);
  const carId = info.lastInsertRowid;
  const gallery = (req.files && req.files.gallery) ? req.files.gallery : [];
  if (gallery.length) {
    const insertImg = db.prepare('INSERT INTO car_images (car_id, image) VALUES (?, ?)');
    for (const f of gallery) insertImg.run(carId, `/uploads/${f.filename}`);
  }
  res.redirect('/admin/cars');
});

app.get('/admin/cars/:id/edit', requireAuth, (req, res) => {
  const car = getCarById(req.params.id);
  if (!car) return res.status(404).send('Voiture introuvable');
  const images = getImagesByCarId(car.id);
  res.render('admin_form', { car, images });
});

app.post('/admin/cars/:id', requireAuth, upload.fields([{ name: 'image', maxCount: 1 }, { name: 'gallery', maxCount: 10 }]), (req, res) => {
  const { title, description, price, year, existingImage, brand, model, fuel_type, mileage, transmission } = req.body;
  const car = getCarById(req.params.id);
  if (!car) return res.status(404).send('Voiture introuvable');

  let imagePath = existingImage || car.image || null;
  if (req.files && req.files.image && req.files.image[0]) {
    imagePath = `/uploads/${req.files.image[0].filename}`;
    // Optionally delete old file
    if (car.image) {
      const oldFsPath = path.join(__dirname, '..', car.image);
      fs.unlink(oldFsPath, () => {});
    }
  }

  const stmt = db.prepare('UPDATE cars SET title = ?, description = ?, price = ?, year = ?, image = ?, brand = ?, model = ?, fuel_type = ?, mileage = ?, transmission = ? WHERE id = ?');
  stmt.run(title, description || null, price ? Number(price) : null, year ? Number(year) : null, imagePath, brand || null, model || null, fuel_type || null, mileage ? Number(mileage) : null, transmission || null, req.params.id);

  const gallery = (req.files && req.files.gallery) ? req.files.gallery : [];
  if (gallery.length) {
    const insertImg = db.prepare('INSERT INTO car_images (car_id, image) VALUES (?, ?)');
    for (const f of gallery) insertImg.run(req.params.id, `/uploads/${f.filename}`);
  }
  res.redirect('/admin/cars');
});

// Favorites page
app.get('/favorites', (req, res) => {
  res.render('favorites');
});

app.post('/admin/cars/:id/delete', requireAuth, (req, res) => {
  const car = getCarById(req.params.id);
  if (!car) return res.status(404).send('Voiture introuvable');

  if (car.image) {
    const oldFsPath = path.join(__dirname, '..', car.image);
    fs.unlink(oldFsPath, () => {});
  }

  const stmt = db.prepare('DELETE FROM cars WHERE id = ?');
  stmt.run(req.params.id);
  res.redirect('/admin/cars');
});

// Delete specific gallery image
app.post('/admin/cars/:id/images/:imageId/delete', requireAuth, (req, res) => {
  const img = db.prepare('SELECT * FROM car_images WHERE id = ? AND car_id = ?').get(req.params.imageId, req.params.id);
  if (img) {
    const fsPath = path.join(__dirname, '..', img.image);
    fs.unlink(fsPath, () => {});
    db.prepare('DELETE FROM car_images WHERE id = ?').run(req.params.imageId);
  }
  res.redirect(`/admin/cars/${req.params.id}/edit`);
});

// Auth routes
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});
app.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.authenticated = true;
    return res.redirect('/admin/cars');
  }
  res.render('login', { error: 'Mot de passe incorrect' });
});
app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Owner photo upload routes
app.get('/admin/owner-photo', requireAuth, (req, res) => {
  res.render('owner_photo');
});

app.post('/admin/owner-photo', requireAuth, uploadOwner.single('photo'), (req, res) => {
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`ParcAutoFogo running at http://localhost:${PORT}`);
});

// Healthcheck
app.get('/health', (req, res) => res.json({ status: 'ok' }));


