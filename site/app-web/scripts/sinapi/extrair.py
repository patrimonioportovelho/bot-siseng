import json
import re
import sys
import unicodedata

import openpyxl

ORIGEM, DESTINO = sys.argv[1], sys.argv[2]
UF = "RO"
REFERENCIA = "2026-09"


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or ""))
    return "".join(c for c in s if not unicodedata.combining(c)).upper()


UNIDADES = {"M2": "m²", "M3": "m³", "M": "m", "UN": "un", "KG": "kg", "L": "l", "CX": "cx", "SC": "sc", "H": "h", "MES": "mês", "PC": "pç", "PAR": "par", "JG": "jg", "CJ": "cj", "T": "t"}


def unidade(u):
    u = str(u or "").strip().upper()
    return UNIDADES.get(u, u.lower())


# ------------------------------------------------------------ materiais (por palavra-chave)
REGRAS_MATERIAL = [
    ("Ar-condicionado", [r"AR CONDICIONADO", r"\bSPLIT\b", r"CONDENSADORA", r"EVAPORADORA", r"GAS REFRIGERANTE"]),
    ("Louças e metais sanitários", [r"VASO SANITARIO", r"LAVATORIO", r"\bCUBA\b", r"\bPIA\b", r"\bTANQUE\b", r"MICTORIO", r"ASSENTO SANITARIO", r"\bDUCHA\b", r"MISTURADOR", r"BARRA DE APOIO", r"SABONETEIRA", r"PAPELEIRA", r"TOALHEIRO", r"\bBACIA\b", r"TORNEIRA", r"\bCHUVEIRO\b", r"LOUCA", r"\bTAMPO\b.*(LAVATORIO|PIA)", r"SIFAO", r"\bDESCARGA\b", r"VALVULA DE DESCARGA", r"ENGATE"]),
    ("Pintura", [r"\bTINTA\b", r"VERNIZ", r"MASSA CORRIDA", r"MASSA ACRILICA", r"SELADOR", r"FUNDO PREPARADOR", r"\bLIXA\b", r"THINNER", r"SOLVENTE", r"ESMALTE", r"ZARCAO", r"PINCEL", r"ROLO (DE LA|PARA PINTURA|DE ESPUMA)", r"TRINCHA", r"FITA CREPE", r"TEXTURA", r"STUCCO", r"RESINA ACRILICA", r"\bPRIMER\b"]),
    ("Impermeabilização", [r"IMPERMEABILIZ", r"MANTA ASFALTICA", r"MANTA LIQUIDA", r"EMULSAO ASFALTICA", r"ASFALTICO"]),
    ("Cobertura e telhado", [r"\bTELHA\b", r"\bTELHAS\b", r"CUMEEIRA", r"\bRUFO\b", r"\bCALHA\b", r"SUBCOBERTURA", r"TESOURA", r"TERCA"]),
    ("Esquadrias, portas e fechaduras", [r"\bPORTA\b", r"\bJANELA\b", r"FECHADURA", r"DOBRADICA", r"MACANETA", r"PUXADOR", r"BATENTE", r"GUARNICAO", r"ALIZAR", r"\bTRINCO\b", r"\bFECHO\b", r"PORTAO", r"\bGRADE\b", r"\bVIDRO\b", r"ESQUADRIA", r"ROLDANA", r"MOSQUITEIRO", r"CADEADO", r"FERROLHO", r"CILINDRO", r"\bGUIA\b.*PORTA"]),
    ("Forro e gesso", [r"\bGESSO\b", r"\bFORRO\b", r"DRYWALL", r"PLACA DE GESSO", r"ACARTONADO", r"\bSANCA\b", r"\bF530\b"]),
    ("Pisos", [r"\bPISO\b", r"PORCELANATO", r"RODAPE", r"SOLEIRA", r"LAMINADO", r"VINILIC", r"CARPETE", r"\bTACO\b", r"REJUNTE", r"ARGAMASSA COLANTE", r"\bCERAMICA\b", r"\bCERAMICO\b"]),
    ("Elétrica", [r"DISPOSITIVO DR", r"\bCABO\b", r"\bFIO\b", r"DISJUNTOR", r"TOMADA", r"INTERRUPTOR", r"ELETRODUTO", r"LAMPADA", r"LUMINARIA", r"REFLETOR", r"QUADRO DE DISTRIBUICAO", r"CONDULETE", r"FITA ISOLANTE", r"ELETRIC", r"\bSPOT\b", r"REATOR", r"ATERRAMENTO", r"\bDPS\b", r"CONTATOR", r"SENSOR DE PRESENCA", r"CAMPAINHA", r"INTERFONE", r"\bLED\b", r"TERMINAL (A COMPRESSAO|DE COMPRESSAO)", r"\bPLACA\b.*(TOMADA|INTERRUPTOR)", r"ELETROCALHA", r"MEDIDOR", r"HASTE DE ATERRAMENTO"]),
    ("Hidráulica", [r"\bPVC\b", r"CPVC", r"\bPEX\b", r"\bPPR\b", r"REDUCAO", r"BUJAO", r"\bPLUG\b", r"\bTUBO\b", r"CONEXAO", r"\bJOELHO\b", r"\bLUVA\b", r"\bTE\b", r"REGISTRO", r"VALVULA", r"\bRALO\b", r"CAIXA D ?AGUA", r"RESERVATORIO", r"\bBOMBA\b", r"FLANGE", r"ADAPTADOR", r"\bCURVA\b", r"BUCHA DE REDUCAO", r"VEDA ROSCA", r"COLA PARA PVC", r"ADESIVO PLASTICO", r"FLEXIVEL", r"\bBOIA\b", r"CAIXA SIFONADA", r"CAIXA DE GORDURA", r"CAIXA DE INSPECAO", r"ESGOTO", r"HIDROMETRO", r"\bNIPEL\b", r"\bUNIAO\b", r"\bTAMPAO\b", r"\bJUNCAO\b", r"\bCAP\b"]),
    ("Jardim e áreas externas", [r"\bGRAMA\b", r"TERRA VEGETAL", r"\bMUDA\b", r"ADUBO", r"SEIXO", r"\bARVORE\b", r"\bPLANTA\b", r"SEMENTE", r"SUBSTRATO", r"\bCERCA\b", r"MANGUEIRA", r"IRRIGACAO", r"ARAME FARPADO", r"MOURAO"]),
    ("Marcenaria e madeiras", [r"MADEIRA", r"COMPENSADO", r"\bMDF\b", r"SARRAFO", r"CAIBRO", r"\bTABUA\b", r"PRANCHA", r"\bRIPA\b", r"\bOSB\b", r"LAMBRIL", r"\bDECK\b", r"\bVIGA\b.*MADEIRA"]),
    ("Limpeza e dedetização", [r"DETERGENTE", r"DESENGORDURANTE", r"ACIDO MURIATICO", r"CUPINICIDA", r"INSETICIDA", r"\bSABAO\b", r"DESINFETANTE"]),
    ("Ferragens e fixação", [r"PARAFUSO", r"\bPREGO\b", r"\bBUCHA\b", r"CHUMBADOR", r"ARRUELA", r"\bPORCA\b", r"FITA ADESIVA", r"SILICONE", r"\bCOLA\b", r"ADESIVO", r"\bARAME\b", r"CANTONEIRA", r"BARRA ROSCADA", r"REBITE", r"GRAMPO", r"\bCORRENTE\b"]),
    ("Alvenaria e revestimentos", [r"CIMENTO", r"\bAREIA\b", r"\bBRITA\b", r"PEDRA BRITADA", r"TIJOLO", r"\bBLOCO\b", r"\bCAL\b", r"ARGAMASSA", r"CONCRETO", r"\bMASSA\b", r"TELA SOLDADA", r"VERGALHAO", r"GRAUTE", r"AZULEJO", r"REVESTIMENTO", r"PASTILHA", r"\bPEDRISCO\b", r"\bCHAPISCO\b"]),
]
REGRAS_MATERIAL = [(c, [re.compile(p) for p in ps]) for c, ps in REGRAS_MATERIAL]


