# coding: utf-8
import sys
import json
import time
import os
import random
import platform
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.chrome.service import Service as ChromeService
from webdriver_manager.chrome import ChromeDriverManager
from webdriver_manager.microsoft import EdgeChromiumDriverManager
from selenium.webdriver.edge.options import Options as EdgeOptions
from selenium.webdriver.edge.service import Service as EdgeService

# Configurar salida UTF-8
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except AttributeError:
    pass

from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

# Constantes URLs
URLS = {
    "viviendas": "https://www.idealista.com/areas/venta-viviendas/?shape=%28%28ecamF%7Cng%40jx%5Bs%7Ej%40foAyeXlxLig%60%40nt%40ihCzdo%40%60b%60Bm%7D%7DA%7EsH%29%29&ordenado-por=fecha-publicacion-desc",
    "locales": "https://www.idealista.com/areas/venta-locales/?shape=%28%28ecamF%7Cng%40jx%5Bs%7Ej%40foAyeXlxLig%60%40nt%40ihCzdo%40%60b%60Bm%7D%7DA%7EsH%29%29&ordenado-por=fecha-publicacion-desc",
    "terrenos": "https://www.idealista.com/areas/venta-terrenos/?shape=%28%28ecamF%7Cng%40jx%5Bs%7Ej%40foAyeXlxLig%60%40nt%40ihCzdo%40%60b%60Bm%7D%7DA%7EsH%29%29&ordenado-por=fecha-publicacion-desc"
}

def construct_idealista_url(base_full_url, page_num):
    """
    Construye la URL de Idealista inyectando /pagina-X en el path.
    Ej: .../venta-locales/pagina-2?shape=...
    """
    if page_num <= 1:
        return base_full_url
        
    try:
        parsed = urlparse(base_full_url)
        path = parsed.path # /areas/venta-locales/
        query = parsed.query
        
        # Eliminar slash final si existe para añadir pagina-X
        if path.endswith('/'):
            path = path[:-1]
            
        # Construir nuevo path
        new_path = f"{path}/pagina-{page_num}"
        
        new_parsed = parsed._replace(path=new_path)
        return urlunparse(new_parsed)
    except Exception as e:
        sys.stderr.write(f"Error construyendo URL paginada: {e}\n")
        return base_full_url

