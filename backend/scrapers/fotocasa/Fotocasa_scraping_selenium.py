# coding: utf-8

"""
Scraper de Fotocasa usando Selenium para manejar contenido dinámico
"""

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from selenium.common.exceptions import TimeoutException, NoSuchElementException, ElementClickInterceptedException
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.keys import Keys
from bs4 import BeautifulSoup
import time
import random
import re
import os
import sys

# Configurar la salida estándar a UTF-8 para evitar errores de codificación en Windows (charmap)
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except AttributeError:
    pass  # Versiones antiguas de Python o entornos sin stdout estándar

from selenium.webdriver.edge.options import Options as EdgeOptions
from selenium.webdriver.edge.service import Service as EdgeService
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.chrome.service import Service as ChromeService
from webdriver_manager.chrome import ChromeDriverManager
from webdriver_manager.microsoft import EdgeChromiumDriverManager
import platform

def setup_driver(headless=True):
    """
    Configura y retorna el driver de Selenium.
    - macOS/Linux: Chrome (con fallback a Brave/Chromium)
    - Windows: Edge (con fallback a Chrome)
    
    Incluye detección de versión del sistema para mejor compatibilidad.
    """
    system = platform.system()
    machine = platform.machine()  # Detectar arquitectura (x86_64, arm64)
    
    # Obtener versión del sistema operativo
    try:
        if system == 'Darwin':
            mac_ver = platform.mac_ver()[0]  # Ej: "10.15.7" o "14.0"
            os_version = mac_ver
            os_major = int(mac_ver.split('.')[0]) if mac_ver else 10
            print(f"📱 macOS {mac_ver} detectado ({machine})")
        else:
            os_version = platform.release()
            os_major = 0
    except Exception as e:
        os_version = "unknown"
        os_major = 0
        print(f"⚠️ No se pudo detectar versión del sistema: {e}")
    
    if system == 'Darwin' or system == 'Linux':
        print(f"Detectado sistema {system}. Configurando navegador...")
        
        # Seleccionar User Agent apropiado según versión de macOS
        if system == 'Darwin':
            if os_major >= 11:  # Big Sur y posteriores
                user_agent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            else:  # Catalina y anteriores
                user_agent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
        else:
            user_agent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        
        options = ChromeOptions()
        if headless:
            options.add_argument('--headless=new')  # Nuevo modo headless más compatible
            options.add_argument('--window-size=1920,1080')
        
        # Argumentos de compatibilidad
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--start-maximized')
        options.add_argument('--disable-gpu')  # Mejor compatibilidad con sistemas antiguos
        
        # Para macOS antiguos, deshabilitar características problemáticas
        if system == 'Darwin' and os_major < 11:
            options.add_argument('--disable-features=VizDisplayCompositor')
            options.add_argument('--disable-software-rasterizer')
        
        # Anti-Detección
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option('useAutomationExtension', False)
        options.add_argument(f'user-agent={user_agent}')

        # Lista de navegadores a intentar
        browsers_to_try = []
        
        if system == 'Darwin':
            # macOS: Lista de navegadores en orden de preferencia
            home_dir = os.path.expanduser('~')
            browsers_to_try = [
                ('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'Chrome'),
                (f'{home_dir}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'Chrome (User)'),
                ('/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', 'Brave'),
                ('/Applications/Chromium.app/Contents/MacOS/Chromium', 'Chromium'),
                ('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', 'Edge'),
            ]
        else:
            # Linux
            browsers_to_try = [
                ('/usr/bin/google-chrome', 'Chrome'),
                ('/usr/bin/google-chrome-stable', 'Chrome Stable'),
                ('/usr/bin/chromium-browser', 'Chromium'),
                ('/usr/bin/chromium', 'Chromium'),
                ('/snap/bin/chromium', 'Chromium Snap'),
                ('/usr/bin/brave-browser', 'Brave'),
            ]

        # Intentar con cada navegador disponible
        for browser_path, browser_name in browsers_to_try:
            if os.path.exists(browser_path):
                print(f"🌐 Intentando usar {browser_name}...")
                try:
                    options.binary_location = browser_path
                    service = ChromeService(ChromeDriverManager().install())
                    driver = webdriver.Chrome(service=service, options=options)
                    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
                    print(f"✅ {browser_name} iniciado correctamente")
                    return driver
                except Exception as e:
                    print(f"⚠️ {browser_name} falló: {e}")
                    continue
        
        # Fallback: Intentar sin especificar binario (usar el del sistema)
        print("🔄 Intentando con navegador por defecto del sistema...")
        try:
            # Resetear binary_location
            options = ChromeOptions()
            if headless:
                options.add_argument('--headless=new')
                options.add_argument('--window-size=1920,1080')
            options.add_argument('--no-sandbox')
            options.add_argument('--disable-dev-shm-usage')
            options.add_argument('--disable-blink-features=AutomationControlled')
            options.add_experimental_option("excludeSwitches", ["enable-automation"])
            options.add_experimental_option('useAutomationExtension', False)
            options.add_argument(f'user-agent={user_agent}')
            
            service = ChromeService(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=options)
            driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            return driver
        except Exception as e:
            print(f"❌ Error iniciando Chrome Driver: {e}")
            sys.exit(1)
            
    else:
        # Windows (o otros): Usar Edge (Prioridad original)
        print(f"Detectado sistema {system}. Usando Edge...")
        edge_options = EdgeOptions()
        if headless:
            edge_options.add_argument('--headless=new')
            edge_options.add_argument('--window-size=1920,1080')
        
        edge_options.add_argument('--no-sandbox')
        edge_options.add_argument('--disable-dev-shm-usage')
        edge_options.add_argument('--start-maximized')
        edge_options.add_argument('--guest')
        
        edge_options.add_argument('--disable-blink-features=AutomationControlled')
        edge_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        edge_options.add_experimental_option('useAutomationExtension', False)
        
        edge_options.add_argument('user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0')
        
        try:
            # Intentar usar webdriver_manager primero
            try:
                print("Intentando descargar EdgeDriver con webdriver_manager...")
                service = EdgeService(EdgeChromiumDriverManager().install())
            except Exception as e:
                print(f"⚠️ Falló webdriver_manager para Edge: {e}")
                print("Intentando usar driver local...")
                
                # Fallback a ruta local (Lógica original)
                current_dir = os.path.dirname(os.path.abspath(__file__))
                driver_name = "msedgedriver.exe" if os.name == 'nt' else "msedgedriver"
                driver_path = os.path.join(current_dir, "..", "..", "..", "driver", driver_name)
                driver_path = os.path.abspath(driver_path)
                
                if not os.path.exists(driver_path):
                    # Fallback: Check if we are in a compiled environment (PyInstaller/Electron)
                    # or if the script is running from a different location
                    pass 
                
                if not os.path.exists(driver_path):
                    raise Exception(f"No se encontró el driver en {driver_path} y webdriver_manager falló.")
                    
                service = EdgeService(executable_path=driver_path)

            # Suppress logs (Windows only)
            if os.name == 'nt':
                service.creation_flags = 0x08000000 
            
            driver = webdriver.Edge(service=service, options=edge_options)
            driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            return driver
            
        except Exception as e:
            print(f"❌ Error fatal iniciando Edge WebDriver: {e}")
            sys.exit(1)

def handle_push_alert_modal(driver):
    """Cierra el modal de 'recibir alertas' si aparece."""
    try:
        # Esperar un máximo de 5 segundos a que el modal aparezca
        close_button = WebDriverWait(driver, 5).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, "div.sui-MoleculeModal-dialog button.sui-MoleculeModal-close"))
        )
        if close_button:
            close_button.click()
            print("  🚨 Modal de alerta de novedades cerrado.")
            time.sleep(1) # Pequeña pausa tras cerrar
    except TimeoutException:
        # Si el modal no aparece en 5 segundos, simplemente continuamos.
        pass
    except Exception as e:
        pass
        print(f"  ⚠️ No se pudo cerrar el modal de alerta: {e}")

