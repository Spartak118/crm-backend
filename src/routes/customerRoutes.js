// ========================================
// CRM - Customer Routes
// Receives data from VISOLARO website
// ========================================

const express = require('express');
const router = express.Router();

// Временное хранилище (пока без базы данных)
let customers = [];

// POST /api/customers - создать нового клиента/лида
router.post('/api/customers', (req, res) => {
    try {
        const customerData = req.body;
        
        // Добавляем ID и дату создания
        const newCustomer = {
            id: customers.length + 1,
            ...customerData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        customers.push(newCustomer);
        
        console.log('✅ New customer from VISOLARO:', newCustomer.email || 'anonymous');
        console.log('📊 Total customers:', customers.length);
        
        res.status(201).json({
            success: true,
            id: newCustomer.id,
            message: 'Customer created successfully'
        });
        
    } catch (error) {
        console.error('❌ Error creating customer:', error);
        res.status(500).json({ error: 'Failed to create customer' });
    }
});

// GET /api/customers - получить всех клиентов
router.get('/api/customers', (req, res) => {
    res.json(customers);
});

// GET /api/customers/:id - получить одного клиента
router.get('/api/customers/:id', (req, res) => {
    const customer = customers.find(c => c.id === parseInt(req.params.id));
    if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
    }
    res.json(customer);
});

module.exports = router;