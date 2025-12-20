# Release Notes v2.2.23

## 🤖 Mejoras en el Bot de WhatsApp (IA)

### Inteligencia Contextual
- **Lectura de Propiedades:** El bot ahora identifica automáticamente el inmueble que vende el cliente (si existe el enlace) e incorpora datos reales:
  - **Tipo de propiedad:** (Piso, Chalet, Terreno...)
  - **Ubicación:** (Dénia, Las Marinas, etc.)
  - **Precio:** Utiliza el precio real para contextualizar.
  - **Descripción:** Lee características clave (piscina, reformas, etc.).

### Ética y Seguridad (Nuevo "Cerebro")
- **Reglas de Honestidad:** Se han implementado directrices estrictas para evitar promesas falsas.
  - El bot **NUNCA** inventará compradores específicos.
  - Explicará que gestiona una cartera de clientes pero que **necesita ver la propiedad** para confirmar si encaja.
- **Protocolo Anti-Conflicto:** Si detecta agresividad o amenazas legales, el bot terminará la conversación educadamente y dejará de insistir.
- **Identidad Clara:** Se presenta como "Alex Aldazabal, Asesor Inmobiliario (particular/independiente)".

### Multilingüe y Formato
- **Detección de Idioma:** Responde automáticamente en el idioma del cliente (Inglés, Alemán, Francés, etc.).
- **Tono Profesional:** Limitado el uso de emojis (máx 1 por mensaje) para mantener seriedad.

## 💻 Mejoras en la Interfaz (Chat)

### Control Manual
- **Botón "Parar Bot":** Nueva funcionalidad en el chat para pausar la automatización con un solo clic si el usuario decide intervenir manualmente.
- **Indicador de Estado:** Visualización clara de si el bot está ACTIVO o PAUSADO para ese cliente.

## 🛠️ Correcciones Técnicas
- **Scripts Genéricos:** Actualizados los guiones de venta para usar términos neutros como "propiedad" o "inmueble" en lugar de solo "casa" o "vivienda".
- **Estabilidad:** Mejoras en la conexión con el servidor de IA y manejo de errores.
