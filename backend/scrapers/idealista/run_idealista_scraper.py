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

# Constantes URLs
URLS = {
    "viviendas": "https://www.idealista.com/areas/venta-viviendas/?shape=%28%28ecamF%7Cng%40jx%5Bs%7Ej%40foAyeXlxLig%60%40nt%40ihCzdo%40%60b%60Bm%7D%7DA%7EsH%29%29&ordenado-por=fecha-publicacion-desc",
    "locales": "https://www.idealista.com/areas/venta-locales/?shape=%28%28ecamF%7Cng%40jx%5Bs%7Ej%40foAyeXlxLig%60%40nt%40ihCzdo%40%60b%60Bm%7D%7DA%7EsH%29%29&ordenado-por=fecha-publicacion-desc",
    "terrenos": "https://www.idealista.com/areas/venta-terrenos/?shape=%28%28ecamF%7Cng%40jx%5Bs%7Ej%40foAyeXlxLig%60%40nt%40ihCzdo%40%60b%60Bm%7D%7DA%7EsH%29%29&ordenado-por=fecha-publicacion-desc"
}

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
            print(f"Edge falló ({e}), intentando Chrome...")
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
        options.add_argument('user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        
        service = ChromeService(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=options)

    # Stealth JS
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    return driver

def scrape_idealista(property_type="viviendas", limit=1):
    print(f"Iniciando scraper Idealista para {property_type}...")
    driver = setup_driver(headless=False) # Forzamos visual para evitar bloqueos Cloudflare
    properties = []
    
    try:
        url = URLS.get(property_type)
        if not url:
            print("Tipo de propiedad no válido")
            return []

        driver.get(url)
        time.sleep(random.uniform(3, 6)) # Esperar carga + Cloudflare
        
        # Aceptar cookies si aparecen
        try:
            cookie_btn = WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.ID, 'didomi-notice-agree-button')))
            cookie_btn.click()
            time.sleep(2)
        except:
            pass

        # Obtener artículos
        articles = driver.find_elements(By.TAG_NAME, 'article')
        print(f"Encontrados {len(articles)} artículos en la lista.")
        
        candidates = []

        for article in articles:
            try:
                # 1. Filtrar por logo (Agencias)
                try:
                    logo = article.find_element(By.CLASS_NAME, 'logo-branding')
                    if logo:
                        # print("Saltando agencia (logo detectado)")
                        continue
                except:
                    pass # No tiene logo, es candidato
                
                # Obtener link
                link_elem = article.find_element(By.CSS_SELECTOR, 'a.item-link')
                url_detail = link_elem.get_attribute('href')
                
                # Obtener algunos datos preliminares
                title = link_elem.text
                price_elem = article.find_element(By.CSS_SELECTOR, 'span.item-price')
                price = price_elem.text if price_elem else "0"
                
                candidates.append({
                    "url": url_detail,
                    "title": title,
                    "price": price
                })
                
            except Exception as e:
                continue
                
        print(f"Candidatos (posibles particulares): {len(candidates)}")
        
        # 2. Verificar cada candidato entrando al detalle
        for cand in candidates:
            try:
                print(f"Verificando: {cand['url']}")
                driver.get(cand['url'])
                time.sleep(random.uniform(2, 4))
                
                is_particular = False
                
                # Verificar texto "Particular" o clase professional-name
                try:
                    prof_name = driver.find_element(By.CLASS_NAME, 'professional-name')
                    name_text = prof_name.find_element(By.CLASS_NAME, 'name').text
                    if "Particular" in name_text or "particular" in name_text.lower():
                        is_particular = True
                except:
                    # Fallback check
                    if "Particular" in driver.page_source:
                         is_particular = True

                if is_particular:
                    print("✅ ES PARTICULAR! Extrayendo datos...")
                    
                    # Intentar ver el teléfono (click en botón)
                    phone = "No disponible"
                    try:
                        phone_btn = driver.find_element(By.CSS_SELECTOR, '#contact-phones-container a.see-phones-btn')
                        driver.execute_script("arguments[0].click();", phone_btn)
                        time.sleep(1)
                        # Buscar el número que aparece
                        phone_elem = driver.find_element(By.CSS_SELECTOR, '.phone-number-block') # Selector aproximado
                        phone = phone_elem.text
                    except:
                        # Fallback a ver si aparece en el texto
                        pass

                    prop_data = {
                        "source": "idealista",
                        "property_type": property_type,
                        "title": cand['title'],
                        "price": cand['price'],
                        "url": cand['url'],
                        "description": "", # TBD
                        "phone": phone,
                        "location": "", # TBD
                        "advertiser": "Particular",
                        "scrape_date": datetime.now().isoformat()
                    }
                    
                    # Extraer descripción
                    try:
                        desc = driver.find_element(By.CSS_SELECTOR, '.comment').text
                        prop_data["description"] = desc
                    except: pass
                    
                    # Extraer ubicación
                    try:
                        loc = driver.find_element(By.ID, 'headerMap').text
                        prop_data["location"] = loc
                    except: pass

                    properties.append(prop_data)
                else:
                    print("❌ No es particular.")
                    
            except Exception as e:
                print(f"Error verificando {cand['url']}: {e}")
                continue

    except Exception as e:
        print(f"Error global en scraper: {e}")
    finally:
        if driver:
            driver.quit()
            
    return properties

def save_to_json(properties):
    if not properties:
        print("No hay propiedades para guardar.")
        return

    output_dir = os.environ.get('PROPERTIES_OUTPUT_DIR', os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'properties'))
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    timestamp = int(time.time() * 1000)
    filename = f"idealista_manual_{timestamp}.json"
    filepath = os.path.join(output_dir, filename)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(properties, f, ensure_ascii=False, indent=2)
        
    print(f"Guardado en: {filepath}")

if __name__ == "__main__":
    # Leer argumentos si los hay (tipo de propiedad)
    ptype = "viviendas"
    if len(sys.argv) > 1:
        arg_json = sys.argv[1]
        try:
             args = json.loads(arg_json)
             if "type" in args: ptype = args["type"]
        except:
             pass

    props = scrape_idealista(ptype)
    save_to_json(props)
    
    # Salida JSON al final para que el backend la lea si es update
    print(json.dumps(props, ensure_ascii=False))
