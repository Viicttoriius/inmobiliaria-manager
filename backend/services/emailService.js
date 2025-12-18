const imaps = require('imap-simple');
const simpleParser = require('mailparser').simpleParser;
const sqliteManager = require('../db/sqlite-manager');
const fs = require('fs');
const path = require('path');

let isRunning = false;
let checkInterval = null;
let onUrlFoundCallback = null;

// Config
const CHECK_INTERVAL_MS = 60000 * 5; // 5 minutos

async function checkEmails() {
    if (isRunning) return;
    isRunning = true;
    console.log('📧 Chequeando correos de alertas inmobiliarias...');

    let config = {
        user: process.env.EMAIL_USER,
        password: process.env.EMAIL_PASS,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false }, // Bypass SSL verification errors
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

    if (!config.user || !config.password) {
        console.log('⚠️ Email no configurado. Saltando chequeo.');
        isRunning = false;
        return;
    }

    try {
        const connection = await imaps.connect({ imap: config });
        await connection.openBox('INBOX');

        // Buscar correos no leídos
        const searchCriteria = ['UNSEEN'];
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT'],
            markSeen: true
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        
        // Filtrar por remitentes de interés
        const targetSenders = ['enviosfotocasa@fotocasa.es', 'noresponder@idealista.com'];
        
        const relevantMessages = messages.filter(item => {
            const header = item.parts.find(p => p.which === 'HEADER');
            const fromLine = header.body.from ? header.body.from[0] : '';
            return targetSenders.some(sender => fromLine.includes(sender));
        });

        if (relevantMessages.length > 0) {
            console.log(`📧 Encontrados ${relevantMessages.length} correos relevantes.`);
        }

        for (const item of relevantMessages) {
            const all = item.parts.find(part => part.which === 'TEXT');
            const id = item.attributes.uid;
            const idHeader = "Imap-Id: " + id + "\r\n";
            const header = item.parts.find(p => p.which === 'HEADER');
            const fromLine = header.body.from ? header.body.from[0] : '';

            const mail = await simpleParser(idHeader + all.body);

            // Determinar fuente
            const source = fromLine.includes('fotocasa') ? 'fotocasa' : 'idealista';

            // Extraer URL
            let propertyUrl = null;
            
            // Regex ajustada para cada portal
            if (source === 'idealista') {
                const urlRegex = /https:\/\/www\.idealista\.com\/inmueble\/\d+\/?/;
                const match = mail.text ? mail.text.match(urlRegex) : (mail.html ? mail.html.match(urlRegex) : null);
                propertyUrl = match ? match[0] : null;
            } else if (source === 'fotocasa') {
                // Fotocasa URLs can be complex, often redirected. Looking for detail pattern.
                // Example: https://www.fotocasa.es/es/comprar/vivienda/madrid-capital/aire-acondicionado-calefaccion-parking-jardin-terraza-trastero-ascensor-piscina/188358686/d
                const urlRegex = /https:\/\/www\.fotocasa\.es\/es\/[\w-]+\/[\w-]+\/[\w-]+\/[\w-]+\/\d+\/d/;
                const match = mail.text ? mail.text.match(urlRegex) : (mail.html ? mail.html.match(urlRegex) : null);
                propertyUrl = match ? match[0] : null;
            }

            // Guardar email en DB (historial)
            await sqliteManager.saveEmail({
                uid: id,
                from_address: mail.from ? mail.from.text : fromLine,
                to_address: mail.to ? mail.to.text : '',
                subject: mail.subject,
                date: mail.date ? mail.date.toISOString() : new Date().toISOString(),
                snippet: mail.text ? mail.text.substring(0, 200) : '',
                has_property_link: propertyUrl ? 1 : 0,
                property_url: propertyUrl || ''
            });

            if (propertyUrl) {
                console.log(`🏠 URL Detectada (${source}): ${propertyUrl}`);
                if (onUrlFoundCallback) {
                    onUrlFoundCallback(propertyUrl, source);
                }
            }
        }

        connection.end();
    } catch (error) {
        console.error('❌ Error chequeando emails:', error.message);
        if (error.textCode === 'AUTHENTICATIONFAILED' || (error.message && error.message.includes('Invalid credentials'))) {
            console.error('⛔ Deteniendo monitor de email por credenciales inválidas. Por favor configure credenciales correctas.');
            if (checkInterval) clearInterval(checkInterval);
            checkInterval = null;
        }
    } finally {
        isRunning = false;
    }
}

function startMonitoring(callback) {
    if (checkInterval) clearInterval(checkInterval);
    onUrlFoundCallback = callback;
    checkEmails(); // Ejecutar inmediatamente
    checkInterval = setInterval(checkEmails, CHECK_INTERVAL_MS);
    console.log('📧 Monitor de Email Iniciado (Fotocasa/Idealista).');
}

function stopMonitoring() {
    if (checkInterval) clearInterval(checkInterval);
    checkInterval = null;
    console.log('📧 Monitor de Email Detenido.');
}

module.exports = {
    startMonitoring,
    stopMonitoring,
    checkEmails
};