def categoria_material(desc):
    # vale a palavra-chave que aparece primeiro na descrição (o substantivo
    # principal costuma vir no começo: "PORTA DE MADEIRA ... PARA PINTURA");
    # em empate, a ordem das categorias acima decide.
    d = norm(desc)
    melhor = None
    for ordem, (cat, padroes) in enumerate(REGRAS_MATERIAL):
        posicoes = [m.start() for m in (p.search(d) for p in padroes) if m]
        if posicoes:
            chave = (min(posicoes), ordem)
            if melhor is None or chave < melhor[0]:
                melhor = (chave, cat)
    return melhor[1] if melhor else "Outros"


# ------------------------------------------------------------ composições (por grupo)
GRUPOS_SERVICO = {
    "Elétrica": [
        "INSTALACOES ELETRICAS - ELETRODUTOS EMBUTIDOS", "INSTALACOES ELETRICAS - ELETRODUTOS, CONEXOES", "INSTALACOES ELETRICAS - QUADROS",
        "ILUMINACAO PREDIAL", "LUMINARIAS EXTERNAS", "REDES DE LOGICA", "SISTEMA DE PROTECAO CONTRA DESCARGAS", "DETECCAO DE INCENDIO", "ENERGIA SOLAR", "ELETROCALHAS"
    ],
    "Hidráulica": [
        "INSTALACOES HIDRAULICAS", "INSTALACOES PREDIAIS DE ESGOTO", "INSTALACOES PREDIAIS DE AGUA", "INSTALACOES PREDIAIS DE AGUAS PLUVIAIS",
        "INSTALACOES EM COBRE", "VALVULAS E REGISTROS PARA SISTEMAS PREDIAIS", "CAIXAS DE AGUA PARA EDIFICACOES", "BOMBAS HIDRAULICAS", "LIGACOES PREDIAIS", "FOSSAS E SUMIDOUROS"
    ],
    "Louças e metais sanitários": ["LOUCAS E METAIS"],
    "Pintura": ["PINTURA EXTERNA", "PINTURA INTERNA", "PINTURA EM MADEIRA", "PINTURA EM SUPERFICIES METALICAS", "PINTURA PARA PISOS"],
    "Cobertura e telhado": ["ESTRUTURA E TRAMA PARA COBERTURA", "TELHAMENTO PARA COBERTURA"],
    "Esquadrias, portas e fechaduras": ["ESQUADRIAS - JANELAS", "ESQUADRIAS - PORTAS", "GUARDA-CORPO", "VIDROS E ESPELHOS"],
    "Alvenaria e revestimentos": [
        "ALVENARIA DE VEDACAO", "ALVENARIAS DIVERSAS", "ARGAMASSAS", "CHAPISCO", "MASSA UNICA EXTERNA", "MASSA UNICA INTERNA", "MONOCAPA",
        "REVESTIMENTOS CERAMICOS", "VERGAS, CONTRAVERGAS", "RASGOS E FIXACOES", "DEMOLICOES E REMOCOES", "PEITORIS E CHAPINS"
    ],
    "Pisos": ["PISOS", "CONTRAPISO"],
    "Forro e gesso": ["FORROS", "GESSO", "PAREDES EM DRYWALL", "INSTALACOES DE DIVISORIAS"],
    "Impermeabilização": ["IMPERMEABILIZACAO"],
    "Ar-condicionado": ["INSTALACOES DE AR CONDICIONADO", "DUTOS PARA AR CONDICIONADO", "DRENAGEM DE AR CONDICIONADO"],
    "Jardim e áreas externas": ["PAISAGISMO", "CERCAS, PROTETORES", "PASSEIOS DE CONCRETO", "PAVIMENTO INTERTRAVADO", "SUPRESSAO VEGETAL"],
    "Marcenaria e madeiras": ["ESTRUTURAS DE MADEIRA"],
    "Limpeza e dedetização": ["LIMPEZA DE OBRA", "REMOCAO DE ENTULHO"],
}


