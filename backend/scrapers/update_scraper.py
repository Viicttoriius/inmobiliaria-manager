import sys
import json
import time
import os
import io

# Añadir el directorio 'fotocasa' al path para poder importar el módulo
current_dir = os.path.dirname(os.path.abspath(__file__))
fotocasa_dir = os.path.join(current_dir, 'fotocasa')
sys.path.append(fotocasa_dir)

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import NoSuchElementException

# Importar todas las funciones necesarias del scraper principal
from Fotocasa_scraping_selenium import (
    setup_driver, 
    handle_cookies, 
    handle_push_alert_modal, 
    scroll_to_bottom, 
    human_like_mouse_move
)

# Clase para silenciar stdout durante la ejecución de funciones importadas que imprimen logs
class SuppressStdout:
    def __enter__(self):
        self._original_stdout = sys.stdout
        sys.stdout = open(os.devnull, 'w', encoding='utf-8')
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        sys.stdout.close()
        sys.stdout = self._original_stdout

def get_element_text(driver, by, value):
    """Obtiene el texto de un elemento de forma segura."""
    try:
        element = driver.find_element(by, value)
        return element.text.strip()
    except NoSuchElementException:
        return None

def scrape_single_url(driver, url):
    """
    Scrapea una URL usando un driver existente.
    Retorna un diccionario con los datos o None si falla.
    """
    try:
        driver.get(url)
        
        # Ejecutar las funciones de navegación y anti-detección silenciando su salida
        with SuppressStdout():
            handle_cookies(driver)
            handle_push_alert_modal(driver)
            
            # Esperar a que cargue el título
            WebDriverWait(driver, 30).until(
                EC.presence_of_element_located((By.TAG_NAME, "h1"))
            )
            
            scroll_to_bottom(driver)
            human_like_mouse_move(driver)

        # --- EXTRACCIÓN DE DATOS ---

        price = get_element_text(driver, By.CSS_SELECTOR, '.re-DetailHeader-price')
        
        surface_raw = get_element_text(driver, By.CSS_SELECTOR, '.re-DetailHeader-surface span:last-child')
        surface = surface_raw.replace(' m²', '') if surface_raw else None

        title = get_element_text(driver, By.CSS_SELECTOR, '.re-DetailHeader-propertyTitle')
        municipality = get_element_text(driver, By.CSS_SELECTOR, '.re-DetailHeader-municipalityTitle')
        description = get_element_text(driver, By.CSS_SELECTOR, '.re-DetailDescription p')
        
        # Lógica para extraer anunciante
        advertiser = None
        
        # 1. Intentar buscar el nombre del cliente específico
        advertiser = get_element_text(driver, By.CSS_SELECTOR, '.re-FormContactDetailDown-client h4')
        
        # 2. Si no se encuentra, buscar texto "Anunciante particular" o similar
        if not advertiser:
            try:
                # Búsqueda más amplia de "Particular"
                particular_texts = ["Anunciante particular", "Particular", "Vendedor particular"]
                for text in particular_texts:
                    if len(driver.find_elements(By.XPATH, f"//*[contains(text(), '{text}')]")) > 0:
                        advertiser = "Particular"
                        break
            except:
                pass

        # 3. Fallback: Si no se encuentra nada, asumimos Particular (según feedback usuario)
        if not advertiser:
            advertiser = "Particular"
        
        reference = get_element_text(driver, By.CSS_SELECTOR, '.re-FormContactDetailDown-reference p strong')

        # Construir el diccionario de datos actualizados
        updated_details = {}
        # Siempre incluimos la URL para identificar el registro
        updated_details["url"] = url
        
        if price: updated_details["Price"] = price
        if surface: updated_details["m2"] = surface + " m²"
        if title: updated_details["Title"] = title
        if municipality: updated_details["Municipality"] = municipality
        if description: updated_details["Description"] = description
        updated_details["Advertiser"] = advertiser
        if reference: updated_details["Reference"] = reference

        return updated_details

    except Exception as e:
        # Guardar HTML para depuración
        try:
            debug_dir = os.path.join(current_dir, "../../data/debug")
            if not os.path.exists(debug_dir):
                os.makedirs(debug_dir)
            
            timestamp = int(time.time() * 1000)
            # Sanitize url for filename
            safe_url = url.replace('/', '_').replace(':', '')[-50:]
            debug_file = os.path.join(debug_dir, f"debug_update_error_{timestamp}_{safe_url}.html")
            
            with open(debug_file, "w", encoding="utf-8") as f:
                f.write(driver.page_source)
            print(f"  Guardado {debug_file}", file=sys.stderr)
        except:
            pass

        print(f"Error inesperado al scrapear {url}: {e}", file=sys.stderr)
        return None

def process_urls(urls):
    results = []
    
    for i, url in enumerate(urls):
        print(f"Procesando {i+1}/{len(urls)}: {url}", file=sys.stderr)
        driver = None
        try:
            # Abrir navegador para CADA propiedad
            driver = setup_driver(headless=False)
            
            data = scrape_single_url(driver, url)
            if data:
                results.append(data)
            
            # Pequeña pausa antes de cerrar para asegurar que todo se procesó
            time.sleep(1)
            
        except Exception as e:
            print(f"Error procesando URL {url}: {e}", file=sys.stderr)
        finally:
            # Cerrar navegador después de CADA propiedad
            if driver:
                with SuppressStdout():
                    driver.quit()
            # Pausa entre reinicios de navegador
            if i < len(urls) - 1:
                time.sleep(2)
    
    return results

if __name__ == "__main__":
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        urls_to_scrape = []

        # Comprobar si es un archivo
        if os.path.exists(arg) and (arg.endswith('.json') or arg.endswith('.txt')):
            try:
                with open(arg, 'r', encoding='utf-8') as f:
                    content = f.read()
                    # Intentar parsear como JSON
                    try:
                        data = json.loads(content)
                        if isinstance(data, list):
                            urls_to_scrape = data
                        elif isinstance(data, dict) and 'urls' in data:
                            urls_to_scrape = data['urls']
                    except json.JSONDecodeError:
                        # Si falla JSON, intentar línea por línea
                        urls_to_scrape = [line.strip() for line in content.splitlines() if line.strip()]
            except Exception as e:
                print(f"Error leyendo archivo de URLs: {e}", file=sys.stderr)
                sys.exit(1)
        else:
            # Asumir que es una URL única
            urls_to_scrape = [arg]

        if not urls_to_scrape:
            print("No se encontraron URLs para procesar.", file=sys.stderr)
            sys.exit(1)

        scraped_results = process_urls(urls_to_scrape)
        
        if scraped_results:
            # 1. Guardar UN SOLO archivo en data/update con todos los resultados
            try:
                update_dir = os.path.join(current_dir, "../../data/update")
                if not os.path.exists(update_dir):
                    os.makedirs(update_dir)
                
                timestamp = int(time.time() * 1000)
                filename = f"update_batch_{timestamp}.json"
                filepath = os.path.join(update_dir, filename)
                
                with open(filepath, "w", encoding="utf-8") as f:
                    json.dump(scraped_results, f, ensure_ascii=False, indent=2)
                
                print(f"Resultados guardados en {filepath}", file=sys.stderr)
            except Exception as e:
                print(f"Error guardando archivo temporal: {e}", file=sys.stderr)

            # 2. Imprimir el JSON final en stdout para que server.js lo consuma
            print(json.dumps(scraped_results, ensure_ascii=False))
        else:
            print("[]") # Retornar array vacío si no hubo resultados
    else:
        print("Error: No se proporcionó una URL o archivo de URLs.", file=sys.stderr)
        sys.exit(1)
