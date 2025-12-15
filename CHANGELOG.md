# Changelog - Inmobiliaria Manager

Todas las cambios notables de este proyecto serán documentados en este archivo.

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