def setup_driver(headless=False): # Default to visible for Idealista to reduce blocks
    system = platform.system()
    options = None
    service = None
    driver = None

    if system == 'Windows':
        options = EdgeOptions()
        options.use_chromium = True
        options.add_argument('--start-maximized')
        if headless:
            options.add_argument('--headless')
        
        # Anti-detection
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option('useAutomationExtension', False)
        
        try:
            service = EdgeService(EdgeChromiumDriverManager().install())
            driver = webdriver.Edge(service=service, options=options)
        except Exception as e:
            # Fallback a Chrome
            sys.stderr.write(f"Edge falló ({e}), intentando Chrome...\n")
            options = ChromeOptions()
            if headless: options.add_argument('--headless=new')
            options.add_argument('--start-maximized')
            options.add_argument('--disable-blink-features=AutomationControlled')
            options.add_experimental_option("excludeSwitches", ["enable-automation"])
            options.add_experimental_option('useAutomationExtension', False)
            service = ChromeService(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=options)
            
    else: # Linux/Mac
        options = ChromeOptions()
        if headless: options.add_argument('--headless=new')
        options.add_argument('--start-maximized')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option('useAutomationExtension', False)
        
        # User Agent Random
        if system == 'Darwin':
             options.add_argument('user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        else:
             options.add_argument('user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        
        service = ChromeService(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=options)

    # Stealth JS
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    return driver

def extract_detail_data(driver, url, known_data=None):
    """
    Verifica si la página actual (ya cargada en driver) es particular
    y extrae los datos. Retorna dict o None.
    """
    if known_data is None:
        known_data = {}
        
    is_particular = False
    initial_name_found = ""

    # Verificar texto "Particular" o clase professional-name
    try:
        prof_name = driver.find_element(By.CLASS_NAME, 'professional-name')
        name_text = prof_name.find_element(By.CLASS_NAME, 'name').text
        initial_name_found = name_text
        if "Particular" in name_text or "particular" in name_text.lower():
            is_particular = True
    except:
        if "Particular" in driver.page_source:
             is_particular = True

    if not is_particular:
        return None

    sys.stderr.write("    ✅ ES PARTICULAR! Extrayendo datos...\n")
    
    # Extract Contact Name
    contact_name = "Particular"
    
    # Si encontramos un nombre al principio que contiene "Particular", intentamos limpiarlo
    if initial_name_found and len(initial_name_found) > 10:
         cleaned = initial_name_found.replace("Particular", "").replace("particular", "").replace("()", "").strip()
         if len(cleaned) > 2:
             contact_name = cleaned

    try:
        name_selectors = [
            '.professional-name .name',
            '.advertiser-name', 
            '.contact-data .name', 
            '.about-advertiser-name',
            '.contact-name',
            'div.name',
            '.advertiser-data__name',
            '.contact-data__name',
            '#advertiserName',
            'div[class*="advertiser-name"]',
            '.advertiser-data .name',
            '.contact-detail .name'
        ]
        
        candidate_name = None
        
        for selector in name_selectors:
            try:
                name_elems = driver.find_elements(By.CSS_SELECTOR, selector)
                for name_elem in name_elems:
                    extracted_name = name_elem.text.strip()
                    if not extracted_name or len(extracted_name) <= 2: continue
                    
                    # Prioridad: Nombre sin "particular"
                    if "particular" not in extracted_name.lower():
                        contact_name = extracted_name
                        break
                    else:
                        # Si tiene particular, guardarlo como candidato
                        if extracted_name.lower() != "particular":
                             candidate_name = extracted_name
                             
                if contact_name != "Particular": break
            except: continue
            
        # Si no encontramos nombre limpio pero tenemos candidato
        if contact_name == "Particular" and candidate_name:
             contact_name = candidate_name
            
        # Limpieza final
        if "particular" in contact_name.lower():
             cleaned_final = contact_name.replace("Particular", "").replace("particular", "").strip()
             if len(cleaned_final) > 2:
                 contact_name = cleaned_final
             
    except Exception as e:
        sys.stderr.write(f"    ⚠️ Error extrayendo nombre: {e}\n")
        pass

    # Intentar ver el teléfono (click en botón)
    phone = "No disponible"
    try:
        # Buscar botón de teléfono (varios selectores)
        phone_btn_selectors = ["a.see-phones-btn", "button.see-phones-btn", ".phone-cta", "button.btn-phone", ".contact-phones-btn", ".more-info-phone"]
        phone_btn = None
        
        for selector in phone_btn_selectors:
            try:
                phone_btn = WebDriverWait(driver, 3).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                )
                if phone_btn: break
            except: continue
            
        if phone_btn:
            driver.execute_script("arguments[0].scrollIntoView(true);", phone_btn)
            time.sleep(1)
            
            clicked = False
            try:
                driver.execute_script("arguments[0].click();", phone_btn)
                clicked = True
            except:
                try:
                    phone_btn.click()
                    clicked = True
                except: pass
            
            if clicked:
                time.sleep(3) # Esperar un poco más a que cargue el teléfono
                
                # Extraer número (varios selectores)
                phone_text_selectors = [
                    ".phone-number-block p", 
                    ".phone", 
                    ".contact-phones", 
                    ".first-phone", 
                    ".phone-number-block div", 
                    ".phone-number-block span",
                    "a[href^='tel:']",
                    ".contact-phone",
                    ".phone-cta",
                    ".contact-phones-btn"
                ]
                
                for selector in phone_text_selectors:
                    try:
                        if selector == "a[href^='tel:']":
                            phone_elems = driver.find_elements(By.CSS_SELECTOR, selector)
                            for elem in phone_elems:
                                href = elem.get_attribute("href")
                                if href and "tel:" in href:
                                    phone = href.replace("tel:", "").strip()
                                    break
                        else:
                            phone_elems = driver.find_elements(By.CSS_SELECTOR, selector)
                            for phone_elem in phone_elems:
                                p_text = phone_elem.text.strip()
                                # Limpiar y validar que parezca un teléfono (números y espacios/guiones)
                                if p_text:
                                    # Eliminar caracteres no numéricos excepto +
                                    import re
                                    digits = re.sub(r'[^\d+]', '', p_text)
                                    if len(digits) >= 9:
                                        phone = p_text
                                        break
                        if phone != "No disponible": break
                    except: continue
        else:
             sys.stderr.write("    ⚠️ No se encontró botón de teléfono\n")
    except Exception as ex_phone:
        sys.stderr.write(f"    ⚠️ No se pudo extraer teléfono: {ex_phone}\n")
        pass

    # Construir objeto base con lo que ya sabemos
    prop_data = {
        "source": "idealista",
        "property_type": known_data.get("property_type", "viviendas"),
        "title": known_data.get("title", driver.title),
        "price": known_data.get("price", "0"),
        "url": url,
        "image_url": known_data.get("image_url", ""),
        "description": "", 
        "phone": phone,
        "location": "", 
        "advertiser": contact_name,
        "scrape_date": datetime.now().isoformat()
    }
    
    # Extraer precio si no lo tenemos
    if prop_data["price"] == "0":
        try:
            price_elem = driver.find_element(By.CSS_SELECTOR, '.info-data-price span')
            prop_data["price"] = price_elem.text
        except: pass

    # Extraer descripción
    try:
        desc_elem = driver.find_element(By.CSS_SELECTOR, '.comment')
        prop_data["description"] = desc_elem.text
    except: pass
    
    # Extraer ubicación
    try:
        loc_elem = driver.find_element(By.ID, 'headerMap')
        prop_data["location"] = loc_elem.text
    except: pass
    
    # Si no teníamos imagen del listado, intentar del detalle
    if not prop_data["image_url"]:
        try:
            main_img = driver.find_element(By.CSS_SELECTOR, '.main-image img')
            prop_data["image_url"] = main_img.get_attribute('src')
        except: 
             try:
                # Fallback
                grid_img = driver.find_element(By.CSS_SELECTOR, 'img.main-image_img')
                prop_data["image_url"] = grid_img.get_attribute('src')
             except: pass
             
    # Extraer Update Date Info
    date_update_text = ""
    try:
        date_elem = driver.find_element(By.CSS_SELECTOR, '.details-box.date-update-block .date-update-text')
        date_update_text = date_elem.text.strip()
    except: pass

    stats_text = ""
    try:
        stats_elem = driver.find_element(By.CSS_SELECTOR, '.stats-text')
        stats_text = stats_elem.text.strip()
    except: pass
    
    prop_data["extra_data"] = {
        "date_update_text": date_update_text,
        "stats_text": stats_text,
        "advertiser": contact_name
    }

    return prop_data

def process_page(url, property_type):
    """
    Procesa una página individual de Idealista: abre navegador, extrae, cierra.
    """
    sys.stderr.write(f"  Procesando página: {url}\n")
    driver = setup_driver(headless=False)
    properties = []
    
    try:
        driver.get(url)
        time.sleep(random.uniform(4, 7)) # Esperar carga + Cloudflare
        
        # Aceptar cookies si aparecen
        try:
            cookie_btn = WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.ID, 'didomi-notice-agree-button')))
            cookie_btn.click()
            time.sleep(2)
        except:
            pass

        # Obtener artículos
        articles = driver.find_elements(By.TAG_NAME, 'article')
        sys.stderr.write(f"  Encontrados {len(articles)} artículos.\n")
        
        candidates = []

        for article in articles:
            try:
                # 1. Filtrar por logo (Agencias)
                try:
                    logo = article.find_element(By.CLASS_NAME, 'logo-branding')
                    if logo:
                        continue
                except:
                    pass # No tiene logo, es candidato
                
                # Obtener link e imagen
                link_elem = article.find_element(By.CSS_SELECTOR, 'a.item-link')
                url_detail = link_elem.get_attribute('href')
                
                title = link_elem.text
                price_elem = article.find_element(By.CSS_SELECTOR, 'span.item-price')
                price = price_elem.text if price_elem else "0"
                
                # Intentar obtener imagen del listado
                image_url = ""
                try:
                    img_elem = article.find_element(By.CSS_SELECTOR, 'img')
                    src = img_elem.get_attribute('src')
                    data_src = img_elem.get_attribute('data-src')
                    image_url = data_src if data_src else src
                except:
                    pass

                candidates.append({
                    "url": url_detail,
                    "title": title,
                    "price": price,
                    "image_url": image_url,
                    "property_type": property_type
                })
                
            except Exception as e:
                continue
                
        sys.stderr.write(f"  Candidatos (posibles particulares): {len(candidates)}\n")
        
        # 2. Verificar cada candidato entrando al detalle
        for cand in candidates:
            try:
                sys.stderr.write(f"    Verificando: {cand['url']}\n")
                driver.get(cand['url'])
                time.sleep(random.uniform(3, 5))
                
                prop_data = extract_detail_data(driver, cand['url'], cand)
                
                if prop_data:
                    properties.append(prop_data)
                else:
                    sys.stderr.write("    ❌ No es particular.\n")
                    
            except Exception as e:
                sys.stderr.write(f"    Error verificando candidato: {e}\n")
                continue

    except Exception as e:
        sys.stderr.write(f"  ⚠️ Error en página {url}: {e}\n")
    finally:
        if driver:
            sys.stderr.write("  🛑 Cerrando navegador (fin de página)...\n")
            try:
                driver.quit()
            except: pass
            
    return properties

