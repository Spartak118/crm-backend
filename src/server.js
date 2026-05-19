const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { query } = require('./config/database');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : [];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (/\.vercel\.app$/.test(origin) || /^http:\/\/localhost/.test(origin)) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());

// Test database connection
app.get('/api/test', async (req, res) => {
    try {
        const result = await query('SELECT NOW()');
        res.json({ message: 'Database connected!', time: result.rows[0] });
    } catch (error) {
        console.error('Database connection error:', error);
        res.status(500).json({ error: 'Database connection failed' });
    }
});

// ========== CUSTOMER ROUTES ==========

// POST /api/customers - создать нового клиента (из VISOLARO)
app.post('/api/customers', async (req, res) => {
    try {
        const {
            source,
            type,
            firstName,
            lastName,
            email,
            phone,
            country,
            device,
            browser,
            page,
            visitTime,
            notes
        } = req.body;

        console.log('📥 Received customer data:', req.body);

        // Для MySQL используем ? вместо $1, $2 и получаем insertId
        const result = await query(
            `INSERT INTO customers (
                source, type, first_name, last_name, email, phone, 
                country, device, browser, page, visit_time, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [source, type, firstName, lastName, email, phone, 
             country, device, browser, page, visitTime, notes]
        );

        // В MySQL результат содержит insertId
        const customerId = result.insertId;

        console.log('✅ New customer from VISOLARO:', email || 'anonymous');
        console.log('📊 Customer ID:', customerId);
        
        res.status(201).json({
            success: true,
            id: customerId,
            message: 'Customer created successfully'
        });

    } catch (error) {
        console.error('❌ Error creating customer:', error);
        res.status(500).json({ error: 'Failed to create customer' });
    }
});

// GET /api/customers - получить всех клиентов
app.get('/api/customers', async (req, res) => {
    try {
        const result = await query('SELECT * FROM customers ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).json({ error: 'Failed to fetch customers' });
    }
});

// GET /api/customers/:id - получить одного клиента
app.get('/api/customers/:id', async (req, res) => {
    try {
        const result = await query('SELECT * FROM customers WHERE id = ?', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching customer:', error);
        res.status(500).json({ error: 'Failed to fetch customer' });
    }
});

// ========== AUTH ROUTES (TEMPORARY) ==========

// Временный тестовый вход
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    // Тестовые учетные данные
    if (email === 'admin@visolaro.com' && password === 'admin123') {
        res.json({ 
            success: true, 
            token: 'test-token-123',
            user: { 
                id: 1,
                email: 'admin@visolaro.com', 
                name: 'Admin' 
            }
        });
    } else {
        res.status(401).json({ error: 'Invalid email or password' });
    }
});

// Проверка токена
app.get('/api/verify', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (token === 'test-token-123') {
        res.json({ valid: true, user: { id: 1, email: 'admin@visolaro.com' } });
    } else {
        res.status(401).json({ valid: false });
    }
});

// Basic route
app.get('/', (req, res) => {
    res.json({ message: 'CRM API is running' });
});

// Start server (skipped in Vercel serverless — module.exports handles that)
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
