"""Gera a marca Escala Certa em SVG: palavra em contorno (Bricolage Grotesque ExtraBold, OFL) + dois símbolos.

Rodar da pasta marca:  pip install fonttools uharfbuzz   e   python gera_logo.py
A fonte vai em fonte/bricolage.ttf (fora do repositório; ver README, seção Marca).
"""
import io
import os
from pathlib import Path

import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FONTE = str(Path(__file__).with_name("fonte") / "bricolage.ttf")
SAIDA = str(Path(__file__).parent)

TINTA, ACENTO, CLARO, BRANCO = "#17231e", "#0e5f52", "#5cc2ad", "#ffffff"

ft = TTFont(FONTE)
gs = ft.getGlyphSet()
upem = ft["head"].unitsPerEm
cap = ft["OS/2"].sCapHeight
blob = hb.Blob.from_file_path(FONTE)
face = hb.Face(blob)
font = hb.Font(face)


def palavra(texto, x0, base, escala, rastreio=0):
    """Contorno do texto com o kerning da fonte. Devolve (path d, largura em px)."""
    buf = hb.Buffer()
    buf.add_str(texto)
    buf.guess_segment_properties()
    hb.shape(font, buf, {"kern": True, "liga": True})
    ordem = ft.getGlyphOrder()
    d, x = [], 0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        nome = ordem[info.codepoint]
        pen = SVGPathPen(gs)
        # unidades da fonte -> px, y para baixo
        tp = TransformPen(pen, (escala, 0, 0, -escala, x0 + (x + pos.x_offset) * escala, base - pos.y_offset * escala))
        gs[nome].draw(tp)
        d.append(pen.getCommands())
        x += pos.x_advance + rastreio
    return " ".join(c for c in d if c), (x - rastreio) * escala


def num(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


# ---------- símbolo A: semana 5+2 (cinco dias de trabalho + as duas folgas, certinhas) ----------
def simbolo_52(x, y, h, cor_dias, cor_folga, cor_check):
    w, g = h * 0.30, h * 0.15           # barras largas e bem espaçadas (finas e juntas lembram código de barras)
    r = h * 0.09
    partes = []
    for i in range(5):
        partes.append(f'<rect x="{num(x + i * (w + g))}" y="{num(y)}" width="{num(w)}" height="{num(h)}" rx="{num(r)}" fill="{cor_dias}"/>')
    tx, tw = x + 5 * (w + g), 2 * w + g
    partes.append(f'<rect x="{num(tx)}" y="{num(y)}" width="{num(tw)}" height="{num(h)}" rx="{num(r * 1.6)}" fill="{cor_folga}"/>')
    # check no meio do bloco da folga
    cx, cy, s = tx + tw / 2, y + h / 2, tw * 0.62
    p = [(cx - s * 0.48, cy + s * 0.02), (cx - s * 0.12, cy + s * 0.36), (cx + s * 0.5, cy - s * 0.34)]
    partes.append(f'<path d="M{num(p[0][0])} {num(p[0][1])} L{num(p[1][0])} {num(p[1][1])} L{num(p[2][0])} {num(p[2][1])}" '
                  f'fill="none" stroke="{cor_check}" stroke-width="{num(tw * 0.17)}" stroke-linecap="round" stroke-linejoin="round"/>')
    return "\n  ".join(partes), 5 * (w + g) + tw


# ---------- símbolo B: grade da escala em que as folgas desenham o "certo" ----------
CHECK = {(1, 0), (2, 1), (1, 2), (0, 3)}     # 3 x 4: o "certo" ocupa um terço da grade e aparece até pequeno


def simbolo_grade(x, y, h, cor_cel, cor_check, opac_cel):
    linhas, cols = 3, 4
    g = h * 0.1
    c = (h - (linhas - 1) * g) / linhas
    r = c * 0.26
    partes = []
    for i in range(linhas):
        for j in range(cols):
            marcado = (i, j) in CHECK
            partes.append(f'<rect x="{num(x + j * (c + g))}" y="{num(y + i * (c + g))}" width="{num(c)}" height="{num(c)}" rx="{num(r)}" '
                          f'fill="{cor_check if marcado else cor_cel}"' + ('' if marcado else f' fill-opacity="{opac_cel}"') + '/>')
    return "\n  ".join(partes), cols * c + (cols - 1) * g


# ---------- composição ----------
ALTURA_CAP = 64                      # altura das maiúsculas em px no arquivo-mestre
ESC = ALTURA_CAP / cap


def horizontal(simbolo, cores, nome):
    pad = 8
    h_sim = ALTURA_CAP * 1.18
    base = pad + (h_sim + ALTURA_CAP) / 2      # palavra centrada na altura do símbolo
    y_sim = pad
    if simbolo == "52":
        s, w_sim = simbolo_52(pad, y_sim, h_sim, cores["dias"], cores["folga"], cores["check"])
    else:
        s, w_sim = simbolo_grade(pad, y_sim, h_sim, cores["cel"], cores["folga"], cores["opac"])
    x_txt = pad + w_sim + h_sim * 0.42
    d1, w1 = palavra("Escala", x_txt, base, ESC)
    espaco = ALTURA_CAP * 0.30
    d2, w2 = palavra("Certa", x_txt + w1 + espaco, base, ESC)
    largura = x_txt + w1 + espaco + w2 + pad
    altura = h_sim + 2 * pad
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {num(largura)} {num(altura)}" width="{num(largura)}" height="{num(altura)}" '
           f'role="img" aria-label="Escala Certa">\n  <title>Escala Certa</title>\n  {s}\n'
           f'  <path d="{d1}" fill="{cores["escala"]}"/>\n  <path d="{d2}" fill="{cores["certa"]}"/>\n</svg>\n')
    io.open(os.path.join(SAIDA, nome), "w", encoding="utf-8").write(svg)
    return svg


