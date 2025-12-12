#!/usr/bin/env node
'use strict';

/**
 * Migration Script: JSON to SQLite
 * 
 * Este script migra los datos existentes de archivos JSON a la base de datos SQLite.
 * Ejecutar una sola vez después de configurar la base de datos.
 * 
 * Uso: node migrate-data.js
 */

const fs = require('fs');
const path = require('path');

// Import SQLite manager
const sqliteManager = require('../db/sqlite-manager');

// Determine paths
const BASE_PATH = process.env.USER_DATA_PATH || path.join(__dirname, '..', '..');
const DATA_DIR = path.join(BASE_PATH, 'data');
const PROPERTIES_DIR = path.join(DATA_DIR, 'properties');
const CLIENTS_FILE = path.join(DATA_DIR, 'clients', 'clients.json');
const PROPERTIES_JSON_FILE = path.join(DATA_DIR, 'properties.json');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║        MIGRACIÓN DE DATOS: JSON → SQLite                   ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');
console.log(`📁 Directorio de datos: ${DATA_DIR}`);
console.log('');

// Statistics
let stats = {
    propertiesMigrated: 0,
    propertiesSkipped: 0,
    propertiesErrors: 0,
    clientsMigrated: 0,
    clientsSkipped: 0,
    clientsErrors: 0
};

/**
 * Migrate properties from JSON files
 */
function migrateProperties() {
    console.log('────────────────────────────────────────────────────────────');
    console.log('📦 MIGRANDO PROPIEDADES...');
    console.log('────────────────────────────────────────────────────────────');

    const allProperties = [];

    // 1. First, try to read from consolidated properties.json
    if (fs.existsSync(PROPERTIES_JSON_FILE)) {
        console.log(`   📄 Leyendo archivo consolidado: ${PROPERTIES_JSON_FILE}`);
        try {
            const content = fs.readFileSync(PROPERTIES_JSON_FILE, 'utf8');
            const properties = JSON.parse(content);

            if (Array.isArray(properties)) {
                properties.forEach(prop => {
                    if (prop.url) {
                        allProperties.push({
                            ...prop,
                            source: prop.source || 'Fotocasa'
                        });
                    }
                });
                console.log(`   ✅ Encontradas ${properties.length} propiedades en archivo consolidado`);
            }
        } catch (error) {
            console.error(`   ❌ Error leyendo properties.json: ${error.message}`);
        }
    }

    // 2. Also read from individual scraper files in properties/ directory
    if (fs.existsSync(PROPERTIES_DIR)) {
        console.log(`   📁 Buscando archivos en: ${PROPERTIES_DIR}`);

        const files = fs.readdirSync(PROPERTIES_DIR).filter(f => f.endsWith('.json'));
        console.log(`   📄 Encontrados ${files.length} archivos JSON`);

        for (const file of files) {
            const filePath = path.join(PROPERTIES_DIR, file);
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const data = JSON.parse(content);

                // Handle both formats: array or object with properties array
                let properties = [];
                if (Array.isArray(data)) {
                    properties = data;
                } else if (data.properties && Array.isArray(data.properties)) {
                    properties = data.properties.map(p => ({
                        ...p,
                        property_type: data.property_type || p.property_type,
                        source: data.source || p.source || 'Fotocasa'
                    }));
                }

                for (const prop of properties) {
                    if (prop.url && !allProperties.some(p => p.url === prop.url)) {
                        allProperties.push(prop);
                    }
                }

                console.log(`      ✓ ${file}: ${properties.length} propiedades`);
            } catch (error) {
                console.error(`      ✗ ${file}: Error - ${error.message}`);
                stats.propertiesErrors++;
            }
        }
    }

    // 3. Insert all properties into SQLite
    console.log('');
    console.log(`   📊 Total de propiedades únicas a migrar: ${allProperties.length}`);

    if (allProperties.length > 0) {
        console.log('   ⏳ Insertando en SQLite...');

        try {
            const result = sqliteManager.bulkInsertProperties(allProperties);
            stats.propertiesMigrated = result.inserted + result.updated;
            console.log(`   ✅ Migración completada: ${result.inserted} insertadas, ${result.updated} actualizadas`);
        } catch (error) {
            console.error(`   ❌ Error en migración masiva: ${error.message}`);

            // Fallback: insert one by one
            console.log('   🔄 Intentando inserción individual...');
            for (const prop of allProperties) {
                try {
                    sqliteManager.upsertProperty(prop);
                    stats.propertiesMigrated++;
                } catch (e) {
                    stats.propertiesErrors++;
                }
            }
        }
    }
}

/**
 * Migrate clients from JSON file
 */