def handle_cookies(driver):
    """Intenta aceptar o cerrar el banner de cookies"""
    try:
        # Selectores comunes de cookies en Fotocasa
        cookie_selectors = [
            "//button[contains(text(), 'Aceptar')]",
            "//button[contains(text(), 'Aceptar y cerrar')]",
            "//button[@id='didomi-notice-agree-button']"
        ]
        
        for selector in cookie_selectors:
            try:
                button = driver.find_element(By.XPATH, selector)
                if button.is_displayed():
                    button.click()
                    print("  🍪 Cookies aceptadas")
                    time.sleep(1)
                    return
            except:
                pass
    except Exception as e:
        pass
        print(f"  ⚠️ Error manejando cookies: {e}")

def human_like_mouse_move(driver):
    """
    Simula movimientos de ratón moviendo el cursor sobre elementos reales y visibles
    de la página para evitar errores de coordenadas y parecer más humano.
    """
    try:
        actions = ActionChains(driver)
        # Buscar una lista de elementos seguros y visibles sobre los que moverse
        elements = driver.find_elements(By.CSS_SELECTOR, "article, h3, a, img, div[class*='Card']")
        
        if elements:
            # Filtrar solo los elementos que son visibles
            visible_elements = [el for el in elements if el.is_displayed()]
            
            if len(visible_elements) > 3:
                # Mover el cursor sobre un número aleatorio de elementos visibles
                for _ in range(random.randint(1, 3)):
                    element = random.choice(visible_elements)
                    # Mover el cursor al elemento
                    actions.move_to_element(element).perform()
                    # Pausa para simular "observación"
                    time.sleep(random.uniform(0.4, 1.2))
    except Exception as e:
        pass
        # print(f"  ⚠️ No se pudo simular movimiento de ratón v4: {e}")

