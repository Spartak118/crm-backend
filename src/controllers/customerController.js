const { query } = require('../config/database');
const { validationResult } = require('express-validator');

class CustomerController {
    async getCustomers(req, res) {
        try {
            const {
                page = 1,
                limit = 20,
                status,
                tags,
                search,
                stage,
                sortBy = 'created_at',
                sortOrder = 'DESC'
            } = req.query;

            let sql = `
                SELECT c.*, 
                       json_agg(DISTINCT jsonb_build_object(
                           'type', ci.type,
                           'value', ci.value,
                           'is_primary', ci.is_primary
                       )) FILTER (WHERE ci.id IS NOT NULL) as contact_info,
                       json_agg(DISTINCT a.*) FILTER (WHERE a.id IS NOT NULL) as addresses,
                       cs.stage_id,
                       cs.expected_deal_size,
                       cs.probability,
                       cs.next_follow_up
                FROM customers c
                LEFT JOIN contact_info ci ON c.id = ci.customer_id
                LEFT JOIN addresses a ON c.id = a.customer_id
                LEFT JOIN customer_stages cs ON c.id = cs.customer_id
                WHERE 1=1
            `;

            const params = [];
            let paramCount = 1;

            if (status) {
                sql += ` AND c.status = $${paramCount}`;
                params.push(status);
                paramCount++;
            }

            if (tags) {
                const tagArray = tags.split(',');
                sql += ` AND c.tags && $${paramCount}`;
                params.push(tagArray);
                paramCount++;
            }

            if (search) {
                sql += ` AND to_tsvector('english', 
                    coalesce(c.first_name,'') || ' ' || 
                    coalesce(c.last_name,'') || ' ' || 
                    coalesce(c.company_name,'')
                ) @@ plainto_tsquery('english', $${paramCount})`;
                params.push(search);
                paramCount++;
            }

            if (stage) {
                sql += ` AND cs.stage_id = $${paramCount}`;
                params.push(stage);
                paramCount++;
            }

            sql += ` GROUP BY c.id, cs.stage_id, cs.expected_deal_size, 
                            cs.probability, cs.next_follow_up`;

            const validSortFields = ['created_at', 'first_name', 'last_name', 'status'];
            if (validSortFields.includes(sortBy)) {
                sql += ` ORDER BY c.${sortBy} ${sortOrder}`;
            }

            const offset = (page - 1) * limit;
            sql += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
            params.push(limit, offset);

            const result = await query(sql, params);

            const countResult = await query(
                'SELECT COUNT(*) FROM customers'
            );

            res.json({
                customers: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: parseInt(countResult.rows[0].count),
                    pages: Math.ceil(countResult.rows[0].count / limit)
                }
            });
        } catch (error) {
            console.error('Error fetching customers:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async createCustomer(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const {
                first_name,
                last_name,
                email,
                phone,
                company_name,
                job_title,
                status = 'Lead',
                tags = [],
                address,
                custom_fields = {}
            } = req.body;

            await query('BEGIN');

            const customerResult = await query(
                `INSERT INTO customers (
                    first_name, last_name, company_name, 
                    job_title, status, tags, custom_fields, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
                RETURNING *`,
                [first_name, last_name, company_name, job_title, 
                 status, tags, custom_fields, req.user.id]
            );

            const customer = customerResult.rows[0];

            if (email) {
                await query(
                    `INSERT INTO contact_info (customer_id, type, value, is_primary) 
                     VALUES ($1, 'email', $2, $3)`,
                    [customer.id, email, true]
                );
            }

            if (phone) {
                await query(
                    `INSERT INTO contact_info (customer_id, type, value) 
                     VALUES ($1, 'phone', $2, false)`,
                    [customer.id, phone]
                );
            }

            if (address) {
                await query(
                    `INSERT INTO addresses (
                        customer_id, street, city, state, 
                        zip_code, country, is_shipping, is_billing
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [customer.id, address.street, address.city, 
                     address.state, address.zipCode, address.country, 
                     true, true]
                );
            }

            await query(
                `INSERT INTO activity_log (user_id, customer_id, action, details) 
                 VALUES ($1, $2, 'CREATE_CUSTOMER', $3)`,
                [req.user.id, customer.id, JSON.stringify({ timestamp: new Date() })]
            );

            await query('COMMIT');

            res.status(201).json(customer);
        } catch (error) {
            await query('ROLLBACK');
            console.error('Error creating customer:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async updateCustomerStage(req, res) {
        try {
            const { customerId } = req.params;
            const { stageId, expected_deal_size, probability, next_follow_up } = req.body;

            const customerExists = await query(
                'SELECT id FROM customers WHERE id = $1',
                [customerId]
            );

            if (customerExists.rows.length === 0) {
                return res.status(404).json({ error: 'Customer not found' });
            }

            const result = await query(
                `INSERT INTO customer_stages (
                    customer_id, stage_id, expected_deal_size, 
                    probability, next_follow_up
                ) VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (customer_id, stage_id) 
                DO UPDATE SET 
                    expected_deal_size = EXCLUDED.expected_deal_size,
                    probability = EXCLUDED.probability,
                    next_follow_up = EXCLUDED.next_follow_up,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *`,
                [customerId, stageId, expected_deal_size, probability, next_follow_up]
            );

            await query(
                `INSERT INTO activity_log (user_id, customer_id, action, details) 
                 VALUES ($1, $2, 'UPDATE_STAGE', $3)`,
                [req.user.id, customerId, JSON.stringify({ stage_id: stageId })]
            );

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating customer stage:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}

module.exports = new CustomerController();