function migrateClients() {
    console.log('');
    console.log('────────────────────────────────────────────────────────────');
    console.log('👥 MIGRANDO CLIENTES...');
    console.log('────────────────────────────────────────────────────────────');

    if (!fs.existsSync(CLIENTS_FILE)) {
        console.log(`   ⚠️ No se encontró archivo de clientes: ${CLIENTS_FILE}`);
        return;
    }

    try {
        console.log(`   📄 Leyendo: ${CLIENTS_FILE}`);
        const content = fs.readFileSync(CLIENTS_FILE, 'utf8');
        const clients = JSON.parse(content);

        if (!Array.isArray(clients)) {
            console.log('   ⚠️ El archivo de clientes no contiene un array válido');
            return;
        }

        console.log(`   📊 Encontrados ${clients.length} clientes`);
        console.log('   ⏳ Insertando en SQLite uno por uno...');

        // Insert one by one with detailed error handling
        for (const client of clients) {
            try {
                // Generate a unique ID if missing
                const clientToInsert = {
                    ...client,
                    id: client.id || Date.now().toString() + Math.random().toString(36).substr(2, 9)
                };

                sqliteManager.insertClient(clientToInsert);
                stats.clientsMigrated++;
            } catch (e) {
                // Log the first few errors
                if (stats.clientsErrors < 5) {
                    console.error(`      ✗ Error insertando cliente ${client.name || client.phone}: ${e.message}`);
                }
                stats.clientsErrors++;
            }
        }

        console.log(`   ✅ Migración completada: ${stats.clientsMigrated} insertados, ${stats.clientsErrors} errores`);

    } catch (error) {
        console.error(`   ❌ Error leyendo clients.json: ${error.message}`);
        stats.clientsErrors++;
    }
}

/**
 * Create backup of JSON files
 */
function createBackup() {
    console.log('');
    console.log('────────────────────────────────────────────────────────────');
    console.log('💾 CREANDO BACKUP DE ARCHIVOS JSON...');
    console.log('────────────────────────────────────────────────────────────');

    const backupDir = path.join(DATA_DIR, 'backup_json_' + Date.now());

    try {
        fs.mkdirSync(backupDir, { recursive: true });

        // Backup clients
        if (fs.existsSync(CLIENTS_FILE)) {
            fs.copyFileSync(CLIENTS_FILE, path.join(backupDir, 'clients.json'));
            console.log(`   ✅ clients.json → backup`);
        }

        // Backup properties.json
        if (fs.existsSync(PROPERTIES_JSON_FILE)) {
            fs.copyFileSync(PROPERTIES_JSON_FILE, path.join(backupDir, 'properties.json'));
            console.log(`   ✅ properties.json → backup`);
        }

        // Backup properties directory
        if (fs.existsSync(PROPERTIES_DIR)) {
            const propertiesBackup = path.join(backupDir, 'properties');
            fs.mkdirSync(propertiesBackup, { recursive: true });

            const files = fs.readdirSync(PROPERTIES_DIR);
            for (const file of files) {
                fs.copyFileSync(
                    path.join(PROPERTIES_DIR, file),
                    path.join(propertiesBackup, file)
                );
            }
            console.log(`   ✅ ${files.length} archivos de propiedades → backup`);
        }

        console.log(`   📁 Backup guardado en: ${backupDir}`);
    } catch (error) {
        console.error(`   ⚠️ Error creando backup: ${error.message}`);
    }
}

/**
 * Print final summary
 */
function printSummary() {
    console.log('');
    console.log('════════════════════════════════════════════════════════════');
    console.log('                    RESUMEN DE MIGRACIÓN                     ');
    console.log('════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  📦 PROPIEDADES:');
    console.log(`     ├─ Migradas:  ${stats.propertiesMigrated}`);
    console.log(`     ├─ Omitidas:  ${stats.propertiesSkipped}`);
    console.log(`     └─ Errores:   ${stats.propertiesErrors}`);
    console.log('');
    console.log('  👥 CLIENTES:');
    console.log(`     ├─ Migrados:  ${stats.clientsMigrated}`);
    console.log(`     ├─ Omitidos:  ${stats.clientsSkipped}`);
    console.log(`     └─ Errores:   ${stats.clientsErrors}`);
    console.log('');

    // Database stats
    const dbStats = sqliteManager.getDatabaseStats();
    console.log('  💾 ESTADO DE LA BASE DE DATOS:');
    console.log(`     ├─ Propiedades: ${dbStats.properties}`);
    console.log(`     ├─ Clientes:    ${dbStats.clients}`);
    console.log(`     ├─ Mensajes:    ${dbStats.messages}`);
    console.log(`     └─ Tamaño:      ${(dbStats.dbSize / 1024).toFixed(2)} KB`);
    console.log('');

    if (stats.propertiesErrors === 0 && stats.clientsErrors === 0) {
        console.log('  ✅ MIGRACIÓN COMPLETADA EXITOSAMENTE');
    } else {
        console.log('  ⚠️ MIGRACIÓN COMPLETADA CON ALGUNOS ERRORES');
    }

    console.log('');
    console.log('════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  PRÓXIMOS PASOS:');
    console.log('  1. Verifica que los datos se migraron correctamente');
    console.log('  2. Los archivos JSON originales se mantienen como backup');
    console.log('  3. Reinicia el servidor backend para usar SQLite');
    console.log('');
}

// ============ MAIN EXECUTION ============

async function main() {
    try {
        // Create backup first
        createBackup();

        // Migrate data
        migrateProperties();
        migrateClients();

        // Print summary
        printSummary();

        // Close database
        sqliteManager.closeDB();

        process.exit(0);
    } catch (error) {
        console.error('');
        console.error('❌ ERROR FATAL EN MIGRACIÓN:', error);
        console.error('');
        process.exit(1);
    }
}

main();
