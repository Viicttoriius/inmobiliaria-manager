# Notas de la Versión v2.2.31

## ⚡ Mejoras en Ejecución de Scrapers
- **Eliminación Total del Timeout en Frontend:**
  - **Cambio:** Se ha eliminado por completo el límite de tiempo de espera (timeout) en la interfaz gráfica al ejecutar scrapers manuales.
  - **Motivo:** Los procesos de scraping intensivos (ej. +100 páginas en Fotocasa) pueden durar más de 2 horas. El timeout anterior (incluso el de 30 min) interrumpía falsamente la monitorización visual del proceso.
  - **Nuevo Comportamiento:** La interfaz esperará indefinidamente hasta que el scraper termine o hasta que el usuario decida detenerlo manualmente usando el botón "Detener".