def categoria_grupo(grupo):
    g = norm(grupo)
    for cat, inicios in GRUPOS_SERVICO.items():
        if any(g.startswith(i) for i in inicios):
            return cat
    return None


# ------------------------------------------------------------ mão de obra (por profissão)
PROFISSOES = [
    ("Elétrica", [r"ELETRICISTA"]),
    ("Hidráulica", [r"ENCANADOR", r"BOMBEIRO HIDRAULICO"]),
    ("Pintura", [r"PINTOR"]),
    ("Alvenaria e revestimentos", [r"PEDREIRO", r"SERVENTE", r"AZULEJISTA", r"LADRILHISTA", r"ASSENTADOR DE", r"REVESTIDOR"]),
    ("Pisos", [r"PISO", r"TACO"]),
    ("Marcenaria e madeiras", [r"CARPINTEIRO", r"MARCENEIRO"]),
    ("Forro e gesso", [r"GESSEIRO"]),
    ("Esquadrias, portas e fechaduras", [r"SERRALHEIRO", r"VIDRACEIRO"]),
    ("Cobertura e telhado", [r"TELHADISTA"]),
    ("Jardim e áreas externas", [r"JARDINEIRO"]),
    ("Impermeabilização", [r"IMPERMEABILIZADOR"]),
    ("Ar-condicionado", [r"CLIMATIZ", r"AR CONDICIONADO"]),
]


