import sys
import json
import time
import os
import io
from datetime import datetime

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

def save_client_from_property(property_data):
    """
    Guarda un nuevo cliente a partir de los datos de la propiedad scrapeada.
    Ahora usa la API del backend para guardar en SQLite.
    """
    try:
        import requests
        
        # URL de la API del backend
        api_url = "http://localhost:3001/api/clients"
        
        url = property_data.get('url')
        phone = property_data.get('Phone') or ''
        name = property_data.get('Advertiser') or 'Particular'
        location = property_data.get('Municipality') or 'Desconocido'
        title = property_data.get('Title') or 'Sin título'
        
        # Si no hay teléfono, no guardamos el cliente
        if not phone:
            print(f"  ⚠️ Sin teléfono para la propiedad, no se crea cliente.", file=sys.stderr)
            return
        
        # Limpiar teléfono
        phone_clean = str(phone).replace(' ', '').replace('-', '').replace('.', '')
        if phone_clean.startswith('+34'):
            phone_clean = phone_clean[3:]
        if phone_clean.startswith('34') and len(phone_clean) > 9:
            phone_clean = phone_clean[2:]
        
        # Determinar tipo de propiedad
        prop_type = "vivienda"
        
        # Generar enlace de WhatsApp
        whatsapp_link = f"https://web.whatsapp.com/send?phone=34{phone_clean}&text=Hola {name}, le contacto por el anuncio de la vivienda que tiene en venta"
        
        new_client = {
            "name": name,
            "phone": phone_clean,
            "email": "",
            "location": location,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "status": "Pendiente",
            "adLink": url,
            "whatsappLink": whatsapp_link,
            "propertyType": prop_type,
            "notes": f"Cliente importado automáticamente: {title}"
        }
        
        # Hacer petición POST a la API
        try:
            response = requests.post(api_url, json=new_client, timeout=10)
            if response.status_code == 200:
                result = response.json()
                print(f"  ✅ Nuevo cliente añadido via API: {name} ({location}) - Tlf: {phone_clean}", file=sys.stderr)
            else:
                print(f"  ⚠️ Error de API ({response.status_code}): {response.text}", file=sys.stderr)
        except requests.exceptions.ConnectionError:
            print(f"  ⚠️ No se pudo conectar al backend. Asegúrate de que está corriendo.", file=sys.stderr)
        except Exception as e:
            print(f"  ⚠️ Error en petición API: {e}", file=sys.stderr)
        
    except Exception as e:
        print(f"  ⚠️ Error al guardar cliente: {e}", file=sys.stderr)

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
        
        # Extracción de teléfono (Intento mejorado)
        phone = None
        try:
            # 1. Buscar en el área de contacto específica (Sidebar o Formulario)
            # Clases comunes en Fotocasa: .re-FormContact-phone, .re-ContactDetail-phone, .sui-AtomButton-phone
            
            contact_area_selectors = [
                ".re-FormContactDetail", 
                ".re-ContactDetail",
                ".re-FormContact",
                ".sui-FormContact"
            ]
            
            phone_element = None
            for selector in contact_area_selectors:
                try:
                    area = driver.find_element(By.CSS_SELECTOR, selector)
                    # Buscar enlace tel dentro del área
                    links = area.find_elements(By.XPATH, ".//a[starts-with(@href, 'tel:')]")
                    if links:
                        phone_element = links[0]
                        print(f"  � Teléfono encontrado en área {selector}", file=sys.stderr)
                        break
                except:
                    continue
            
            # 2. Búsqueda por texto (Regex) - Prioridad media (si no hay link específico)
            # Buscamos patrones de móvil español 6xx...
            text_phones = []
            try:
                page_source = driver.page_source
                import re
                # Patrones: 6xx xxx xxx, 6xxxxxxxx, 6xx-xxx-xxx
                matches = re.findall(r'\b(6\d{2}[\s\.-]?\d{3}[\s\.-]?\d{3})\b', page_source)
                for m in matches:
                    clean = m.replace(' ', '').replace('-', '').replace('.', '')
                    if clean not in text_phones:
                        text_phones.append(clean)
                
                if text_phones:
                    print(f"  🔢 Teléfonos encontrados en texto: {text_phones}", file=sys.stderr)
            except:
                pass

            # 3. Si no se encontró en áreas específicas, decidir mejor candidato
            if not phone_element:
                # Si encontramos teléfonos en texto, probamos el primero que NO sea el prohibido
                ignored_phones = ['664023517', '34664023517'] # Números conocidos de sistema/usuario
                
                for tp in text_phones:
                    if tp not in ignored_phones:
                        phone = tp
                        print(f"  ✅ Usando teléfono del texto: {phone}", file=sys.stderr)
                        break
                
                # Si aún no tenemos teléfono, usar fallback de cualquier link
                if not phone:
                    all_links = driver.find_elements(By.XPATH, "//a[starts-with(@href, 'tel:')]")
                    for link in all_links:
                        href = link.get_attribute('href').replace('tel:', '')
                        clean_href = href.replace('+34', '').replace(' ', '')
                        
                        if clean_href not in ignored_phones:
                            phone = href
                            print(f"  � Usando enlace telefónico genérico: {phone}", file=sys.stderr)
                            break
            
            if phone_element and not phone:
                 phone = phone_element.get_attribute('href').replace('tel:', '')

        except Exception as e:
            print(f"  ⚠️ Error buscando teléfonos: {e}", file=sys.stderr)
            pass

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
        if phone: updated_details["Phone"] = phone
        
        # Guardar cliente automáticamente
        save_client_from_property(updated_details)

        return updated_details

    except Exception as e:
        # Guardar HTML para depuración
        try:
            # Usar variable de entorno o fallback para dev
            base_data_path = os.environ.get("USER_DATA_PATH")
            if base_data_path:
                debug_dir = os.path.join(base_data_path, "data/debug")
            else:
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
