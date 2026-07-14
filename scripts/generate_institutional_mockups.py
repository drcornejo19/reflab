from __future__ import annotations

from pathlib import Path
from typing import Literal

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(r"C:\Users\drcor\reflab")
SRC = ROOT / "assets" / "institutional-mockups-2026-07-08"
SCREENSHOTS = ROOT / "screenshots"
TMP_ASSETS = Path(
    r"C:\Users\drcor\AppData\Local\Temp\codex-presentations\manual-reflab\institutional_deck_update\tmp\assets"
)
OUT = SRC / "final"

CANVAS = (2400, 1400)
CARD = (96, 76, 2304, 1324)
RADIUS = 34


def contain_size(src_size: tuple[int, int], max_size: tuple[int, int]) -> tuple[int, int]:
    sw, sh = src_size
    mw, mh = max_size
    scale = min(mw / sw, mh / sh)
    return max(1, round(sw * scale)), max(1, round(sh * scale))


def cover_size(src_size: tuple[int, int], target_size: tuple[int, int]) -> tuple[int, int]:
    sw, sh = src_size
    tw, th = target_size
    scale = max(tw / sw, th / sh)
    return max(1, round(sw * scale)), max(1, round(sh * scale))


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=255)
    return mask


def add_shadow(
    canvas: Image.Image,
    box: tuple[int, int, int, int],
    radius: int,
    blur: int = 28,
    opacity: int = 120,
    offset: tuple[int, int] = (0, 18),
) -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    x0, y0, x1, y1 = box
    ox, oy = offset
    draw.rounded_rectangle(
        (x0 + ox, y0 + oy, x1 + ox, y1 + oy),
        radius=radius,
        fill=(0, 0, 0, opacity),
    )
    shadow = layer.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(shadow)


