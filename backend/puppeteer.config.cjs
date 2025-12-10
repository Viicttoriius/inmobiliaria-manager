const {join} = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Configurar la caché de Puppeteer dentro de la carpeta del backend
  // para que se incluya en la build de Electron (extraResources)
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