def categoria_profissao(desc):
    d = norm(desc)
    for cat, ps in PROFISSOES:
        if any(re.search(p, d) for p in ps):
            return cat
    return None


def preco(v):
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return round(n, 2) if n > 0 else None


wb = openpyxl.load_workbook(ORIGEM, read_only=True, data_only=True)
itens = []

# ---- insumos (ISD = sem desoneração)
linhas = list(wb["ISD"].iter_rows(values_only=True))
cab = linhas[9]
i_ro = cab.index(UF)
for r in linhas[10:]:
    classe, cod, desc, un = r[0], r[1], r[2], r[3]
    p = preco(r[i_ro])
    if not classe or not desc:
        continue
    # Itens sem preço coletado no estado entram mesmo assim (preço de referência
    # vazio) — o orçamento precisa listar tudo que existe, o valor é do responsável.
    if classe == "MATERIAL":
        itens.append(dict(grupo="material", codigo=str(cod), categoria=categoria_material(desc), classe_origem=classe, descricao=str(desc).strip(), unidade=unidade(un), preco_ref=p))
    elif classe == "EQUIPAMENTO (AQUISIÇÃO)":
        itens.append(dict(grupo="material", codigo=str(cod), categoria="Ferramentas e equipamentos", classe_origem=classe, descricao=str(desc).strip(), unidade=unidade(un), preco_ref=p))
    elif classe == "SERVIÇOS":
        itens.append(dict(grupo="servico", codigo=str(cod), categoria=categoria_material(desc), classe_origem=classe, descricao=str(desc).strip(), unidade=unidade(un), preco_ref=p))
    elif classe == "MAO DE OBRA" and "(HORISTA)" in norm(desc) and p is not None:
        cat = categoria_profissao(desc)
        if not cat:
            continue
        nome = re.sub(r"\s*\(HORISTA\)", "", str(desc)).strip()
        itens.append(dict(grupo="servico", codigo=str(cod), categoria=cat, classe_origem=classe, descricao=f"{nome} — por hora", unidade="h", preco_ref=p))
        itens.append(dict(grupo="servico", codigo=f"{cod}-D", categoria=cat, classe_origem=classe + " (diária = 8 h)", descricao=f"{nome} — diária (8 h)", unidade="diária", preco_ref=round(p * 8, 2)))

# ---- composições (CSD = sem desoneração), com o código vindo da fórmula do link
wbf = openpyxl.load_workbook(ORIGEM, read_only=True, data_only=False)
linhas_f = list(wbf["CSD"].iter_rows(values_only=True))
cab_uf = linhas_f[3]
i_ro_c = cab_uf.index(UF)
cod_re = re.compile(r"MATCH\((\d+)")
for r in linhas_f[10:]:
    grupo, cel, desc, un = r[0], r[1], r[2], r[3]
    if not grupo or not desc:
        continue
    cat = categoria_grupo(grupo)
    if not cat:
        continue
    m = cod_re.search(str(cel))
    p = preco(r[i_ro_c])
    if not m:
        continue
    itens.append(dict(grupo="servico", codigo=m.group(1), categoria=cat, classe_origem=str(grupo), descricao=str(desc).strip(), unidade=unidade(un), preco_ref=p))

for i in itens:
    i["uf"] = UF
    i["referencia"] = REFERENCIA
    i["fonte"] = "SINAPI"

# remove duplicados (grupo+codigo)
vistos = {}
for i in itens:
    vistos[(i["grupo"], i["codigo"])] = i
itens = list(vistos.values())

with open(DESTINO, "w", encoding="utf-8") as f:
    json.dump(itens, f, ensure_ascii=False)

from collections import Counter

c = Counter((i["grupo"], i["categoria"]) for i in itens)
print("total", len(itens))
for (g, cat), n in sorted(c.items()):
    print(f"  {g:9} {cat:34} {n}")
