# Changelog - Inmobiliaria Manager

Todas las cambios notables de este proyecto serán documentados en este archivo.

## [2.2.20] - 2025-12-18
### Fixed
- **Scraper Idealista**: Corregida la clasificación de tipo de propiedad. Ahora detecta "terrenos" y "parcelas" en el título en lugar de marcar todo como "vivienda".
- **Extracción de Nombres**: Añadido soporte prioritario para extraer el nombre real del particular desde inputs ocultos (`user-name`), solucionando casos donde se extraía un nombre genérico.
- **Actualización de Clientes**: Mejorada la lógica en `sqlite-manager` para que, si un cliente ya existe por teléfono pero tiene nombre genérico ("Particular", "Anunciante"), se actualice automáticamente con el nombre real extraído.
- **Email Inbox**: Aumentado el timeout de conexión IMAP de 15s a 40s para evitar errores de conexión (500 Internal Server Error) causados por el throttling de Gmail.

## [2.2.16] - 2025-12-16
### Fixed
- **Scraper Idealista**: Sincronización completa de la lógica de extracción entre el scraper individual y el masivo para garantizar consistencia en los datos.
- **Extracción de Contacto**: Solucionado bug donde nombres de particulares con paréntesis o formatos complejos eran ignorados. Ahora se capturan como candidatos y se limpian correctamente.
- **Teléfonos**: Reforzada la lógica de extracción de teléfonos con validación por regex y múltiples selectores de respaldo para evitar "No disponible".

## [2.2.15] - 2025-12-16
### Improved
- **Instalador de Windows**: Se ha mejorado el instalador para detectar y cerrar automáticamente la aplicación si está abierta antes de iniciar la instalación/actualización, evitando el error de "Reintentar" por archivos bloqueados.
- **Cierre de Aplicación**: El proceso de backend ahora se termina de manera forzada (`SIGKILL`) al cerrar la aplicación, asegurando que no queden procesos "zombie" bloqueando actualizaciones futuras.

## [2.2.14] - 2025-12-16
### Fixed
- **Actualización de Propiedades**: Solucionado error crítico donde la actualización manual de propiedades reportaba "0 propiedades actualizadas" al no guardar correctamente los datos en la base de datos SQLite.
- **Scraper Idealista**: Mejorada la estrategia de extracción de nombres de contacto en anuncios de particulares, añadiendo múltiples selectores de respaldo para mayor precisión.
- **Backend Persistence**: Ahora la ruta `/api/properties/update` realiza un "upsert" directo a SQLite, garantizando que los datos frescos estén disponibles inmediatamente en la UI.

## [2.2.13] - 2025-12-16
### Fixed
- **IA Análisis**: Corrección del endpoint de IA para usar correctamente la clave de API configurada y fallback robusto a análisis estadístico en caso de fallo de conexión.
- **Scraper Idealista**: Unificada la lógica de extracción de datos (teléfono y nombre) entre el scraper masivo y el individual para garantizar consistencia.
- **Frontend**: Corrección en las tarjetas de propiedad para mostrar adecuadamente los datos de anunciantes "Particular" y teléfonos "No disponible" de Idealista.

## [2.2.12] - 2025-12-16
### Added
- **Inteligencia Artificial**: Actualizado el catálogo de modelos OpenRouter disponibles. Ahora incluye opciones gratuitas más potentes: GPT-4o OSS 120B/20B, DeepSeek R1 Chimera, Llama 3.3 70B y DeepSeek V3.1 Nex.

### Fixed
- **Scraper Idealista**: Solucionado problema de extracción de "Nombre de Contacto" y "Teléfono" en anuncios de particulares. Se han implementado múltiples estrategias de selectores CSS y clicks forzados para garantizar la captura de datos ante cambios en el DOM de la web.

## [2.2.11] - 2025-12-16
### Fixed
- **Estabilidad Crítica**: Solucionado error `ENOSPC: no space left on device` que podía bloquear la aplicación. Implementada rotación inteligente de logs (límite 5MB) para evitar el llenado del disco.
- **Auto-Updater**: Corregido falso positivo en reporte de errores (404 Not Found para `latest-mac.yml`). Ahora el sistema gestiona silenciosamente la ausencia de actualizaciones para plataformas no publicadas en lugar de reportarlo como fallo crítico a Sentry.

