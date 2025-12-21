# coding: utf-8
import sys
import json
import time
import os
import secrets
import platform
import random
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service as ChromeService
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.options import Options as ChromeOptions
# Importar Edge también para compatibilidad completa como en el scraper principal
from webdriver_manager.microsoft import EdgeChromiumDriverManager
from selenium.webdriver.edge.options import Options as EdgeOptions
from selenium.webdriver.edge.service import Service as EdgeService

# Configurar salida UTF-8
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except AttributeError:
    pass

def setup_driver(headless=False):
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
        
        # User Agent Random / Specific for macOS
        if system == 'Darwin':
             options.add_argument('user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        else:
             options.add_argument('user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        
        options.add_argument('--lang=es-ES')
        
        service = ChromeService(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=options)

    # Stealth JS
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    return driver

def scrape_single_url(url, driver=None):
    # Usar stderr para logs para no ensuciar stdout (que es para el JSON final)
    sys.stderr.write(f"Scraping single URL: {url}\n")
    
    should_close_driver = False
    if driver is None:
        driver = setup_driver(headless=False) # Visual para evitar bloqueos
        should_close_driver = True
        
    result = None

    try:
        driver.get(url)
        time.sleep(random.uniform(4, 7)) # Espera aleatoria más humana
        
        # Cookies
        try:
            # Didomi (most common)
            try:
                cookie_btn = WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.ID, 'didomi-notice-agree-button')))
                cookie_btn.click()
                time.sleep(1)
            except:
                # Other potential cookie buttons
                for selector in ["button[data-testid='accept-cookies-button']", ".cookie-consent-accept", "#accept-cookies", "button.didomi-components-button"]:
                    try:
                        btn = driver.find_element(By.CSS_SELECTOR, selector)
                        btn.click()
                        break
                    except: pass
            time.sleep(1)
        except:
            pass

        # Check Particular
        is_particular = False
        initial_name_found = ""
        try:
            prof_name = driver.find_element(By.CLASS_NAME, 'professional-name')
            name_text = prof_name.find_element(By.CLASS_NAME, 'name').text
            initial_name_found = name_text
            if "Particular" in name_text or "particular" in name_text.lower():
                is_particular = True
        except:
            if "Particular" in driver.page_source: is_particular = True

        if is_particular:
            sys.stderr.write("✅ ES PARTICULAR\n")
            
            # Extract basic data
            title = driver.title
            try: 
                title_elem = driver.find_element(By.CSS_SELECTOR, '.main-info__title-main')
                title = title_elem.text
            except: pass
            
            price = "0"
            try: 
                price_elem = driver.find_element(By.CSS_SELECTOR, '.info-data-price span')
                price = price_elem.text
            except: pass
            
            # Extract Contact Name
            contact_name = "Particular"
            
            # Si encontramos un nombre al principio que contiene "Particular", intentamos limpiarlo
            if initial_name_found and len(initial_name_found) > 10:
                 cleaned = initial_name_found.replace("Particular", "").replace("particular", "").replace("()", "").strip()
                 if len(cleaned) > 2:
                     contact_name = cleaned

            try:
                # 0. User specific selector (Hidden input in .particular)
                try:
                    user_name_input = driver.find_element(By.CSS_SELECTOR, '.particular input[name="user-name"]')
                    val = user_name_input.get_attribute('value')
                    if val and len(val) > 2:
                        contact_name = val.strip()
                        sys.stderr.write(f"    🔍 Nombre encontrado por input hidden: {contact_name}\n")
                except: pass

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
                    '.contact-detail .name',
                    '.user-name',
                    '.header-user-name'
                ]
                
                candidate_name = None
                
                for selector in name_selectors:
                    try:
                        name_elems = driver.find_elements(By.CSS_SELECTOR, selector)
                        for name_elem in name_elems:
                            extracted_name = name_elem.text.strip()
                            if not extracted_name or len(extracted_name) <= 2: continue
                            
                            # Log para debug
                            sys.stderr.write(f"    🔍 Candidato nombre encontrado ({selector}): {extracted_name}\n")

                            # Prioridad: Nombre sin "particular"
                            if "particular" not in extracted_name.lower():
                                contact_name = extracted_name
                                break
                            else:
                                # Si tiene particular, guardarlo como candidato por si acaso
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

            # Extract Phone Number
            phone = "No disponible"
            try:
                # Scroll to phone button to ensure visibility
                phone_btn_selectors = ["a.see-phones-btn", "button.see-phones-btn", ".phone-cta", "button.btn-phone", ".contact-phones-btn", ".more-info-phone"]
                phone_btn = None
                
                # 1. Try CSS Selectors
                for selector in phone_btn_selectors:
                    try:
                        phone_btn = WebDriverWait(driver, 2).until(
                            EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                        )
                        if phone_btn: 
                            sys.stderr.write(f"    📞 Botón encontrado por CSS: {selector}\n")
                            break
                    except: continue
                
                # 2. Try XPath Text Search if CSS fails
                if not phone_btn:
                    try:
                        phone_btn = driver.find_element(By.XPATH, "//button[contains(., 'teléfono') or contains(., 'Call')]")
                        sys.stderr.write("    📞 Botón encontrado por XPath\n")
                    except: pass

                if phone_btn:
                    driver.execute_script("arguments[0].scrollIntoView(true);", phone_btn)
                    time.sleep(1)
                    
                    # Intentar click JS y normal con ActionChains
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
                        
                        # Extraer número - Intentar varios selectores y estrategias
                        phone_text_selectors = [
                            ".phone-number-block p", 
                            ".phone", 
                            ".contact-phones", 
                            ".first-phone", 
                            ".phone-number-block div", 
                            ".phone-number-block span",
                            "a[href^='tel:']", # Selector muy robusto
                            ".contact-phone",
                            ".phone-cta",
                            ".contact-phones-btn",
                            "span.phone"
                        ]
                        
                        for selector in phone_text_selectors:
                            try:
                                if selector == "a[href^='tel:']":
                                    phone_elems = driver.find_elements(By.CSS_SELECTOR, selector)
                                    for elem in phone_elems:
                                        href = elem.get_attribute("href")
                                        if href and "tel:" in href:
                                            phone = href.replace("tel:", "").strip()
                                            sys.stderr.write(f"    📱 Teléfono encontrado por href: {phone}\n")
                                            break
                                else:
                                    phone_elems = driver.find_elements(By.CSS_SELECTOR, selector)
                                    for phone_elem in phone_elems:
                                        p_text = phone_elem.text.strip()
                                        sys.stderr.write(f"    🔍 Candidato teléfono ({selector}): {p_text}\n")
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
            except Exception as e:
                sys.stderr.write(f"    ⚠️ No se pudo extraer teléfono: {e}\n")
                pass
            
            # Extract Image
            image_url = ""
            try:
                # Try main image
                main_img = driver.find_element(By.CSS_SELECTOR, '.main-image img')
                image_url = main_img.get_attribute('src')
            except: 
                try:
                    # Fallback to first grid image if main fails
                    grid_img = driver.find_element(By.CSS_SELECTOR, 'img.main-image_img')
                    image_url = grid_img.get_attribute('src')
                except: pass

            # Extract Update Date Info
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
            
            extra_data = {
                "date_update_text": date_update_text,
                "stats_text": stats_text,
                "advertiser": contact_name
            }

            result = {
                "source": "idealista",
                "title": title,
                "price": price,
                "url": url,
                "phone": phone,
                "image_url": image_url,
                "advertiser": contact_name,
                "property_type": "terreno" if "terreno" in title.lower() or "parcela" in title.lower() else "vivienda",
                "date": datetime.now().isoformat(),
                "extra_data": extra_data
            }
        else:
            sys.stderr.write("❌ No es particular o es agencia.\n")
            
    except Exception as e:
        sys.stderr.write(f"Error scraping url: {e}\n")
    finally:
        if should_close_driver and driver:
            driver.quit()
        
    return result

if __name__ == "__main__":
    url_arg = sys.argv[1] if len(sys.argv) > 1 else ""
    if url_arg:
        try:
            data = scrape_single_url(url_arg)
            if data:
                print(json.dumps(data, ensure_ascii=False))
            else:
                print(json.dumps({"error": "Not found or not particular"}))
        except Exception as e:
            sys.stderr.write(f"🔥 Critical Error in main: {e}\n")
            # Imprimir JSON de error para que el backend pueda parsearlo si quisiera (aunque usa stderr)
            print(json.dumps({"error": str(e), "type": "critical"}))
            sys.exit(1)
    else:
        sys.stderr.write("No URL provided\n")
        sys.exit(1)
