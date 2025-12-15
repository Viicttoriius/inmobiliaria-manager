const imaps = require('imap-simple');
const simpleParser = require('mailparser').simpleParser;
const sqliteManager = require('../db/sqlite-manager');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

let isRunning = false;
let checkInterval = null;

// Config
const CHECK_INTERVAL_MS = 60000 * 5; // 5 minutos

async function checkEmails() {
    if (isRunning) return;
    isRunning = true;
    console.log('📧 Chequeando correos de Idealista...');

    // Load credentials from storage or DB
    // Assuming config storage in a json file for now as per previous code context
    // or using environment variables if set
    let config = {
        user: process.env.EMAIL_USER,
        password: process.env.EMAIL_PASS,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        authTimeout: 3000
    };

    // Try to load from local config file created by UI
    const CONFIG_FILE = path.join(__dirname, '..', 'data', 'email_config.json');
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

        const searchCriteria = [
            'UNSEEN',
            ['FROM', 'idealista'] // Filter idealista emails
        ];

        const fetchOptions = {
            bodies: ['HEADER', 'TEXT'],
            markSeen: true
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        console.log(`📧 Encontrados ${messages.length} nuevos correos de Idealista.`);

        for (const item of messages) {
            const all = item.parts.find(part => part.which === 'TEXT');
            const id = item.attributes.uid;
            const idHeader = "Imap-Id: " + id + "\r\n";

            const mail = await simpleParser(idHeader + all.body);

            // Extract URL from body
            // Idealista often puts the main link in a button or clean href
            // We look for patterns like https://www.idealista.com/inmueble/12345678/
            const urlRegex = /https:\/\/www\.idealista\.com\/inmueble\/\d+\/?/;
            const match = mail.text ? mail.text.match(urlRegex) : (mail.html ? mail.html.match(urlRegex) : null);

            const propertyUrl = match ? match[0] : null;

            await sqliteManager.saveEmail({
                uid: id,
                from_address: mail.from.text,
                to_address: mail.to ? mail.to.text : '',
                subject: mail.subject,
                date: mail.date ? mail.date.toISOString() : new Date().toISOString(),
                snippet: mail.text ? mail.text.substring(0, 200) : '',
                has_property_link: propertyUrl ? 1 : 0,
                property_url: propertyUrl || ''
            });

            if (propertyUrl) {
                console.log(`🏠 URL Detectada: ${propertyUrl}`);
                // Trigger python scraper immediately or mark for batch?
                // For now, let's trigger single processing
                processEmailUrl(propertyUrl);
            }
        }

        connection.end();
    } catch (error) {
        console.error('❌ Error conectando IMAP:', error.message);
    } finally {
        isRunning = false;
    }
}

function processEmailUrl(url) {
    console.log(`🔎 Iniciando scraper automático para: ${url}`);

    const pythonScript = path.join(__dirname, '..', 'scrapers', 'idealista', 'run_idealista_single.py');
    // Using simple python call
    const cmd = `python "${pythonScript}" "${url}"`;

    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error script python: ${error.message}`);
            return;
        }
        try {
            const result = JSON.parse(stdout);
            if (result.error) {
                console.log(`⚠️ Scraper returned error: ${result.error}`);
            } else if (result.advertiser === 'Particular') {
                console.log('🎉 PROPIEDAD DE PARTICULAR CAPTURADA:', result.title);
                // Save to DB via backend logic? 
                // Or maybe the script outputting JSON is enough if we capture it here
                // We should add it to sqlite properties table.
                // Assuming sqliteManager has addProperty.
                // But sqliteManager stores differently.
                // For now just log it. Real integration requires mapping.
            } else {
                console.log('ℹ️ Descartado (No particular)');
            }
        } catch (e) {
            console.log("Output no JSON:", stdout);
        }
    });
}

function startMonitoring() {
    if (checkInterval) clearInterval(checkInterval);
    checkEmails(); // Run once immediately
    checkInterval = setInterval(checkEmails, CHECK_INTERVAL_MS);
    console.log('📧 Monitor de Email Iniciado.');
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
