# -*- coding: utf-8 -*-
"""23/11: las imágenes de arranque del iPhone (`apple-touch-startup-image`, ver frontend/index.html).

Una app instalada en el iPhone pinta BLANCO desde que se toca el icono hasta que la página pinta algo; con estas imágenes
pinta, desde el primer fotograma, la misma portada que `index.html` (fondo del tema y «SAGA»). iOS sólo las lee al
instalar la app en la pantalla de inicio. Uso: `python scripts/generar_splash_ios.py` (necesita Pillow y una fuente negra).
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONDO = (2, 6, 23)  # #020617: el de la portada de index.html
SIZES = [(440, 956, 3), (430, 932, 3), (428, 926, 3), (414, 896, 3), (414, 896, 2), (402, 874, 3), (393, 852, 3), (390, 844, 3), (375, 812, 3), (375, 667, 2), (360, 780, 3), (414, 736, 3)]
SALIDA = Path(__file__).resolve().parent.parent / "frontend" / "public" / "ios"
FUENTES = ("C:/Windows/Fonts/ariblk.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")


def fuente(px):
    for ruta in FUENTES:
        if Path(ruta).exists():
            return ImageFont.truetype(ruta, px)
    return ImageFont.load_default()


def main():
    SALIDA.mkdir(parents=True, exist_ok=True)
    for ancho, alto, ratio in SIZES:
        w, h = ancho * ratio, alto * ratio
        im = Image.new("RGB", (w, h), FONDO)
        d = ImageDraw.Draw(im)
        f = fuente(round(40 * ratio))
        espacio = round(0.18 * 40 * ratio)
        letras = "SAGA"
        ancho_texto = sum(d.textlength(c, font=f) for c in letras) + espacio * (len(letras) - 1)
        x, y = (w - ancho_texto) / 2, h / 2 - 40 * ratio
        for c in letras:
            d.text((x, y), c, font=f, fill=(255, 255, 255))
            x += d.textlength(c, font=f) + espacio
        bw, bh = 180 * ratio, 5 * ratio
        bx, by = (w - bw) / 2, h / 2 + 18 * ratio
        d.rounded_rectangle((bx, by, bx + bw, by + bh), radius=bh / 2, fill=(39, 44, 56))
        d.rounded_rectangle((bx, by, bx + bw * 0.38, by + bh), radius=bh / 2, fill=(56, 189, 248))
        im.save(SALIDA / f"splash-{w}x{h}.png", optimize=True)


if __name__ == "__main__":
    main()
