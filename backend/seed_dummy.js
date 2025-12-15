const sqliteManager = require('./db/sqlite-manager');
const path = require('path');

// Init DB (ya sabe dónde está)
sqliteManager.initDB();

const dummyProp = {
    url: "https://www.fotocasa.es/es/comprar/vivienda/madrid/dummy-123456",
    title: "Piso de prueba en Madrid (Dummy)",
    price: "250.000 €",
    description: "Esta es una propiedad de prueba generada por la IA para verificar el renderizado.",
    phone: "600600600",
    image_url: "https://via.placeholder.com/400x300",
    property_type: "viviendas",
    source: "fotocasa",
    scrape_date: new Date().toISOString(),
    location: "Madrid",
    timeago: "Publicado hace 1 hora",
    extra_data: JSON.stringify({ advertiser: "Particular", meters: "100 m²", rooms: "3 habs." })
};

try {
    const changes = sqliteManager.upsertProperty(dummyProp);
    console.log(`Propiedad insertada. Cambios:`, changes);
} catch (e) {
    console.error("Error insertando:", e);
}