def scrape_single_listing(url):
    """
    Scrapea una url individual (para alertas de correo).
    """
    sys.stderr.write(f"Scrapeando listing individual: {url}\n")
    driver = setup_driver(headless=False)
    result = None
    try:
        driver.get(url)
        time.sleep(random.uniform(3, 6))
        
        # Cookies
        try:
            cookie_btn = WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.ID, 'didomi-notice-agree-button')))
            cookie_btn.click()
            time.sleep(1)
        except: pass
        
        result = extract_detail_data(driver, url)
        
    except Exception as e:
        sys.stderr.write(f"Error scraping single url: {e}\n")
    finally:
        if driver:
            driver.quit()
    return [result] if result else []


def scrape_idealista(property_type="viviendas", max_pages=3):
    sys.stderr.write(f"Iniciando scraper Idealista para {property_type} (Max páginas: {max_pages})...\n")
    
    base_url = URLS.get(property_type)
    if not base_url:
        sys.stderr.write("Tipo de propiedad no válido\n")
        return []
        
    all_properties = []
    
    for page in range(1, max_pages + 1):
        url = construct_idealista_url(base_url, page)
        sys.stderr.write(f"\n--- Iniciando Página {page} ---\n")
        
        page_props = process_page(url, property_type)
        
        if page_props:
            save_to_json(page_props, f"{property_type}_page{page}")
            
        all_properties.extend(page_props)
        
        # Pequeña pausa entre reinicios de navegador
        if page < max_pages:
            time.sleep(random.uniform(2, 4))
            
    return all_properties

def save_to_json(properties, suffix=""):
    if not properties:
        # print("No hay propiedades para guardar.")
        return

    output_dir = os.environ.get('PROPERTIES_OUTPUT_DIR', os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'properties'))
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    timestamp = int(time.time() * 1000)
    filename = f"idealista_{timestamp}_{suffix}.json"
    filepath = os.path.join(output_dir, filename)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump({"properties": properties}, f, ensure_ascii=False, indent=2) # Wrap in object like other scrapers?
        
    sys.stderr.write(f"Guardado en: {filepath}\n")

if __name__ == "__main__":
    # Leer argumentos
    ptype = "viviendas"
    if len(sys.argv) > 1:
        arg_json = sys.argv[1]
        try:
             # Si viene como JSON {"type": "..."}
             if arg_json.startswith('{'):
                args = json.loads(arg_json)
                if "type" in args: ptype = args["type"]
             else:
                # Si viene directo como string
                ptype = arg_json
        except:
             pass

    props = scrape_idealista(ptype)
    # save_to_json(props) # Ya guardamos página a página
    
    # Salida JSON al final para que el backend la lea si es update
    print(json.dumps(props, ensure_ascii=False))
