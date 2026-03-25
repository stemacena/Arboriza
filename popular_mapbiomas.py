from sqlalchemy import create_engine, text

# 1. Cole aqui a sua senha/URL nova do Supabase (A mesma que você botou no Render)
DATABASE_URL = "postgresql://postgres.npjzosvyqesbckfjqdtn:taperdidoarboriza63766111000123@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"

print("Conectando ao Cérebro Espacial (Supabase)...")

try:
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        
        # 2. Vamos inserir um polígono simulando uma mancha de Floresta na Floresta da Tijuca!
        # O ST_GeomFromGeoJSON converte o formato de texto da web para o formato geográfico do PostGIS
        query = text("""
            INSERT INTO mapbiomas_rio (classe, ano, geom)
            VALUES (
                'Formação Florestal',
                2022,
                ST_SetSRID(ST_GeomFromGeoJSON('{
                    "type": "MultiPolygon",
                    "coordinates": [
                        [[
                            [-43.2954, -22.9430],
                            [-43.2800, -22.9430],
                            [-43.2800, -22.9550],
                            [-43.2954, -22.9550],
                            [-43.2954, -22.9430]
                        ]]
                    ]
                }'), 4326)
            )
        """)
        
        conn.execute(query)
        conn.commit() 
        
    print("✅ Sucesso! O polígono da Floresta foi inserido no banco de dados com sucesso!")

except Exception as e:
    print(f"❌ Erro ao inserir no banco: {e}")