## [2.2.10] - 2025-12-16
### Fixed
- **Hotfix**: Corrección de ruta en imports de backend.

## [2.1.14] - 2025-12-15
### Fixed
- **macOS Build Isolation**: Corregido error de arquitectura `incompatible architecture (have (arm64), need (x86_64h))` en Macs Intel. Se ha reescrito el pipeline de GitHub Actions para separar completamente las builds de x64 y arm64 en máquinas virtuales diferentes, evitando la contaminación cruzada de módulos nativos como `better-sqlite3`.

## [2.1.13] - 2025-12-15
### Fixed
- **WhatsApp Web Crash**: Solucionado error crítico `Cannot read properties of null (reading '1')` en `LocalWebCache.js`. Este error ocurría cuando WhatsApp Web cambiaba su estructura interna y el patrón de detección de versión (`manifest-X.json`) fallaba, provocando un cierre inesperado del backend. Se ha añadido validación de nulidad robusta.

## [2.1.12] - 2025-12-15
### Fixed
- **Electron Crash**: Downgrade de Electron a versión estable LTS (v33.2.1) para solucionar crash nativo `EXC_BAD_ACCESS` / `EXC_I386_GPFLT` en macOS. La versión anterior usaba una versión inestable/inexistente que provocaba fallos de memoria en el hilo principal de Chromium.

## [2.1.11] - 2025-12-15
### Fixed
- **macOS Crash**: Solucionado error crítico `Unknown system error -86` (Bad CPU Type) en Macs con Apple Silicon/Intel. Implementado sistema de fallback automático que cambia al Python del sistema si el ejecutable empaquetado falla por incompatibilidad de arquitectura.
- **Backend Stability**: Protegido el ciclo de scrapers automáticos contra cierres inesperados (Unhandled Rejections) mediante manejo robusto de promesas.

## [2.1.10] - 2025-12-15
### Fixed
- **CI/CD**: Solucionado error 422 en la subida de releases. Implementado sistema de limpieza automática de releases y assets previos para evitar colisiones en GitHub Actions.
- **Scraper Idealista**: Añadido soporte para "Locales" y "Terrenos" en el scraper manual.
- **Scraper Idealista**: Implementada navegación robusta con cierre y reapertura de navegador por página para evitar bloqueos.
- **Scraper Idealista**: Mejorada extracción de teléfonos (click automático en "Ver teléfono") y detección de anunciantes particulares.

## [2.1.8] - 2025-12-15
### Fixed
- **Scrapers**: Corregido bucle infinito en paginación de Fotocasa. Ahora el scraper navega correctamente entre páginas y respeta los filtros de búsqueda.
- **Scrapers**: Solucionado problema donde el navegador no se cerraba correctamente tras finalizar una página en Fotocasa.

## [2.1.7] - 2025-12-15
### Fixed
- **Backend**: Mejoras críticas en estabilidad de WhatsApp (Puppeteer).
- **Backend**: Auto-reparación de sesión corrupta en caso de errores de protocolo.
- **Backend**: Prevención de bloqueos por "SingletonLock".

## [2.1.6] - 2025-12-15
### Fixed
- **Updater**: Mejorada la experiencia de usuario al buscar actualizaciones. Ahora muestra "Estás actualizado" en lugar de un error 404 si no se encuentra información de nueva versión.
- **Updater**: Suprimido mensaje de error técnico (HttpError: 404 latest.yml) en la interfaz.

## [2.1.5] - 2025-12-15
### Fixed
- **WhatsApp**: Corregido error de inicialización del navegador (timeout/selector) en versión empaquetada.
- **WhatsApp**: Implementado sistema de limpieza automática de sesión en caso de corrupción.
- **macOS**: Solucionado error de arquitectura incompatible (arm64 vs x86_64) en módulo better-sqlite3.
- **Backend**: Inclusión correcta de dependencias de Puppeteer y caché en el instalador final.
- **Scrapers**: Solucionado error "Cannot set headers" al finalizar procesos de scraping.
- **Scrapers**: Corregidos permisos de escritura para archivos de debug (ahora usan carpeta temporal del sistema).
- **Dependencias**: Añadida librería `html5lib` faltante para scraping robusto de Fotocasa.

