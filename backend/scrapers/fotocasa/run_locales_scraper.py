from Fotocasa_scraping_selenium import scrape_fotocasa_selenium, save_to_json
import time
import os

def main():
    """
    Función principal para ejecutar el scraper de Fotocasa para locales,
    guardar los datos en un archivo JSON y medir el tiempo de ejecución.
    """
    start_time = time.time()
    
    # URL de inicio para la búsqueda de locales en Comunitat Valenciana
    start_url = "https://www.fotocasa.es/es/comprar/locales/comunitat-valenciana/todas-las-zonas/l?searchArea=0g7kjqiic9s4C-nyV0-gexk2nBlm9qB-nyV-n_d-nyV562M0-ge562M57vHnoWgwuH0tx1D1t97Blpi9Cu_5hDi3mzD6nq_TgjzzGuts1F4l71c0iv-H46g4Hvi3-H4kxvF52o4Hqk0_G543vF-osmGq_o6E4uxzD27syChgqzBqx8rEww5MktxTy31Vy9xHyn5C09xHmmqG1xwHozwRy9xH-8uzF4pwTv8mZoxlgC58kgGyrolBozwRq5rzBlhnLwm8Mx0nmCmzlBnoW9hlBp1_IzsuQ517Ikg1Owl9I9hlB_p0D01WmzlBnoW_p0D472bri6Cxo1DmmqGqxngClsnqCzwhvD0kk_Cp0quC44hkCmtnxDg10kDkp8sGtwh0dl7t0H2on-Tsv97P531D2qrsEwgiqY8-uwFoym_CuxpgCt30T482Vk5hhFnxlgC2nwiD8oxuC2nwiDwxpgCisvzBj_loBlvmegg_MskyOtn5VjhnrBz0ruBtn5Vy5_Xtn5Vy5_Xzt8Ix-x6Bzt8Iy22Dzt8Iu4zuE14zxB4nouB47g2DhtvQ4_1Os99I4nouBn8r7C9p8oEgu-wD_n6rC0hvuBskyOs99Im50D764jBt8_9Bs99I6mqas99I03sK1koZumvTl7netyysLm_puBsv5gBrxmuBysuQ6to6B2ggYvl9I0xwH_izOksy2Csv5gBjsqlhBtriex31V_izOitzVz9xH7qvyFrxmuBri4rCr91-C8663HqgyxB3k21Kpi4rCjtt_Ki1k3Q_gx-Chos6B2kjuBvjirBktzVsv5gB4z-dsv5gBvh3nCy6_qBv-mjd82nuNq_-6C3yunC3qr4N_gx-Cvll-Ms2toE1pz1Dm3zrCt7g_B7z2gBok7X417Iok7Xvl9I7lvHvl9IwrzDvl9I_ovOk-zE9uWvl9I7lvH3sujBty9Xk-zE5rsQvl9I39upB417I79rKyhW8h4pCvl9I58yEwo1D2mtSwrzDgl7sK&sortType=publicationDate&zoom=10"
    
    # Ejecutar el scraper 
    properties = scrape_fotocasa_selenium(start_url, property_type="locales", sort_by="publicationDate", max_pages=100)
    
    if properties:
        # Guardar los datos en un archivo JSON en la carpeta de datos
        output_dir = os.environ.get("PROPERTIES_OUTPUT_DIR", r"d:\Trabajo\Alex Automatización\inmobiliaria\data\properties")
        save_to_json(properties, property_type="locales", location="varios", output_dir=output_dir)
        print(f"Se han guardado {len(properties)} propiedades.")
    else:
        print("No se encontraron propiedades de particulares para guardar.")
    
    end_time = time.time()
    print(f"El proceso de scraping ha tardado {end_time - start_time:.2f} segundos.")

if __name__ == "__main__":
    main()
