#!/usr/bin/env python3
"""Compose a 16:9 Washgo press photo from field footage + UI stills, with PII redacted."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path("/Users/benchen/Desktop/go_marketing")
FRAMES = ROOT / "tmp/washgo-press-frames"
ASSETS = Path("/Users/benchen/.cursor/projects/Users-benchen-Desktop-go-marketing/assets")
OUT_DIR = ROOT / "docs/press"
FONT_BOLD = ROOT / "podcast-assets/fonts/SourceHanSansTW-Bold.otf"
FONT_REG = ROOT / "podcast-assets/fonts/SourceHanSansTW-Regular.otf"

W, H = 3840, 2160
BLUE = (29, 79, 140)
BRAND_BLUE = (58, 141, 222)
NAVY = (18, 42, 78)
CREAM = (255, 248, 240)
INK = (28, 36, 48)
MUTED = (90, 104, 122)


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size)


def mosaic(im: Image.Image, box: tuple[int, int, int, int], block: int = 18) -> None:
    x0, y0, x1, y1 = [int(v) for v in box]
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(im.width, x1), min(im.height, y1)
    if x1 <= x0 or y1 <= y0:
        return
    region = im.crop((x0, y0, x1, y1))
    small = region.resize(
        (max(1, (x1 - x0) // block), max(1, (y1 - y0) // block)),
        Image.Resampling.BILINEAR,
    )
    im.paste(small.resize((x1 - x0, y1 - y0), Image.Resampling.NEAREST), (x0, y0))


def rounded(im: Image.Image, radius: int) -> Image.Image:
    im = im.convert("RGBA")
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.width, im.height), radius, fill=255)
    im.putalpha(mask)
    return im


def shadow_card(im: Image.Image, radius: int = 36, pad: int = 28) -> Image.Image:
    card = rounded(im, radius)
    canvas = Image.new("RGBA", (card.width + pad * 2, card.height + pad * 2), (0, 0, 0, 0))
    sh = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        (pad - 4, pad + 8, pad + card.width + 4, pad + card.height + 14),
        radius + 4,
        fill=(16, 40, 72, 70),
    )
    sh = sh.filter(ImageFilter.GaussianBlur(18))
    canvas.alpha_composite(sh)
    canvas.alpha_composite(card, (pad, pad))
    return canvas


def cover(w: int, h: int, src: Image.Image) -> Image.Image:
    scale = max(w / src.width, h / src.height)
    resized = src.resize((int(src.width * scale), int(src.height * scale)), Image.Resampling.LANCZOS)
    x = (resized.width - w) // 2
    y = (resized.height - h) // 2
    return resized.crop((x, y, x + w, y + h))


def cover_top(w: int, h: int, src: Image.Image) -> Image.Image:
    scale = max(w / src.width, h / src.height)
    resized = src.resize((int(src.width * scale), int(src.height * scale)), Image.Resampling.LANCZOS)
    x = max(0, (resized.width - w) // 2)
    y = 0
    if y + h > resized.height:
        y = max(0, resized.height - h)
    return resized.crop((x, y, x + w, y + h))


def contain_pad(w: int, h: int, src: Image.Image, bg=(255, 255, 255), pad: int = 20) -> Image.Image:
    canvas = Image.new("RGB", (w, h), bg)
    scale = min((w - 2 * pad) / src.width, (h - 2 * pad) / src.height)
    nw, nh = max(1, int(src.width * scale)), max(1, int(src.height * scale))
    resized = src.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas.paste(resized, (pad, pad))
    return canvas


def fit_width(src: Image.Image, width: int) -> Image.Image:
    h = int(src.height * width / src.width)
    return src.resize((width, h), Image.Resampling.LANCZOS)


def prepare_hero() -> Image.Image:
    hero = Image.open(FRAMES / "hero_v3.jpg").convert("RGB")
    mosaic(hero, (305, 88, 405, 138), 10)  # scooter plate
    # Cut the instructional overlay; keep Washgo modules + hands
    return hero.crop((0, 0, 720, 955))


def prepare_order() -> Image.Image:
    src = Image.open(ASSETS / "S__128360561-f24e465c-aeca-4820-a421-1cc4db8fb064.jpg").convert("RGB")
    # Cover order UUID completely (do not mosaic the 訂單流程 label)
    ImageDraw.Draw(src).rectangle((0, 78, src.width, 124), fill=(248, 250, 252))
    # Keep header + flow + staff tabs; drop browser chrome / staging URL
    return src.crop((0, 0, src.width, 910))


def prepare_driver() -> Image.Image:
    src = Image.open(ASSETS / "S__128172273_0-0dd197df-b3c2-4696-b1c6-67614505be08.jpg").convert("RGB")
    mosaic(src, (40, 72, 205, 142), 14)  # 江勝豪
    return src


def prepare_qc() -> Image.Image:
    src = Image.open(ASSETS / "S__128360564-782bea32-b875-4569-87ff-eb629b8e7440.jpg").convert("RGB")
    mosaic(src, (30, 198, 230, 258), 14)  # 楊書豪
    # Crop before garment photos so customer clothes never appear
    return src.crop((0, 0, src.width, 500))


def draw_label(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, fill=BRAND_BLUE) -> None:
    x, y = xy
    fb = font(FONT_BOLD, 32)
    bbox = draw.textbbox((0, 0), text, font=fb)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.rounded_rectangle((x, y, x + tw + 32, y + th + 18), 16, fill=fill)
    draw.text((x + 16, y + 6), text, font=fb, fill="white")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    hero = prepare_hero()
    order = prepare_order()
    driver = prepare_driver()
    qc = prepare_qc()

    bg_src = Image.open(FRAMES / "scene_v1.jpg").convert("RGB")
    bg = cover(W, H, bg_src).filter(ImageFilter.GaussianBlur(36))
    overlay = Image.new("RGB", (W, H), CREAM)
    canvas = Image.blend(bg, overlay, 0.82).convert("RGBA")
    draw = ImageDraw.Draw(canvas)

    footer_h = 96
    hero_h = H - 48 - footer_h
    hero_w = int(hero_h * hero.width / hero.height)
    hero_card = shadow_card(hero.resize((hero_w, hero_h), Image.Resampling.LANCZOS), radius=36, pad=24)
    canvas.alpha_composite(hero_card, (28, 20))

    rx = 28 + hero_card.width + 8
    col_w = W - rx - 48
    draw.text((rx, 44), "會用 LINE，就能管好洗滌", font=font(FONT_BOLD, 62), fill=NAVY)
    draw.text(
        (rx, 122),
        "Washgo 已在洗滌現場落地，開放更多品牌加入",
        font=font(FONT_REG, 34),
        fill=MUTED,
    )

    gap = 16
    body_top = 178
    body_h = H - footer_h - 18 - body_top
    driver_slot_h = 420
    top_h = body_h - driver_slot_h - gap

    order_w = int((col_w - gap) * 0.50)
    order_h = int(order_w * order.height / order.width)
    if order_h > top_h - 28:
        order_h = top_h - 28
        order_w = int(order_h * order.width / order.height)
    order_card = shadow_card(
        order.resize((order_w, order_h), Image.Resampling.LANCZOS), radius=26, pad=14
    )
    canvas.alpha_composite(order_card, (rx - 6, body_top))
    d2 = ImageDraw.Draw(canvas)
    draw_label(d2, (rx + 12, body_top + 14), "訂單全程可追蹤")

    qc_x = rx - 6 + order_card.width + gap - 10
    qc_w = W - 48 - qc_x
    qc_fit_w = qc_w - 28
    qc_fit = fit_width(qc, qc_fit_w)
    if qc_fit.height > top_h - 36:
        qc_fit = qc.resize(
            (int((top_h - 36) * qc.width / qc.height), top_h - 36),
            Image.Resampling.LANCZOS,
        )
    qc_card = shadow_card(qc_fit, radius=22, pad=12)
    canvas.alpha_composite(qc_card, (qc_x, body_top))
    draw_label(d2, (qc_x + 16, body_top + 14), "品管逐件把關", fill=BLUE)

    driver_top = body_top + max(order_card.height, qc_card.height) - 8
    driver_w = col_w - 8
    driver_h = H - footer_h - 16 - driver_top
    dh = max(240, driver_h - 28)
    dw = min(driver_w - 28, int(dh * driver.width / driver.height))
    dh = int(dw * driver.height / driver.width)
    driver_card = shadow_card(
        driver.resize((dw, dh), Image.Resampling.LANCZOS), radius=22, pad=12
    )
    canvas.alpha_composite(driver_card, (rx - 6, driver_top))
    draw_label(d2, (rx + 12, driver_top + 14), "司機收送在 LINE 完成", fill=(46, 160, 110))

    bar = Image.new("RGBA", (W, footer_h), (18, 42, 78, 240))
    canvas.alpha_composite(bar, (0, H - footer_h))
    ImageDraw.Draw(canvas).text((72, H - 62), "Washgo", font=font(FONT_BOLD, 34), fill="white")
    ImageDraw.Draw(canvas).text(
        (240, H - 62),
        "以 LINE 完成收件、品管與司機收送　｜　姓名／編號／照片已遮蔽　｜　匠管提供",
        font=font(FONT_REG, 32),
        fill=(210, 224, 238),
    )

    out = canvas.convert("RGB")
    jpg = OUT_DIR / "washgo-media-hero-2026.jpg"
    png = OUT_DIR / "washgo-media-hero-2026.png"
    out.save(jpg, "JPEG", quality=92, optimize=True, subsampling=1)
    out.save(png, "PNG")
    print(f"hero {hero.size} card {hero_card.size} rx={rx} col_w={col_w}")
    print(f"order {order_w}x{order_h} qc={qc_card.size} driver={driver_card.size}")
    print(f"wrote {jpg} ({jpg.stat().st_size / 1024:.0f} KB)")
    print(f"wrote {png} ({png.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