def scroll_to_bottom(driver):
    """
    Hace scroll gradual y humano hasta el final de la página, con pausas,
    retrocesos y movimientos de rueda del ratón.
    """
    print("  ⬇️  Haciendo scroll (v3) para cargar todos los elementos...")
    actions = ActionChains(driver)
    
    # Simular varios scrolls de rueda de ratón
    for _ in range(random.randint(5, 10)):
        # Scroll hacia abajo
        for _ in range(random.randint(2, 5)):
            actions.send_keys(Keys.PAGE_DOWN).perform()
            time.sleep(random.uniform(0.2, 0.6))
        
        # Pausa para "leer"
        time.sleep(random.uniform(0.8, 2.0))
        
        # Scroll hacia arriba ocasional (15% de probabilidad)
        if random.random() < 0.15:
            for _ in range(random.randint(1, 2)):
                actions.send_keys(Keys.PAGE_UP).perform()
                time.sleep(random.uniform(0.2, 0.5))
            # Pausa después de subir
            time.sleep(random.uniform(0.5, 1.5))

    # Scroll final y vaivén para forzar carga
    driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
    time.sleep(random.uniform(1.5, 2.5))
    driver.execute_script("window.scrollBy(0, -300);") # Subir un poco
    time.sleep(random.uniform(0.8, 1.2))
    driver.execute_script("window.scrollTo(0, document.body.scrollHeight);") # Bajar de nuevo
    time.sleep(random.uniform(2.5, 4.0)) # Espera final más larga

def GetText(element):
    """Obtiene texto de un elemento BeautifulSoup limpiando caracteres invisibles"""
    if not element:
        return 'None'
    text = element.get_text().strip()
    # Limpiar caracteres invisibles
    text = text.replace('\u200c', '').replace('\u200b', '').strip()
    return text if text else 'None'