def frame_image(
    source: Image.Image,
    *,
    fit: Literal["contain", "cover"] = "contain",
    card_box: tuple[int, int, int, int] = CARD,
    canvas_size: tuple[int, int] = CANVAS,
    radius: int = RADIUS,
) -> Image.Image:
    canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    x0, y0, x1, y1 = card_box
    add_shadow(canvas, card_box, radius)

    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(card_box, radius=radius, fill=(8, 18, 26, 10), outline=(53, 81, 94, 110), width=2)

    card_w = x1 - x0
    card_h = y1 - y0
    if fit == "cover":
        new_size = cover_size(source.size, (card_w, card_h))
    else:
        new_size = contain_size(source.size, (card_w, card_h))

    scaled = source.resize(new_size, Image.Resampling.LANCZOS)

    if fit == "cover":
        sx = max(0, (scaled.width - card_w) // 2)
        sy = max(0, (scaled.height - card_h) // 2)
        scaled = scaled.crop((sx, sy, sx + card_w, sy + card_h))
        pos = (x0, y0)
    else:
        pos = (x0 + (card_w - scaled.width) // 2, y0 + (card_h - scaled.height) // 2)

    card = Image.new("RGBA", (card_w, card_h), (0, 0, 0, 0))
    if fit == "cover":
        card = scaled
    else:
        card.alpha_composite(scaled, (pos[0] - x0, pos[1] - y0))

    mask = rounded_mask((card_w, card_h), radius)
    canvas.paste(card, (x0, y0), mask)
    return canvas


def crop(path: Path, box: tuple[int, int, int, int]) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    return image.crop(box)


def full(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def save(name: str, image: Image.Image) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    image.save(OUT / name)


def stacked_panel(top: Image.Image, bottom: Image.Image, split: int = 680) -> Image.Image:
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    top_box = (110, 70, 2290, split)
    bottom_box = (110, split + 46, 2290, 1324)
    top_img = frame_image(top, fit="cover", card_box=top_box, radius=30)
    bottom_img = frame_image(bottom, fit="cover", card_box=bottom_box, radius=30)
    canvas.alpha_composite(top_img)
    canvas.alpha_composite(bottom_img)
    return canvas


def featured_card_composition(
    center: Image.Image,
    left: Image.Image,
    right: Image.Image,
) -> Image.Image:
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))

    left_box = (84, 236, 720, 656)
    center_box = (642, 122, 1760, 886)
    right_box = (1682, 236, 2318, 656)

    canvas.alpha_composite(frame_image(left, fit="cover", card_box=left_box, radius=26))
    canvas.alpha_composite(frame_image(right, fit="cover", card_box=right_box, radius=26))
    canvas.alpha_composite(frame_image(center, fit="cover", card_box=center_box, radius=28))
    return canvas


def main() -> None:
    save(
        "vision_aplicada.png",
        frame_image(crop(SRC / "ChatGPT Image 8 jul 2026, 09_30_20 p.m..png", (28, 26, 1508, 1000)), fit="contain"),
    )
    save(
        "dashboard_resumen.png",
        frame_image(crop(SRC / "ChatGPT Image 8 jul 2026, 09_30_05 p.m..png", (18, 18, 1718, 886)), fit="contain"),
    )
    save(
        "dashboard_topicos.png",
        frame_image(crop(SRC / "ChatGPT Image 8 jul 2026, 09_29_57 p.m..png", (24, 24, 1558, 970)), fit="contain"),
    )
    save(
        "dashboard_trazabilidad.png",
        frame_image(crop(SRC / "ChatGPT Image 8 jul 2026, 09_29_43 p.m..png", (22, 20, 1535, 982)), fit="contain"),
    )
    save(
        "training_ecosystem.png",
        frame_image(crop(SRC / "ChatGPT Image 8 jul 2026, 09_29_32 p.m..png", (22, 22, 1512, 1002)), fit="contain"),
    )

    prep_card = crop(SRC / "ChatGPT Image 8 jul 2026, 09_29_32 p.m..png", (24, 136, 1288, 948))
    save(
        "training_preparacion_integral.png",
        frame_image(prep_card, fit="cover"),
    )

    save(
        "evaluations_ecosystem.png",
        frame_image(crop(SRC / "ChatGPT Image 8 jul 2026, 09_29_26 p.m..png", (22, 18, 1508, 990)), fit="contain"),
    )

    video_main = crop(SRC / "ChatGPT Image 8 jul 2026, 09_29_23 p.m..png", (296, 246, 1490, 910))
    save("evaluations_video_analysis.png", frame_image(video_main, fit="cover"))

    eval_board = full(SRC / "ChatGPT Image 8 jul 2026, 09_29_26 p.m..png")
    left_card = eval_board.crop((66, 252, 522, 554))
    center_card = eval_board.crop((548, 252, 1000, 554))
    right_card = eval_board.crop((1034, 252, 1470, 554))
    save("evaluations_formal_exam.png", featured_card_composition(center_card, left_card, right_card))

    rules_dual = crop(SRC / "ChatGPT Image 8 jul 2026, 09_29_19 p.m..png", (484, 94, 1482, 810))
    save("evaluations_rules_exam.png", frame_image(rules_dual, fit="cover"))

    communication = crop(SRC / "ChatGPT Image 8 jul 2026, 09_29_13 p.m..png", (428, 132, 1496, 876))
    save("evaluations_communication.png", frame_image(communication, fit="cover"))

    save(
        "library_ifab.png",
        frame_image(crop(SRC / "ChatGPT Image 8 jul 2026, 09_29_07 p.m..png", (18, 18, 1580, 962)), fit="contain"),
    )
    save(
        "performance_main.png",
        frame_image(crop(SRC / "ChatGPT Image 8 jul 2026, 09_34_06 p.m..png", (28, 24, 1690, 888)), fit="contain"),
    )
    save(
        "performance_registro_fisico.png",
        frame_image(crop(SRC / "ChatGPT Image 8 jul 2026, 09_39_04 p.m..png", (18, 16, 1580, 964)), fit="contain"),
    )

    rendimiento = crop(SCREENSHOTS / "08_rendimiento_modulos.png", (500, 70, 1830, 800))
    save("performance_rendimiento.png", frame_image(rendimiento, fit="contain"))

    perfil = crop(SCREENSHOTS / "12_perfil_arbitral.png", (500, 34, 1816, 622))
    save("perfil_arbitral.png", frame_image(perfil, fit="contain"))

    save(
        "perfil_refcard.png",
        frame_image(crop(SRC / "ChatGPT Image 8 jul 2026, 09_49_35 p.m. - copia.png", (28, 26, 1646, 916)), fit="contain"),
    )
    save(
        "instituciones_panel.png",
        frame_image(crop(SRC / "ChatGPT Image 8 jul 2026, 09_49_21 p.m. - copia.png", (20, 20, 1648, 918)), fit="contain"),
    )

    institutional_card = full(TMP_ASSETS / "admin_institutional_clips_card.png")
    save("instituciones_clips.png", frame_image(institutional_card, fit="contain", card_box=(360, 170, 2040, 1180)))

    notifications = crop(SRC / "ChatGPT Image 8 jul 2026, 09_55_42 p.m..png", (312, 26, 1620, 876))
    save("notificaciones.png", frame_image(notifications, fit="cover"))

    support = crop(SCREENSHOTS / "14_soporte.png", (540, 28, 1822, 840))
    save("soporte.png", frame_image(support, fit="cover"))

    admin = crop(SCREENSHOTS / "15_admin.png", (520, 196, 1818, 842))
    save("admin.png", frame_image(admin, fit="contain"))

    var_lab = crop(SRC / "ChatGPT Image 8 jul 2026, 09_29_32 p.m..png", (610, 205, 1050, 575))
    save("var_lab.png", frame_image(var_lab, fit="contain"))


if __name__ == "__main__":
    main()