def icone(simbolo, nome, fundo, cores):
    t = 512
    raio = t * 0.22
    if simbolo == "52":
        h = t * 0.30
        s, w = simbolo_52(0, 0, h, cores["dias"], cores["folga"], cores["check"])
        ox, oy = (t - w) / 2, (t - h) / 2
    else:
        h = t * 0.50
        s, w = simbolo_grade(0, 0, h, cores["cel"], cores["folga"], cores["opac"])
        ox, oy = (t - w) / 2, (t - h) / 2
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {t} {t}" width="{t}" height="{t}" role="img" aria-label="Escala Certa">\n'
           f'  <title>Escala Certa</title>\n  <rect width="{t}" height="{t}" rx="{num(raio)}" fill="{fundo}"/>\n'
           f'  <g transform="translate({num(ox)} {num(oy)})">\n  {s}\n  </g>\n</svg>\n')
    io.open(os.path.join(SAIDA, nome), "w", encoding="utf-8").write(svg)


claro_52 = {"dias": TINTA, "folga": ACENTO, "check": BRANCO, "escala": TINTA, "certa": ACENTO}
escuro_52 = {"dias": "#e7eeea", "folga": CLARO, "check": "#0b1f1a", "escala": BRANCO, "certa": CLARO}
claro_g = {"cel": TINTA, "folga": ACENTO, "opac": 0.14, "escala": TINTA, "certa": ACENTO}
escuro_g = {"cel": BRANCO, "folga": CLARO, "opac": 0.18, "escala": BRANCO, "certa": CLARO}

horizontal("52", claro_52, "escala-certa-A-horizontal.svg")
horizontal("52", escuro_52, "escala-certa-A-horizontal-fundo-escuro.svg")
horizontal("grade", claro_g, "escala-certa-B-horizontal.svg")
horizontal("grade", escuro_g, "escala-certa-B-horizontal-fundo-escuro.svg")
icone("52", "escala-certa-A-icone.svg", ACENTO, {"dias": BRANCO, "folga": "#cdebd3", "check": ACENTO})
icone("grade", "escala-certa-B-icone.svg", ACENTO, {"cel": BRANCO, "folga": BRANCO, "opac": 0.22})
print("ok", sorted(os.listdir(SAIDA)))