def extract_properties_from_page(html_content, property_type, sort_by):
    """Extrae propiedades de una página HTML, filtrando solo anuncios de particulares"""
    soup = BeautifulSoup(html_content, 'html5lib')
    properties = []
    
    # Buscar el contenedor principal
    main_content = soup.find('section', {'id': 'main-content'})
    if not main_content:
        main_content = soup.find(id='main-content')
    
    if not main_content:
        # print("  ❌ No se encontró main-content")
        return properties
    
    # Buscar todos los artículos
    articles = main_content.find_all('article')
    print(f"  ✅ Encontrados {len(articles)} artículos en el DOM")
    
    valid_count = 0
    particular_count = 0
    
    for idx, article in enumerate(articles, 1):
        try:
            # ⚠️ FILTRO CRÍTICO: Solo extraer anunciantes particulares
            # Buscar el div con la imagen particular_user_icon.svg O el texto "Anunciante particular"
            is_particular = False
            
            # Chequeo 1: Imagen
            particular_img = article.find('img', {'src': lambda x: x and 'particular_user_icon.svg' in x})
            
            # Chequeo 2: Texto explícito
            # Usamos raw string r"" para evitar advertencias de regex
            particular_text = article.find(string=re.compile(r"Anunciante\s+particular", re.IGNORECASE))
            
            if particular_img or particular_text:
                is_particular = True
                particular_count += 1
            
            # Si no es particular, saltar este artículo
            if not is_particular:
                continue
            
            # PRECIO
            price = 'None'
            price_container = article.find('div', {'class': lambda x: x and 'text-display-3' in x})
            if price_container:
                price_span = price_container.find('span')
                price = GetText(price_span)
            
            # TÍTULO
            title = 'None'
            h3_element = article.find('h3', {'class': lambda x: x and 'text-subhead' in x})
            if h3_element:
                title = GetText(h3_element)
            
            # Fallback Título
            if title == 'None' or title == '':
                link_text = article.find('a', {'class': 're-Card-title'})
                if link_text:
                    title = GetText(link_text)

            # MUNICIPIO (Intentar extraer del título o descripción si no hay campo explícito)
            municipality = 'Desconocido'
            
            # Intento 1: Buscar elemento específico de dirección/ubicación
            # Buscamos elementos que contengan 'address', 'location' o 'subtitle' en su clase
            location_element = article.find(['span', 'div', 'h4'], {'class': lambda x: x and any(k in x for k in ['address', 'location', 'subtitle'])})
            
            if location_element:
                municipality = GetText(location_element)
            
            # Intento 2: Extraer del título (ej: "Piso en Dénia" o "Piso en Calle X, Dénia")
            if municipality == 'Desconocido' and title != 'None':
                # Buscar " en " y tomar lo que sigue
                match = re.search(r"\s+en\s+(.*)", title, re.IGNORECASE)
                if match:
                    extracted = match.group(1).strip()
                    # Si hay comas, a veces el formato es "Calle, Municipio"
                    # Intentamos limpiar un poco
                    municipality = extracted
            
            # ANUNCIANTE (Por defecto Particular ya que filtramos por eso)
            advertiser = 'Anunciante Particular'
            
            # DESCRIPCIÓN
            description = 'None'
            desc_element = article.find('p', {'class': lambda x: x and 'hidden' in x})
            if desc_element:
                description = GetText(desc_element)
            
            # CARACTERÍSTICAS
            hab = 'None'
            m2 = 'None'
            ul_features = article.find('ul', {'class': lambda x: x and 'text-body-1' in x})
            if ul_features:
                features_list = ul_features.find_all('li', {'class': lambda x: x and 'inline' in x})
                for feature_li in features_list:
                    text = GetText(feature_li)
                    if 'hab' in text:
                        hab = text
                    elif 'm²' in text:
                        m2 = text
            
            # FECHA
            timeago = 'None'
            timeago_li = article.find('li', {'class': lambda x: x and 'capitalize' in x})
            if timeago_li:
                timeago = GetText(timeago_li)
            
            # TELÉFONO
            phone = 'None'
            phone_link = article.find('a', {'href': lambda x: x and x.startswith('tel:')})
            if phone_link:
                phone = phone_link['href'].replace('tel:', '')
            
            # ENLACE
            full_url = 'None'
            link_element = article.find('a', {'data-panot-component': 'link-box-link'})
            if not link_element:
                link_element = article.find('a', {'href': lambda x: x and '/comprar/' in x})
            
            if link_element and link_element.has_attr('href'):
                href = link_element['href']
                full_url = 'https://www.fotocasa.es' + href if href.startswith('/') else href
            
            # IMAGEN
            imgurl = 'None'
            img_element = article.find('img', {'src': lambda x: x and 'fotocasa.es' in x})
            if img_element and 'src' in img_element.attrs:
                imgurl = img_element['src']
            
            # Solo añadir si tiene datos válidos
            if title != 'None' and price != 'None':
                properties.append({
                    'Title': title,
                    'Description': description,
                    'Price': price,
                    'hab': hab,
                    'm2': m2,
                    'Timeago': timeago,
                    'Phone': phone,
                    'url': full_url,
                    'imgurl': imgurl,
                    'Municipality': municipality,
                    'Advertiser': advertiser
                })
                valid_count += 1
        
        except Exception as e:
            # print(f"  ⚠️ Error en artículo {idx}: {e}")
            continue
    
    # print(f"  ✅ {valid_count} propiedades válidas extraídas de {len(articles)} posibles")
    return properties

