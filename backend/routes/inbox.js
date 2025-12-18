const express = require('express');
const router = express.Router();
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');

// Helper to get config
const getConfig = () => {
    let config = {
        user: process.env.EMAIL_USER,
        password: process.env.EMAIL_PASS,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 10000
    };

    // Try to load from local config file
    const BASE_PATH = process.env.USER_DATA_PATH || path.join(__dirname, '..', '..');
    const CONFIG_FILE = path.join(BASE_PATH, 'data', 'email_config.json');
    
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const savedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            if (savedConfig.email && savedConfig.password) {
                config.user = savedConfig.email;
                config.password = savedConfig.password;
            }
        }
    } catch (e) {
        console.error('Error loading email config:', e);
    }
    return config;
};

// GET /api/inbox - Get list of emails
router.get('/', async (req, res) => {
    const config = getConfig();
    if (!config.user || !config.password) {
        return res.status(400).json({ error: 'Email not configured' });
    }

    let connection = null;
    try {
        console.log('🔌 Conectando a IMAP para obtener inbox...');
        connection = await imaps.connect({ imap: config });
        
        console.log('📂 Abriendo INBOX...');
        await connection.openBox('INBOX');

        const searchCriteria = ['ALL'];
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT'],
            markSeen: false,
            struct: true
        };

        console.log('🔍 Buscando correos...');
        // Fetch last 50 emails
        const messages = await connection.search(searchCriteria, fetchOptions);
        
        // Sort by date desc and take last 50
        const sortedMessages = messages.sort((a, b) => {
            return new Date(b.attributes.date) - new Date(a.attributes.date);
        }).slice(0, 50);

        const emails = await Promise.all(sortedMessages.map(async (item) => {
            const headerPart = item.parts.find(p => p.which === 'HEADER');
            // We don't parse the full body here for speed, just header
            return {
                uid: item.attributes.uid,
                seq: item.seq,
                date: item.attributes.date,
                from: headerPart.body.from ? headerPart.body.from[0] : 'Unknown',
                subject: headerPart.body.subject ? headerPart.body.subject[0] : '(No Subject)',
                flags: item.attributes.flags
            };
        }));

        res.json(emails);
    } catch (err) {
        console.error('Error fetching inbox:', err);
        if (err.textCode === 'AUTHENTICATIONFAILED' || (err.message && err.message.includes('Invalid credentials'))) {
            return res.status(401).json({ error: 'Credenciales inválidas. Revise su configuración de email.' });
        }
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) {
            try {
                connection.end();
            } catch (e) { console.error('Error cerrando conexión IMAP:', e); }
        }
    }
});

// GET /api/inbox/:uid - Get single email body
router.get('/:uid', async (req, res) => {
    const config = getConfig();
    if (!config.user || !config.password) {
        return res.status(400).json({ error: 'Email not configured' });
    }

    let connection = null;
    try {
        connection = await imaps.connect({ imap: config });
        await connection.openBox('INBOX');

        const searchCriteria = [['UID', req.params.uid]];
        const fetchOptions = {
            bodies: [''], // Fetch full body
            markSeen: true
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        if (messages.length === 0) {
            return res.status(404).json({ error: 'Email not found' });
        }

        const item = messages[0];
        const all = item.parts.find(part => part.which === '');
        const id = item.attributes.uid;
        const idHeader = "Imap-Id: " + id + "\r\n";

        const mail = await simpleParser(idHeader + all.body);

        res.json({
            uid: id,
            from: mail.from.value,
            to: mail.to ? mail.to.value : [],
            subject: mail.subject,
            date: mail.date,
            html: mail.html || mail.textAsHtml || mail.text,
            text: mail.text
        });
    } catch (err) {
        console.error('Error fetching email body:', err);
        if (err.textCode === 'AUTHENTICATIONFAILED' || (err.message && err.message.includes('Invalid credentials'))) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) {
            try {
                connection.end();
            } catch (e) { console.error('Error closing connection:', e); }
        }
    }
});

module.exports = router;
