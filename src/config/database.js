const mysql = require('mysql2');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'crm_database',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const promisePool = pool.promise();

module.exports = {
    query: async (text, params) => {
        try {
            const [rows] = await promisePool.query(text, params);
            return { rows };
        } catch (error) {
            console.error('Database query error:', error);
            throw error;
        }
    }
};