## [2.1.4] - 2025-12-15
### Fixed
- **CI/CD**: Solucionados problemas de construcción en macOS y Linux.
- **Instalador**: Mejorada la reputación del instalador de Windows (GUID fijo).
- **Linux**: Soporte mejorado para distribuciones Linux (AppImage y Deb).

## [2.1.3] - 2025-12-15
### Added
- **Calendario Mejorado**: Interfaz de calendario premium con estilos corregidos y alta visibilidad.
- **Recordatorios**: Sistema de notificaciones nativas (Windows/Mac/Linux) para citas próximas.
- **Sincronización**: Integración de citas desde la ficha de cliente al calendario.
- **Monitoreo**: Activación completa de Sentry en Frontend y Backend para detección de errores en tiempo real.

### Fixed
- Eliminado espacio vacío en encabezados de días del calendario ("All day row").
- Corregida visibilidad de textos y rejilla en modo oscuro.
- Solucionados errores de sintaxis en `sqlite-manager` y `CalendarPanel`.

## [2.1.1] - 2025-12-15

### 🎉 Nuevas Características

#### Sistema de Gestión de Archivos Mejorado
- **Historial de archivos procesados**: Los archivos JSON de propiedades ahora se mueven a una carpeta `processed/` en lugar de eliminarse, manteniendo un historial completo
- **Nueva función de limpieza manual**: Dos botones separados en configuración para limpiar archivos temporales y archivos procesados de forma independiente
- **Mejor control de limpieza**: El sistema ya no borra automáticamente los archivos de propiedades, solo cuando el usuario lo solicita

#### Scrapers - Mejoras Críticas
- **Guardado de datos al detener scrapers**: Cuando se detiene manualmente un scraper, ahora consolida y guarda todos los datos extraídos antes de terminar
- **Consolidación inmediata en scrapers automáticos**: Los scrapers automáticos ahora consolidan datos inmediatamente después de completar cada ciclo
- **Mejores estadísticas**: Muestra información detallada de propiedades insertadas/actualizadas al detener scrapers
- **Recarga automática**: El frontend recarga automáticamente la lista de propiedades cuando se detiene un scraper con datos nuevos

### ✨ Mejoras

#### Interfaz de Usuario
- **Configuración reorganizada**: La sección de "Mantenimiento" ahora tiene dos botones claros:
  - 🗑️ Limpiar Archivos Temporales (carpeta update)
  - 📦 Limpiar Archivos Procesados (historial JSON)
- **Mensajes más descriptivos**: Mejor feedback al usuario sobre qué hace cada acción de limpieza
- **Notificaciones mejoradas**: Notificaciones más específicas con conteo de propiedades encontradas

#### Backend
- **Consolidación optimizada**: La función `processJsonFile` ahora mueve archivos a `processed/` con mejor manejo de errores
- **Logging mejorado**: Mejor información en consola sobre el procesamiento de archivos
- **Notificaciones inteligentes**: Solo notifica cuando hay datos nuevos, evitando spam de notificaciones

### 🐛 Correcciones

- **Archivos no se perdían**: Solucionado problema donde los archivos JSON se borraban antes de poder verificarlos
- **Datos perdidos al detener scraper**: Ahora se guardan todos los datos extraídos incluso si se detiene el scraper manualmente
- **Consolidación más robusta**: Mejor manejo de errores al mover archivos a la carpeta `processed/`
- **Limpieza accidental**: Ya no se borran archivos de propiedades con la función de limpieza de temporales

### 🔧 Cambios Técnicos

#### Estructura de Carpetas
```
data/
├── properties/
│   ├── processed/          # Archivos ya importados a SQLite (nuevo)
│   ├── errors/             # Archivos con errores
│   └── *.json              # Archivos pendientes de procesar
└── update/                 # Archivos temporales de actualización
```

#### Flujo de Datos Actualizado
1. Scraper guarda JSON en `data/properties/`
2. Backend detecta archivo y lo renombra a `.processing`
3. Importa datos a SQLite
4. Mueve archivo a `data/properties/processed/` (antes se borraba)
5. Usuario puede limpiar historial manualmente cuando lo desee

### 📝 Notas de Desarrollo

- Versión backend: 2.1.0 (antes 1.2.22)
- Versión frontend: 2.1.0 (antes 1.1.6)
- Versión principal: 2.1.0 (antes 2.0.4)

---

## [2.0.4] - Versión anterior

Para ver el historial de versiones anteriores, consulta los releases en GitHub.
