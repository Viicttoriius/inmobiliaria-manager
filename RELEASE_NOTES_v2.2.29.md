# Notas de la Versión v2.2.29

## ⚡ Mejoras en Ejecución de Scrapers
- **Aumento de Tiempo de Espera (Timeout):**
  - Se ha incrementado el límite de espera del frontend de **5 minutos a 30 minutos** para la ejecución manual de scrapers.
  - Esto evita el mensaje de error "Tiempo de espera agotado" cuando el scraper está procesando un gran volumen de propiedades, permitiendo ver el log completo y la confirmación de finalización en la interfaz.
  - En caso de superar incluso los 30 minutos, el mensaje de error ahora es más descriptivo, indicando que el proceso continúa en segundo plano.
