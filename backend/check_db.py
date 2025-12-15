import sqlite3
import json
import os

db_path = r'd:\Trabajo\Alex Automatización\inmobiliaria\data\inmobiliaria.db'

try:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT source, COUNT(*) as count FROM properties GROUP BY source")
    rows = cursor.fetchall()
    
    print("Counts by source:")
    for row in rows:
        print(f"{row['source']}: {row['count']}")
        
    cursor.execute("SELECT * FROM properties LIMIT 1")
    row = cursor.fetchone()
    if row:
        print("\nSample property:")
        print(json.dumps(dict(row), indent=2))

except Exception as e:
    print(f"Error: {e}")
finally:
    if 'conn' in locals():
        conn.close()
