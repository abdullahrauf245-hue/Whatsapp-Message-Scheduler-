const express = require('express');
const router = express.Router();
const { dbQuery } = require('../db/database');
const waClient = require('../whatsapp/client');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// File Upload Config
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// --- WHATSAPP STATUS ---
router.get('/status', (req, res) => {
  res.json(waClient.getStatus());
});

router.post('/logout', async (req, res) => {
  const result = await waClient.logout();
  res.json(result);
});

// --- SCHEDULES CRUD ---
router.get('/schedules', async (req, res) => {
  try {
    const schedules = await dbQuery.all(`SELECT * FROM schedules ORDER BY scheduled_at DESC`);
    res.json({ success: true, data: schedules });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/schedules', upload.single('media'), async (req, res) => {
  try {
    const { recipient, message, scheduled_at, recurring_type, recurring_value } = req.body;
    
    if (!recipient || !message || !scheduled_at) {
      return res.status(400).json({ success: false, error: 'Recipient, message, and scheduled_at are required.' });
    }

    const id = uuidv4();
    const created_at = new Date().toISOString();
    const media_url = req.file ? req.file.path : null;

    await dbQuery.run(
      `INSERT INTO schedules 
      (id, recipient, message, scheduled_at, recurring_type, recurring_value, status, created_at, media_url) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        recipient.trim(),
        message,
        scheduled_at,
        recurring_type || 'none',
        recurring_value || null,
        'pending',
        created_at,
        media_url
      ]
    );

    const newSchedule = await dbQuery.get(`SELECT * FROM schedules WHERE id = ?`, [id]);
    waClient.broadcast('schedule_created', newSchedule);

    res.status(201).json({ success: true, data: newSchedule });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await dbQuery.run(`DELETE FROM schedules WHERE id = ?`, [id]);
    waClient.broadcast('schedule_deleted', { id });
    res.json({ success: true, message: 'Schedule deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/schedules/:id/send-now', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await dbQuery.get(`SELECT * FROM schedules WHERE id = ?`, [id]);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    const schedulerEngine = require('../scheduler/engine');
    await schedulerEngine.executeScheduleItem(item);

    res.json({ success: true, message: 'Message trigger initiated.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- CONTACTS CRUD ---
router.get('/contacts', async (req, res) => {
  try {
    const contacts = await dbQuery.all(`SELECT * FROM contacts ORDER BY name ASC`);
    res.json({ success: true, data: contacts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/contacts', async (req, res) => {
  try {
    const { name, phone, tag } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ success: false, error: 'Name and phone are required.' });
    }

    const id = uuidv4();
    const created_at = new Date().toISOString();
    const cleanPhone = phone.replace(/\D/g, '');

    await dbQuery.run(
      `INSERT INTO contacts (id, name, phone, tag, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id, name.trim(), cleanPhone, tag || 'General', created_at]
    );

    const contact = await dbQuery.get(`SELECT * FROM contacts WHERE id = ?`, [id]);
    res.status(201).json({ success: true, data: contact });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/contacts/:id', async (req, res) => {
  try {
    await dbQuery.run(`DELETE FROM contacts WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Contact removed' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- TEMPLATES CRUD ---
router.get('/templates', async (req, res) => {
  try {
    const templates = await dbQuery.all(`SELECT * FROM templates ORDER BY title ASC`);
    res.json({ success: true, data: templates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/templates', async (req, res) => {
  try {
    const { title, content, category } = req.body;
    if (!title || !content) {
      return res.status(400).json({ success: false, error: 'Title and content are required.' });
    }

    const id = uuidv4();
    const created_at = new Date().toISOString();

    await dbQuery.run(
      `INSERT INTO templates (id, title, content, category, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id, title.trim(), content.trim(), category || 'General', created_at]
    );

    const template = await dbQuery.get(`SELECT * FROM templates WHERE id = ?`, [id]);
    res.status(201).json({ success: true, data: template });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/templates/:id', async (req, res) => {
  try {
    await dbQuery.run(`DELETE FROM templates WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Template removed' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- LOGS ---
router.get('/logs', async (req, res) => {
  try {
    const logs = await dbQuery.all(`SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100`);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
