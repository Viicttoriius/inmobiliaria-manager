import requests
import json
import sys

import os

# Configuración
TOKEN = os.getenv("SENTRY_AUTH_TOKEN")
if not TOKEN:
    print("Advertencia: No se encontró SENTRY_AUTH_TOKEN en variables de entorno.")
    print("Por favor configura la variable de entorno o usa el archivo mcp.json")
    # Intentar leer de mcp.json como fallback si existe en la ruta estándar
    try:
        mcp_path = r"C:\Users\viict\AppData\Roaming\Trae\User\mcp.json"
        if os.path.exists(mcp_path):
             with open(mcp_path, 'r') as f:
                 data = json.load(f)
                 # Lógica simple de extracción (adaptar según estructura real si es necesario)
                 # Aquí asumimos que el usuario lo pondrá en ENV para el script
                 pass
    except:
        pass
TARGET_PROJECT_ID = "4510509939032144"
TARGET_ORG_ID = "4510509929857024"
BASE_URL = "https://de.sentry.io/api/0"

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

def get_org_slug():
    print("Buscando organización...")
    try:
        url = f"{BASE_URL}/organizations/"
        response = requests.get(url, headers=headers)
        if response.status_code != 200:
            print(f"Error al obtener organizaciones: {response.status_code} {response.text}")
            return None
        
        orgs = response.json()
        for org in orgs:
            if org.get('id') == TARGET_ORG_ID or org.get('slug') == TARGET_ORG_ID:
                return org.get('slug')
        
        # Si solo hay una y no coincide el ID explícito, devolvemos la primera (fallback)
        if len(orgs) > 0:
            print(f"No se encontró ID exacto, usando la primera organización: {orgs[0].get('slug')}")
            return orgs[0].get('slug')
            
        return None
    except Exception as e:
        print(f"Excepción buscando org: {e}")
        return None

def get_project_slug(org_slug):
    print(f"Buscando proyecto en org {org_slug}...")
    try:
        url = f"{BASE_URL}/organizations/{org_slug}/projects/"
        response = requests.get(url, headers=headers)
        if response.status_code != 200:
            print(f"Error al obtener proyectos: {response.status_code} {response.text}")
            return None
        
        projects = response.json()
        for proj in projects:
            if proj.get('id') == TARGET_PROJECT_ID:
                return proj.get('slug')
        
        print("No se encontró el proyecto por ID.")
        return None
    except Exception as e:
        print(f"Excepción buscando proyecto: {e}")
        return None

def get_issues(org_slug, project_slug):
    print(f"Obteniendo issues para {org_slug}/{project_slug}...")
    try:
        # Consultamos issues ordenados por fecha de ultima aparicion
        url = f"{BASE_URL}/projects/{org_slug}/{project_slug}/issues/"
        params = {
            "limit": 25,
            "sort": "date", # Ordenar por fecha (más reciente primero)
            "statsPeriod": "14d", # Últimos 14 días
            "query": "is:unresolved" # Solo no resueltos
        }
        response = requests.get(url, headers=headers, params=params)
        if response.status_code != 200:
            print(f"Error al obtener issues: {response.status_code} {response.text}")
            return
        
        issues = response.json()
        print(f"\nEncontrados {len(issues)} issues no resueltos:")
        print("-" * 80)
        
        for issue in issues:
            title = issue.get('title', 'No Title')
            culprit = issue.get('culprit', 'Unknown')
            count = issue.get('count', '0')
            last_seen = issue.get('lastSeen', 'Unknown')
            is_unhandled = issue.get('isUnhandled', False)
            perm_link = issue.get('permalink', 'No Link')
            
            print(f"[{'UNHANDLED' if is_unhandled else 'HANDLED'}] {title}")
            print(f"  En: {culprit}")
            print(f"  Ocurrencias: {count}")
            print(f"  Última vez: {last_seen}")
            print(f"  Link: {perm_link}")
            print("-" * 40)
            
    except Exception as e:
        print(f"Excepción obteniendo issues: {e}")

def main():
    org_slug = get_org_slug()
    if not org_slug:
        print("No se pudo obtener el slug de la organización.")
        return
    
    project_slug = get_project_slug(org_slug)
    if not project_slug:
        print("No se pudo obtener el slug del proyecto.")
        return
        
    get_issues(org_slug, project_slug)

if __name__ == "__main__":
    print("Iniciando script de consulta a Sentry...", flush=True)
    main()
