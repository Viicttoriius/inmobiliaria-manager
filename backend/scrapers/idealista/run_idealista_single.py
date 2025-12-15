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
            title = ""
            try: title = driver.find_element(By.CSS_SELECTOR, '.main-info__title-main').text
            except: pass
            
            price = "0"
            try: price = driver.find_element(By.CSS_SELECTOR, '.info-data-price').text
            except: pass
            
            phone = "No disponible"
            try:
                phone_btn = driver.find_element(By.CSS_SELECTOR, '#contact-phones-container a.see-phones-btn')
                driver.execute_script("arguments[0].click();", phone_btn)
                time.sleep(2)
                phone_elem = driver.find_element(By.CSS_SELECTOR, '.phone-number-block')
                phone = phone_elem.text
            except:
                pass
            
            result = {
                "source": "idealista",
                "title": title,
                "price": price,
                "url": url,
                "phone": phone,
                "advertiser": "Particular",
                "property_type": "inbox_alert",
                "date": datetime.now().isoformat()
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
