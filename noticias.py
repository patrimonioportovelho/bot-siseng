# ============================================================
# SISENG BOT — Módulo de Notícias via RSS
# ============================================================

import httpx
import xml.etree.ElementTree as ET
import re
from config import IDS_AUTORIZADOS

# URLs para tentar em ordem
RSS_URLS = [
    "https://publicidadeimobiliaria.com/?feed=rss2",
    "https://publicidadeimobiliaria.com/?feed=rss",
    "https://publicidadeimobiliaria.com/feed/rss/",
    "https://publicidadeimobiliaria.com/feed/",
]

_ids_enviados = set()
_inicializado = False


async def buscar_noticias():
    """Tenta múltiplas URLs de RSS até encontrar XML válido."""
    for url in RSS_URLS:
        try:
            async with httpx.AsyncClient(
                timeout=30,
                follow_redirects=True,
                headers={
                    "User-Agent": "Feedfetcher-Google; (+http://www.google.com/feedfetcher.html)",
                    "Accept": "application/rss+xml, application/xml, text/xml, */*",
                    "Cache-Control": "no-cache"
                }
            ) as client:
                response = await client.get(url)

            texto = response.text.strip()
            print(f"📰 {url} → {response.status_code} | {response.headers.get('content-type','')[:30]}")

            if response.status_code != 200:
                continue

            if not ("<rss" in texto or "<?xml" in texto):
                continue

            # Tenta parsear
            root = ET.fromstring(texto)
            channel = root.find("channel")
            if not channel:
                continue

            noticias = []
            for item in channel.findall("item"):
                titulo = item.findtext("title", "").strip()
                link   = item.findtext("link",  "").strip()
                data   = item.findtext("pubDate", "").strip()[:25]
                desc   = item.findtext("description", "").strip()

                if not titulo or not link:
                    continue

                desc_limpa = re.sub(r'<[^>]+>', '', desc)[:200].strip()
                categoria  = ""
                cat_el = item.find("category")
                if cat_el is not None and cat_el.text:
                    categoria = cat_el.text.strip()

                slug = link.strip("/").split("/")[-1] or link

                noticias.append({
                    "id":        slug,
                    "titulo":    titulo,
                    "link":      link,
                    "data":      data,
                    "categoria": categoria,
                    "resumo":    desc_limpa
                })

            print(f"📰 ✅ RSS funcionou! {len(noticias)} notícias de {url}")
            return noticias

        except Exception as e:
            print(f"📰 ⚠️ Falhou {url}: {e}")
            continue

    print("📰 ❌ Nenhuma URL de RSS funcionou.")
    return []


def formatar_noticia(n, index, total):
    cat  = f"🏷️ _{n['categoria']}_\n" if n.get("categoria") else ""
    data = f"📅 {n['data']}\n"        if n.get("data")      else ""
    res  = f"\n_{n['resumo']}..._"    if n.get("resumo")    else ""
    return (
        f"📰 *{index}/{total}*\n"
        f"{cat}*{n['titulo']}*\n"
        f"{data}{res}\n\n"
        f"🔗 {n['link']}"
    )


async def disparar_noticias(bot, periodo_label=""):
    global _inicializado, _ids_enviados

    noticias = await buscar_noticias()

    if not noticias:
        return

    if not _inicializado:
        _ids_enviados = {n["id"] for n in noticias}
        _inicializado = True
        print(f"📰 Estado inicial: {len(_ids_enviados)} notícias salvas.")
        return

    novas = [n for n in noticias if n["id"] not in _ids_enviados]

    if not novas:
        print("📰 Sem notícias novas.")
        return

    print(f"📰 {len(novas)} nova(s)!")
    for n in novas:
        _ids_enviados.add(n["id"])

    for chat_id in IDS_AUTORIZADOS:
        try:
            await bot.send_message(
                chat_id=chat_id,
                text=f"🏠 *Notícias Imobiliárias*\n_{periodo_label}_ — {len(novas)} nova(s)",
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
            print(f"⚠️ Erro envio {chat_id}: {e}")
