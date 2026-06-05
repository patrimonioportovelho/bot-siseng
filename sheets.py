# ============================================================
# SISENG BOT — Conexão com Google Sheets + Cache em memória
# ============================================================

import gspread
import time
import os
import json
from google.oauth2.service_account import Credentials
from config import SPREADSHEET_ID, CREDENTIALS_FILE

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
]

# Cache em memória: {nome_aba: (timestamp, dados)}
_cache = {}
CACHE_TTL = 300  # 5 minutos

def conectar():
    # Tenta ler credenciais da variável de ambiente (Railway)
    google_creds = os.environ.get("GOOGLE_CREDENTIALS")

    if google_creds:
        # Lê do ambiente (produção no Railway)
        creds_dict = json.loads(google_creds)
        creds = Credentials.from_service_account_info(creds_dict, scopes=SCOPES)
    else:
        # Lê do arquivo local (desenvolvimento no Windows)
        creds = Credentials.from_service_account_file(CREDENTIALS_FILE, scopes=SCOPES)

    cliente = gspread.authorize(creds)
    return cliente.open_by_key(SPREADSHEET_ID)

def ler_aba(nome_aba):
    agora = time.time()

    if nome_aba in _cache:
        timestamp, dados = _cache[nome_aba]
        if agora - timestamp < CACHE_TTL:
            return dados

    try:
        planilha = conectar()
        aba = planilha.worksheet(nome_aba)
        dados = aba.get_all_records()
        _cache[nome_aba] = (agora, dados)
        print(f"📊 Aba '{nome_aba}' carregada: {len(dados)} registros")
        return dados
    except Exception as e:
        print(f"⚠️ Erro ao ler aba '{nome_aba}': {e}")
        if nome_aba in _cache:
            _, dados = _cache[nome_aba]
            return dados
        return []

def limpar_cache(nome_aba=None):
    if nome_aba:
        _cache.pop(nome_aba, None)
    else:
        _cache.clear()