def get_total_pages(driver):
    """Obtiene el número total de páginas disponibles"""
    try:
        # Esperar explícitamente a que aparezca el contenedor de paginación
        wait = WebDriverWait(driver, 10)
        
        try:
            pagination = wait.until(
                EC.presence_of_element_located((By.XPATH, "//nav[@data-panot-component='pagination']"))
            )
            print("  ✅ Contenedor de paginación encontrado.")
        except TimeoutException:
            print("  ⚠️ No se encontró el contenedor de paginación después de esperar 10 segundos.")
            return 1
        
        # Buscar todos los botones de paginación con data-panot-component='pagination-button'
        page_buttons = pagination.find_elements(By.XPATH, ".//li[@data-panot-component='pagination-button']")
        
        if not page_buttons:
            print("  ⚠️ No se encontraron botones de número de página.")
            return 1
        
        print(f"  ✅ Encontrados {len(page_buttons)} botones de página.")
        
        last_page = 1
        for button in page_buttons:
            try:
                # El número de página está en el texto del enlace dentro del <li>
                link = button.find_element(By.TAG_NAME, "a")
                page_text = link.text.strip()
                
                # Solo intentamos convertir si es un número (ignoramos "..." y otros)
                if page_text.isdigit():
                    page_num = int(page_text)
                    if page_num > last_page:
                        last_page = page_num
            except (ValueError, AttributeError, NoSuchElementException):
                continue
        
        print(f"  ✅ Última página detectada: {last_page}")
        return last_page
        
    except Exception as e:
        print(f"  ⚠️ Error al determinar el número total de páginas: {e}")
        return 1

