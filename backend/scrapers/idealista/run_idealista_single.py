# coding: utf-8
import sys
import json
import time
import os
import secrets
import platform
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service as ChromeService
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.options import Options as ChromeOptions

# Configurar salida UTF-8
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except AttributeError:
    pass

def setup_driver():
    options = ChromeOptions()
    # options.add_argument('--headless=new') # Idealista needs visual usually
    options.add_argument('--start-maximized')
    options.add_argument('--disable-blink-features=AutomationControlled')
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)
    
    service = ChromeService(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=options)
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    
    return driver

def scrape_single_url(url):
    print(f"Scraping single URL: {url}")
    driver = setup_driver()
    result = None

    try:
        driver.get(url)
        time.sleep(5) 

        # Cookies
        try:
            # Didomi (most common)
            try:
                cookie_btn = WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.ID, 'didomi-notice-agree-button')))
                cookie_btn.click()
            except:
                # Other potential cookie buttons
                for selector in ["button[data-testid='accept-cookies-button']", ".cookie-consent-accept", "#accept-cookies", "button.didomi-components-button"]:
                    try:
                        btn = driver.find_element(By.CSS_SELECTOR, selector)
                        btn.click()
                        break
                    except: pass
            time.sleep(2)
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
            print("✅ ES PARTICULAR")
            
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
                                # Si tiene particular, guardarlo como candidato por si acaso
                                # Evitamos guardar solo "Particular"
                                if extracted_name.lower() != "particular":
                                    candidate_name = extracted_name
                                    
                        if contact_name != "Particular": break
                    except: continue

                # Si no encontramos nombre limpio pero tenemos candidato
                if contact_name == "Particular" and candidate_name:
                     contact_name = candidate_name

                # Si sigue siendo Particular, intentar buscar por texto cercano
                if contact_name == "Particular":
                     try:
                        # Buscar elementos que contengan texto y estén cerca de "Contactar"
                        pass 
                     except: pass

                # Limpieza final
                if "particular" in contact_name.lower():
                    cleaned_final = contact_name.replace("Particular", "").replace("particular", "").strip()
                    if len(cleaned_final) > 2:
                        contact_name = cleaned_final
            except Exception as e:
                print(f"    ⚠️ Error extrayendo nombre: {e}")
                pass

            # Extract Phone Number
            phone = "No disponible"
            try:
                # Scroll to phone button to ensure visibility
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
                    
                    # Intentar click JS y normal
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
                    print("    ⚠️ No se encontró botón de teléfono")
            except Exception as e:
                print(f"    ⚠️ No se pudo extraer teléfono: {e}")
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
            
            # Combine update info into a single string or keep separate? 
            # User asked to extract them. I will add them to the result.
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
                "property_type": "inbox_alert",
                "date": datetime.now().isoformat(),
                "extra_data": extra_data
            }
        else:
            print("❌ No es particular o es agencia.")
            
    except Exception as e:
        print(f"Error scraping url: {e}")
    finally:
        driver.quit()
        
    return result

if __name__ == "__main__":
    url_arg = sys.argv[1] if len(sys.argv) > 1 else ""
    if url_arg:
        data = scrape_single_url(url_arg)
        if data:
            print(json.dumps(data, ensure_ascii=False))
        else:
            print(json.dumps({"error": "Not found or not particular"}))
    else:
        print("No URL provided")
