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
            cookie_btn = WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.ID, 'didomi-notice-agree-button')))
            cookie_btn.click()
            time.sleep(2)
        except:
            pass

        # Check Particular
        is_particular = False
        try:
            prof_name = driver.find_element(By.CLASS_NAME, 'professional-name')
            name_text = prof_name.find_element(By.CLASS_NAME, 'name').text
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
            try:
                name_selectors = [
                    '.professional-name .name',
                    '.advertiser-name', 
                    '.contact-data .name', 
                    '.about-advertiser-name',
                    '.contact-name',
                    'div.name'
                ]
                
                for selector in name_selectors:
                    try:
                        name_elem = driver.find_element(By.CSS_SELECTOR, selector)
                        extracted_name = name_elem.text.strip()
                        if extracted_name and "particular" not in extracted_name.lower():
                            contact_name = extracted_name
                            break
                        elif extracted_name and len(extracted_name) > 3: # Si es "Particular" pero tiene algo más
                             contact_name = extracted_name
                    except: continue

                # Limpieza final
                if "particular" in contact_name.lower() and len(contact_name) > 15:
                    contact_name = contact_name.replace("Particular", "").replace("particular", "").strip()
            except Exception as e:
                print(f"    ⚠️ Error extrayendo nombre: {e}")
                pass

            # Extract Phone Number
            phone = "No disponible"
            try:
                # Scroll to phone button to ensure visibility
                # Intentar varios selectores para el botón de teléfono
                phone_btn_selectors = ["a.see-phones-btn", "button.see-phones-btn", ".phone-cta", "button.btn-phone"]
                phone_btn = None
                
                for selector in phone_btn_selectors:
                    try:
                        phone_btn = WebDriverWait(driver, 2).until(
                            EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                        )
                        if phone_btn: break
                    except: continue
                
                if phone_btn:
                    driver.execute_script("arguments[0].scrollIntoView(true);", phone_btn)
                    time.sleep(1)
                    # Click JS forzado
                    driver.execute_script("arguments[0].click();", phone_btn)
                    time.sleep(2)
                    
                    # Extraer número - Intentar varios selectores
                    phone_text_selectors = [".phone-number-block p", ".phone", ".contact-phones", ".first-phone", ".phone-number-block div", ".phone-number-block span"]
                    for selector in phone_text_selectors:
                        try:
                            phone_elem = WebDriverWait(driver, 2).until(
                                EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                            )
                            phone = phone_elem.text.strip()
                            if phone: break
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