def scrape_fotocasa_selenium(start_url, property_type, sort_by="publicationDate", max_pages=None):
    """
    Scraper principal que abre y cierra el navegador para cada página.
    """
    all_properties = []
    total_pages = 1
    
    # --- Fase 1: Obtener el número total de páginas ---
    print(f"Iniciando scraping para: {property_type}...")
    
    driver = None
    try:
        driver = setup_driver(headless=False)  # Modo visible (necesario para detectar paginación)
        initial_url = f"{start_url}?sortType={sort_by}"
        print(f"  🔍 Accediendo a: {initial_url}")
        driver.get(initial_url)
        time.sleep(2)
        handle_cookies(driver)
        handle_push_alert_modal(driver)
        scroll_to_bottom(driver)
        
        # GUARDAR HTML PARA DEBUG EN RUTA SEGURA
        import tempfile
        debug_path = os.path.join(tempfile.gettempdir(), "fotocasa_debug_page.html")
        try:
            with open(debug_path, "w", encoding="utf-8") as f:
                f.write(driver.page_source)
            print(f"  🔍 HTML guardado en {debug_path} para revisión")
        except Exception as e:
            print(f"  ⚠️ No se pudo guardar HTML de debug: {e}")
        
        total_pages = get_total_pages(driver)
        if max_pages and max_pages < total_pages:
            total_pages = max_pages
        print(f"Total de páginas a procesar: {total_pages}")
        
    except Exception as e:
        print(f"Error en Fase 1: {e}")
    finally:
        if driver:
            driver.quit()

    # --- Fase 2: Scrapear cada página individualmente ---
    
    for page_num in range(1, total_pages + 1):
        driver = None
        try:
            # Construcción de URL según el patrón solicitado
            # Si es la página 1, usamos la URL base (o /1 si se prefiere, pero la base es más segura)
            # El usuario indicó: .../l/2?sortType=...
            if page_num == 1:
                page_url = f"{start_url}?sortType={sort_by}"
            else:
                page_url = f"{start_url}/{page_num}?sortType={sort_by}"
                
            print(f"Procesando página {page_num}/{total_pages}...")

            driver = setup_driver(headless=False)  # Modo visible
            wait = WebDriverWait(driver, 20)
            
            driver.get(page_url)
            time.sleep(2)
            
            # Siempre intentamos manejar cookies/modales por si acaso
            handle_cookies(driver)
            handle_push_alert_modal(driver)

            scroll_to_bottom(driver)
            
            try:
                wait.until(EC.presence_of_element_located((By.ID, "main-content")))
            except TimeoutException:
                # print(f"  ⚠️ Timeout esperando contenido en página {page_num}.")
                continue

            human_like_mouse_move(driver)
            time.sleep(random.uniform(1, 3))
            
            html_content = driver.page_source
            
            if "No hay resultados" in html_content and len(driver.find_elements(By.TAG_NAME, "article")) == 0:
                print("Fin del listado.")
                break
                
            page_properties = extract_properties_from_page(html_content, property_type, sort_by)
            
            if page_properties:
                all_properties.extend(page_properties)
                print(f"Propiedades encontradas hasta ahora: {len(all_properties)}")
            
        except Exception as e:
            print(f"Error procesando la página {page_num}: {e}")
        finally:
            if driver:
                driver.quit()
            # Pausa entre solicitudes
            time.sleep(random.uniform(5, 10))
            
    return all_properties

import json
from datetime import datetime
import uuid

def save_to_json(properties, property_type, location, output_dir):
    """Guarda la lista de propiedades en un archivo JSON con un ID único por propiedad."""
    if not properties:
        print("No hay propiedades para guardar.")
        return

    # Añadir un ID único a cada propiedad
    for prop in properties:
        prop['id'] = str(uuid.uuid4())

    # Crear estructura final
    output_data = {
        'source': 'fotocasa',
        'location': location,
        'property_type': property_type,
        'scrape_date': datetime.now().isoformat(),
        'total_properties': len(properties),
        'properties': properties
    }
    
    # Generar nombre de archivo de salida
    timestamp = int(datetime.now().timestamp() * 1000)
    output_filename = f'fotocasa_{property_type}_{location}_{timestamp}.json'
    output_path = os.path.join(output_dir, output_filename)
    
    # Guardar JSON
    os.makedirs(output_dir, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    
    print(f"Datos guardados correctamente en '{output_path}'")
    print(f"  ℹ️ El servidor backend insertará las propiedades en SQLite automáticamente.")
