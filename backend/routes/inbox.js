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
        authTimeout: 30000
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

// GET /api/inbox - Get list of emails (Optimized)
router.get('/', async (req, res) => {
    let connection = null;
    try {
        const config = getConfig();
        console.log('🔌 Conectando a IMAP con usuario:', config.user);

        // Validar configuración
        if (!config.user || !config.password) {
            console.error('❌ Credenciales de email no configuradas o incompletas.');
            return res.status(400).json({ error: 'Credenciales de email no configuradas' });
        }

        // Timeout manual para la conexión (40 segundos)
        const connectPromise = imaps.connect({ imap: config });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 40000));
        
        connection = await Promise.race([connectPromise, timeoutPromise]);

        await connection.openBox('INBOX');

        // Buscar específicamente correos de Fotocasa e Idealista (Remitentes exactos)
        const searchCriteria = [
            ['OR', 
                ['FROM', 'enviosfotocasa@fotocasa.es'], 
                ['FROM', 'noresponder@idealista.com']
            ]
        ];

        const fetchOptions = {
            bodies: ['HEADER', 'TEXT'],
            markSeen: false,
            struct: true
        };

        // Obtener correos
        const messages = await connection.search(searchCriteria, fetchOptions);
        
        // Ordenar por fecha descendente y tomar los últimos 50 (aumentado de 20)
        messages.sort((a, b) => new Date(b.attributes.date) - new Date(a.attributes.date));
        const recentMessages = messages.slice(0, 50);

        console.log(`📨 Recuperados ${recentMessages.length} correos de portales.`);

        const emails = await Promise.all(recentMessages.map(async (item) => {
            const all = item.parts.find(part => part.which === 'TEXT');
            const id = item.attributes.uid;
            const idHeader = "Imap-Id: " + id + "\r\n";
            const simpleParserPromise = simpleParser(idHeader + all.body);
            
            try {
                const mail = await simpleParserPromise;
                return {
                    uid: item.attributes.uid,
                    from: item.parts.find(p => p.which === 'HEADER').body.from[0],
                    subject: item.parts.find(p => p.which === 'HEADER').body.subject[0],
                    date: item.attributes.date,
                    body: mail.text ? mail.text.substring(0, 200) + '...' : '(Sin vista previa)',
                    seen: item.attributes.flags && item.attributes.flags.includes('\\Seen')
                };
            } catch (err) {
                 return {
                    uid: item.attributes.uid,
                    from: item.parts.find(p => p.which === 'HEADER').body.from ? item.parts.find(p => p.which === 'HEADER').body.from[0] : 'Desconocido',
                    subject: item.parts.find(p => p.which === 'HEADER').body.subject ? item.parts.find(p => p.which === 'HEADER').body.subject[0] : 'Sin asunto',
                    date: item.attributes.date,
                    body: '(Error analizando cuerpo)',
                    seen: item.attributes.flags && item.attributes.flags.includes('\\Seen')
                };
            }
        }));

        connection.end();
        res.json(emails);
    } catch (error) {
        console.error('❌ Error fetching emails:', error);
        if (connection) {
             try { connection.end(); } catch(e) {}
        }
        res.status(500).json({ error: error.message });
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
