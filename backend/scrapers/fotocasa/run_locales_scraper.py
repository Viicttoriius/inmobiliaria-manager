from Fotocasa_scraping_selenium import scrape_fotocasa_selenium, save_to_json
import time
import os

def main():
    """
    Función principal para ejecutar el scraper de Fotocasa para locales,
    guardar los datos en un archivo JSON y medir el tiempo de ejecución.
    """
    start_time = time.time()
    
    # URL de inicio para la búsqueda de locales en Dénia
    start_url = "https://www.fotocasa.es/es/comprar/locales/denia/todas-las-zonas/l"
    
    # Ejecutar el scraper 
    properties = scrape_fotocasa_selenium(start_url, property_type="locales", sort_by="publicationDate")
    
    if properties:
        # Guardar los datos en un archivo JSON en la carpeta de datos
        output_dir = r"d:\Trabajo\Alex Automatización\inmobiliaria\data\properties"
        save_to_json(properties, property_type="locales", location="denia", output_dir=output_dir)
        print(f"Se han guardado {len(properties)} propiedades.")
    else:
        print("No se encontraron propiedades de particulares para guardar.")
    
    end_time = time.time()
    print(f"El proceso de scraping ha tardado {end_time - start_time:.2f} segundos.")

if __name__ == "__main__":
    main()
