"""Gera imagens SINTÉTICAS de sinalização para demonstração e teste do módulo.
Uso: python3 tools/gerar_exemplos.py   (requer pillow e numpy)
Método documentado: texto desenhado com DejaVu Sans Bold sobre fundos coloridos,
com degradações controladas (ruído sal e pimenta, gradiente de luz, baixo contraste, inclinação)."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
OUT = os.path.join(os.path.dirname(__file__), '..', 'exemplos')
rng = np.random.default_rng(7)

def sign(text, bg, fg, size=96, W=900, H=600, board=(110, 150, 790, 450)):
    img = Image.new('RGB', (W, H), (120, 125, 120))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(board, 24, fill=bg, outline=(240, 240, 240), width=8)
    f = ImageFont.truetype(FONT, size)
    lines = text.split('\n')
    lh = size + 10
    y = (board[1] + board[3]) / 2 - lh * len(lines) / 2
    for ln in lines:
        w = d.textlength(ln, font=f)
        d.text(((W - w) / 2, y), ln, font=f, fill=fg)
        y += lh
    return img

def save(img, name):
    img.save(os.path.join(OUT, name), optimize=True)

os.makedirs(OUT, exist_ok=True)

# 1. boa condição
save(sign('PARE', (190, 20, 30), (255, 255, 255), 150), '01_pare_boa_luz.png')

# 2. sal e pimenta
a = np.array(sign('PROIBIDO\nESTACIONAR', (250, 250, 250), (20, 20, 20), 74)).astype(np.uint8)
m = rng.random(a.shape[:2])
a[m < 0.04] = 0
a[m > 0.96] = 255
save(Image.fromarray(a), '02_ruido_sal_pimenta.png')

# 3. iluminação irregular (sombra)
a = np.array(sign('PREFERENCIAL', (250, 210, 30), (20, 20, 20), 88)).astype(float)
grad = np.linspace(0.25, 1.0, a.shape[1])[None, :, None]
save(Image.fromarray((a * grad).clip(0, 255).astype(np.uint8)), '03_sombra.png')

# 4. baixo contraste + desfoque leve
img = sign('SIGA EM\nFRENTE', (150, 150, 155), (185, 185, 190), 90).filter(ImageFilter.GaussianBlur(2))
save(img, '04_baixo_contraste.png')

# 5. inclinada, letra clara em fundo escuro
img = sign('TRAVESSIA\nESCOLAR', (20, 60, 150), (255, 255, 255), 86).rotate(4, resample=Image.BICUBIC, fillcolor=(120, 125, 120))
save(img, '05_inclinada_letra_clara.png')

# 6. ruído gaussiano forte
a = np.array(sign('VELOCIDADE\nMÁXIMA 40', (250, 250, 250), (20, 20, 20), 70)).astype(float)
a += rng.normal(0, 38, a.shape)
save(Image.fromarray(a.clip(0, 255).astype(np.uint8)), '06_ruido_gaussiano.png')
print('ok')

# --- Placas em inglês (sintéticas), para testar o idioma do OCR ---
OUT_EN = os.path.join(os.path.dirname(__file__), '..', 'exemplos_en')
os.makedirs(OUT_EN, exist_ok=True)
EN = {
    '01_stop.png': ('STOP', (190, 20, 30), (255, 255, 255), 150),
    '02_no_parking.png': ('NO\nPARKING', (250, 250, 250), (190, 20, 30), 90),
    '03_school_zone.png': ('SCHOOL ZONE\nSPEED LIMIT 25', (250, 210, 30), (20, 20, 20), 62),
    '04_one_way.png': ('ONE WAY', (20, 20, 20), (255, 255, 255), 120),
    '05_do_not_enter.png': ('DO NOT\nENTER', (190, 20, 30), (255, 255, 255), 96),
}
for name, (txt, bg, fg, size) in EN.items():
    sign(txt, bg, fg, size).save(os.path.join(OUT_EN, name), optimize=True)
print('ok en')
