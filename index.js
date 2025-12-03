const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = 3000;

const db = new sqlite3.Database('./shop.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initializeDB();
    }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function initializeDB() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            description TEXT,
            price REAL,
            image_url TEXT,
            stock_quantity INTEGER NOT NULL DEFAULT 0
        )`, () => {
            db.get(`SELECT COUNT(*) AS count FROM users`, (err, row) => {
                if (row && row.count === 0) {
                    db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`, ['admin', 'admin123', 'admin']);
                    db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`, ['customer', 'customer123', 'customer']);
                    console.log('Default Admin: admin/admin123 | Default Customer: customer/customer123');
                }
            });

            db.get(`SELECT COUNT(*) AS count FROM products`, (err, row) => {
                if (row && row.count === 0) {
                    db.run(`INSERT INTO products (name, description, price, image_url, stock_quantity) VALUES (?, ?, ?, ?, ?)`, ['Eco Coffee Mug', 'A reusable ceramic mug made from recycled materials.', 150.00, 'https://purpleclay.com/cdn/shop/articles/coffee_cups.png?v=1716910046', 100]);
                    db.run(`INSERT INTO products (name, description, price, image_url, stock_quantity) VALUES (?, ?, ?, ?, ?)`, ['Organic T-Shirt', 'Made from 100% organic cotton, soft and durable.', 255.50, 'https://marksandspencer.com.ph/cdn/shop/files/SD_01_T41_7341_Y0_X_EC_90_86297a32-4aa6-4598-ba52-745efc330ae4.jpg?v=1703133811', 50]);
                    db.run(`INSERT INTO products (name, description, price, image_url, stock_quantity) VALUES (?, ?, ?, ?, ?)`, ['Bamboo Toothbrush', 'Sustainable dental care, pack of 4.', 50.00, 'https://www.smilesofmemorial.com/blog/wp-content/uploads/2024/02/bamboo-toothbrushes-for-better-oral-health.png', 100]); 
                    db.run(`INSERT INTO products (name, description, price, image_url, stock_quantity) VALUES (?, ?, ?, ?, ?)`, ['Recycled Glass Vase', 'Unique hand-blown vase for your home decor.', 359.90, 'https://thehomeemporium.com/cdn/shop/files/ECL30091_main-10_1200x1200.jpg?v=1691713312', 150]); 
                    console.log('Default products inserted.');
                }
            });
        });
    });
}

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const sql = `SELECT role FROM users WHERE username = ? AND password = ?`;

    db.get(sql, [username, password], (err, row) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Database error.' });
        }
        if (row) {
            res.json({ success: true, role: row.role });
        } else {
            res.status(401).json({ success: false, message: 'Invalid username or password.' });
        }
    });
});

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    const role = 'customer';
    const sql = `INSERT INTO users (username, password, role) VALUES (?, ?, ?)`;
    
    db.run(sql, [username, password, role], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ success: false, message: 'Username already taken.' });
            }
            return res.status(500).json({ success: false, message: 'Database error: ' + err.message });
        }
        res.status(201).json({ success: true, message: 'Account registered successfully!' });
    });
});

app.get('/api/products', (req, res) => {
    const sql = `SELECT * FROM products ORDER BY name`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Database error.' });
        }
        res.json(rows);
    });
});

app.post('/api/add-product', (req, res) => {
    const { name, description, price, image_url, stock_quantity } = req.body;
    const stock = parseInt(stock_quantity);

    const sql = `INSERT INTO products (name, description, price, image_url, stock_quantity) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [name, description, price, image_url, stock], function(err) {
        if (err) {
            return res.status(500).json({ success: false, message: 'Database error: ' + err.message });
        }
        res.json({ success: true, id: this.lastID });
    });
});

app.post('/api/edit-product', (req, res) => {
    const { id, name, description, price, image_url, stock_quantity } = req.body;
    
    if (!id || !name || !price || !stock_quantity) {
        return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    const sql = `UPDATE products 
                  SET name = ?, 
                      description = ?, 
                      price = ?, 
                      image_url = ?, 
                      stock_quantity = ? 
                  WHERE id = ?`;
    
    db.run(sql, [name, description, price, image_url, parseInt(stock_quantity), id], function(err) {
        if (err) {
            return res.status(500).json({ success: false, message: 'Database error: ' + err.message });
        }
        if (this.changes === 0) {
             return res.status(404).json({ success: false, message: 'Product not found.' });
        }
        res.json({ success: true, message: 'Product updated successfully!' });
    });
});

app.delete('/api/remove-product/:id', (req, res) => {
    const id = req.params.id;
    const sql = `DELETE FROM products WHERE id = ?`;
    db.run(sql, id, function(err) {
        if (err) {
            return res.status(500).json({ success: false, message: 'Database error.' });
        }
        res.json({ success: true, changes: this.changes });
    });
});

app.post('/api/process-order', (req, res) => {
    const { orderItems } = req.body;
    
    db.serialize(() => {
        db.run('BEGIN TRANSACTION;');

        let failureMessage = null;

        orderItems.forEach(item => {
            if (failureMessage) return;

            const sql = 'UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND stock_quantity >= ?;';
            
            db.run(sql, [item.quantity, item.id, item.quantity], function(err) {
                if (err) {
                    failureMessage = 'Database error updating stock: ' + err.message;
                    db.run('ROLLBACK;');
                    return;
                }
                if (this.changes === 0) {
                    failureMessage = `Stock check failed for item ID ${item.id}. Not enough stock available.`;
                    db.run('ROLLBACK;');
                    return;
                }
            });
        });

        if (!failureMessage) {
            db.run('COMMIT;', (commitErr) => {
                if (commitErr) {
                    return res.status(500).json({ success: false, message: 'Commit error: ' + commitErr.message });
                }
                res.json({ success: true, message: 'Order processed and stock updated successfully.' });
            });
        } else {
            res.status(400).json({ success: false, message: failureMessage });
        }
    });
});


app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    console.log('Default Admin: admin/admin123 | Default Customer: customer/customer123');
});