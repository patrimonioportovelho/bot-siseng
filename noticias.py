# ============================================================
# SISENG BOT — Módulo de Notícias Imobiliárias
# ============================================================

import httpx
from bs4 import BeautifulSoup
from config import IDS_AUTORIZADOS

URL_SITE = "https://publicidadeimobiliaria.com/"

# Estado em memória dos IDs já enviados
_ids_enviados = set()
_inicializado = False


# ─── SCRAPING ───────────────────────────────────────────────

async def buscar_noticias():
    """Busca notícias do portal publicidadeimobiliaria.com"""
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            response = await client.get(URL_SITE, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
            })

        if response.status_code != 200:
            print(f"⚠️ Notícias: erro HTTP {response.status_code}")
            return []

        soup = BeautifulSoup(response.text, "html.parser")
        noticias = []
        vistos = set()

        # Site WordPress — busca todos os h3 com links
        for h in soup.select("h3 a, h2 a"):
            titulo = h.get_text(strip=True)
            link   = h.get("href", "").strip()

            if not titulo or not link:
                continue
            if "publicidadeimobiliaria.com" not in link:
                continue
            if link in vistos:
                continue

            vistos.add(link)

            # ID único baseado no slug do link
            slug = link.strip("/").split("/")[-1]
            if not slug:
                continue

            # Busca categoria/data próxima ao elemento
            pai = h.find_parent()
            categoria = ""
            data_pub = ""

            if pai:
                cat_el = pai.find_previous("a", href=lambda x: x and "/category/" in str(x))
                if cat_el:
                    categoria = cat_el.get_text(strip=True)

                data_el = pai.find_next(string=lambda t: t and "de " in t and "2026" in t)
                if data_el:
                    data_pub = str(data_el).strip()[:30]

            noticias.append({
                "id":        slug,
                "titulo":    titulo,
                "link":      link,
                "categoria": categoria,
                "data":      data_pub
            })

        print(f"📰 Notícias encontradas: {len(noticias)}")
        return noticias

    except Exception as e:
        print(f"⚠️ Erro ao buscar notícias: {e}")
        return []


# ─── FORMATAÇÃO ─────────────────────────────────────────────

def formatar_noticia(n, index, total):
    categoria = f"🏷️ _{n['categoria']}_\n" if n.get("categoria") else ""
    data      = f"📅 {n['data']}\n"        if n.get("data")      else ""
    return (
        f"📰 *{index}/{total}* {categoria}"
        f"*{n['titulo']}*\n"
        f"{data}"
        f"🔗 {n['link']}"
    )


# ─── ENVIO ──────────────────────────────────────────────────

async def disparar_noticias(bot, periodo_label=""):
    """
    Busca notícias novas e dispara para todos os IDs autorizados.
    Na primeira execução apenas salva o estado sem enviar.
    """
    global _inicializado, _ids_enviados

    noticias = await buscar_noticias()

    if not noticias:
        print("📰 Nenhuma notícia encontrada.")
        return

    if not _inicializado:
        _ids_enviados = {n["id"] for n in noticias}
        _inicializado = True
        print(f"📰 Estado inicial salvo: {len(_ids_enviados)} notícias conhecidas.")
        return

    novas = [n for n in noticias if n["id"] not in _ids_enviados]

    if not novas:
        print("📰 Nenhuma notícia nova no período.")
        return

    print(f"📰 {len(novas)} notícia(s) nova(s) para enviar!")

    for n in novas:
        _ids_enviados.add(n["id"])

    for chat_id in IDS_AUTORIZADOS:
        try:
            await bot.send_message(
                chat_id=chat_id,
                text=(
                    f"🏠 *Notícias do Mercado Imobiliário*\n"
                    f"_{periodo_label}_ — {len(novas)} nova(s)"
                ),
                parse_mode="Markdown"
            )

            for i, n in enumerate(novas, 1):
                await bot.send_message(
                    chat_id=chat_id,
                    text=formatar_noticia(n, i, len(novas)),
                    parse_mode="Markdown",
                    disable_web_page_preview=True
                )

        except Exception as e:
            print(f"⚠️ Erro ao enviar notícias para {chat_id}: {e}")


async def buscar_uma_noticia_teste():
    """Retorna apenas a primeira notícia para teste."""
    noticias = await buscar_noticias()
    return noticias[0] if noticias else None
