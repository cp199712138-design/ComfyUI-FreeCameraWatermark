import json
import math
import os
import random

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont


WEB_DIRECTORY = "./js"

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
FONTS_DIR = os.path.join(ROOT_DIR, "fonts")
OPTIONAL_FONTS_DIR = os.path.join(ROOT_DIR, "optional_fonts")

MODES = [
    "\u6587\u5b57",
    "Logo",
    "Logo+\u6587\u5b57",
    "\u76f8\u673a\u767d\u6761",
    "\u900f\u660e\u6c34\u5370",
    "\u56fe\u6848\u6c34\u5370",
]
PRESETS = [
    "\u81ea\u52a8",
    "\u5e95\u90e8\u767d\u6761",
    "\u5e95\u90e8\u5c0f\u5b57",
    "\u5c45\u4e2d\u6587\u5b57",
    "\u5e73\u94faLogo",
    "\u53f3\u4e0bLogo",
    "Logo\u5de6\u6587\u5b57\u53f3",
    "\u67d4\u548c\u56fe\u6848",
    "\u5c45\u4e2d\u7b7e\u540d",
    "\u81ea\u5b9a\u4e49",
]
FONT_STYLES = [
    "\u9ed8\u8ba4",
    "\u624b\u5199",
    "\u4f18\u96c5",
    "\u79d1\u6280",
    "\u4e2d\u6587\u7cfb\u7edf",
    "\u4e2d\u6587\u624b\u5199(\u53ef\u9009)",
    "\u4e2d\u6587\u6807\u9898(\u53ef\u9009)",
]
PATTERN_TYPES = [
    "\u6e10\u53d8\u5149\u5f71",
    "\u79d1\u5e7b\u5149\u6805",
    "\u65e0",
    "\u5706\u70b9",
    "\u659c\u7ebf",
    "\u6ce2\u7eb9",
    "\u661f\u5149",
    "\u8272\u5757",
]

LEGACY_MODES = [
    "Text",
    "Logo + Text",
    "Camera Bar",
    "Transparent Watermark",
    "Pattern Watermark",
]
LEGACY_PRESETS = [
    "Auto",
    "Bottom Camera Bar",
    "Minimal Bottom Caption",
    "Center Transparent Text",
    "Tiled Transparent Logo",
    "Bottom Right Logo",
    "Logo Left + Text Right",
    "Soft Pattern Overlay",
    "Signature Center",
    "Custom",
]
LEGACY_FONT_STYLES = [
    "System Default",
    "Signature",
    "Editorial",
    "Tech",
    "CJK System",
    "CJK Handwritten Optional",
    "CJK Display Optional",
]
LEGACY_PATTERN_TYPES = [
    "Gradient Glow",
    "None",
    "Dots",
    "Diagonal Lines",
    "Soft Waves",
    "Tiny Stars",
    "Gradient Blocks",
    "Sci-Fi Grid",
]

MODE_CHOICES = MODES
PRESET_CHOICES = PRESETS
FONT_STYLE_CHOICES = FONT_STYLES
PATTERN_TYPE_CHOICES = PATTERN_TYPES

MODE_ALIASES = {
    "\u6587\u5b57": "Text",
    "Logo": "Logo",
    "Logo+\u6587\u5b57": "Logo + Text",
    "\u76f8\u673a\u767d\u6761": "Camera Bar",
    "\u900f\u660e\u6c34\u5370": "Transparent Watermark",
    "\u56fe\u6848\u6c34\u5370": "Pattern Watermark",
}
PRESET_ALIASES = {
    "\u81ea\u52a8": "Auto",
    "\u5e95\u90e8\u767d\u6761": "Bottom Camera Bar",
    "\u5e95\u90e8\u5c0f\u5b57": "Minimal Bottom Caption",
    "\u5c45\u4e2d\u6587\u5b57": "Center Transparent Text",
    "\u5e73\u94faLogo": "Tiled Transparent Logo",
    "\u53f3\u4e0bLogo": "Bottom Right Logo",
    "Logo\u5de6\u6587\u5b57\u53f3": "Logo Left + Text Right",
    "\u67d4\u548c\u56fe\u6848": "Soft Pattern Overlay",
    "\u5c45\u4e2d\u7b7e\u540d": "Signature Center",
    "\u81ea\u5b9a\u4e49": "Custom",
}
FONT_ALIASES = {
    "\u9ed8\u8ba4": "System Default",
    "\u624b\u5199": "Signature",
    "\u4f18\u96c5": "Editorial",
    "\u79d1\u6280": "Tech",
    "\u4e2d\u6587\u7cfb\u7edf": "CJK System",
    "\u4e2d\u6587\u624b\u5199(\u53ef\u9009)": "CJK Handwritten Optional",
    "\u4e2d\u6587\u6807\u9898(\u53ef\u9009)": "CJK Display Optional",
}
PATTERN_ALIASES = {
    "\u6e10\u53d8\u5149\u5f71": "Gradient Glow",
    "\u65e0": "None",
    "\u5706\u70b9": "Dots",
    "\u659c\u7ebf": "Diagonal Lines",
    "\u6ce2\u7eb9": "Soft Waves",
    "\u661f\u5149": "Tiny Stars",
    "\u8272\u5757": "Gradient Blocks",
    "\u79d1\u5e7b\u5149\u6805": "Sci-Fi Grid",
}


def _canonical(value, aliases):
    return aliases.get(value, value)


def _tensor_to_pil(image):
    if hasattr(image, "detach"):
        image = image.detach().cpu().numpy()

    arr = np.asarray(image)
    arr = np.clip(arr * 255.0, 0, 255).astype(np.uint8)

    if arr.ndim == 2:
        return Image.fromarray(arr, mode="L").convert("RGBA")

    if arr.shape[-1] == 1:
        arr = np.repeat(arr, 3, axis=-1)

    if arr.shape[-1] == 4:
        return Image.fromarray(arr, mode="RGBA")

    return Image.fromarray(arr[:, :, :3], mode="RGB").convert("RGBA")


def _pil_to_tensor(image):
    arr = np.asarray(image.convert("RGB")).astype(np.float32) / 255.0
    return torch.from_numpy(arr)


def _mask_to_alpha(mask, index, size):
    if hasattr(mask, "detach"):
        mask = mask.detach().cpu().numpy()

    arr = np.asarray(mask)
    if arr.ndim == 3:
        arr = arr[index if arr.shape[0] > 1 else 0]
    elif arr.ndim == 4:
        arr = arr[index if arr.shape[0] > 1 else 0, :, :, 0]

    alpha = 1.0 - np.clip(arr, 0.0, 1.0)
    alpha = (alpha * 255.0).astype(np.uint8)
    alpha_image = Image.fromarray(alpha, mode="L")
    if alpha_image.size != size:
        alpha_image = alpha_image.resize(size, Image.LANCZOS)
    return alpha_image


def _parse_color(value, fallback):
    value = str(value).strip()

    if value.startswith("#"):
        raw = value[1:]
        if len(raw) == 3:
            raw = "".join(ch * 2 for ch in raw)
        if len(raw) == 6:
            try:
                return tuple(int(raw[i : i + 2], 16) for i in (0, 2, 4))
            except ValueError:
                return fallback

    parts = [part.strip() for part in value.split(",")]
    if len(parts) == 3:
        try:
            return tuple(max(0, min(255, int(part))) for part in parts)
        except ValueError:
            return fallback

    return fallback


def _clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def _opacity(value):
    return int(_clamp(float(value), 0, 255))


def _ui_opacity(value):
    value = float(value)
    if value <= 100:
        value *= 2.55
    return _opacity(value)


def _contrast_hex(color):
    red, green, blue = _parse_color(color, (255, 255, 255))
    luminance = 0.299 * red + 0.587 * green + 0.114 * blue
    return "#000000" if luminance > 150 else "#ffffff"


def _safe_json(value):
    if not value:
        return {}
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _center_to_xy(center_x, center_y, item_width, item_height):
    return int(center_x - item_width / 2), int(center_y - item_height / 2)


def _text_block_size(draw, lines, font, line_spacing):
    max_width = 0
    heights = []
    for line in lines:
        bbox = draw.textbbox((0, 0), str(line), font=font)
        max_width = max(max_width, bbox[2] - bbox[0])
        heights.append(max(1, bbox[3] - bbox[1]))

    total_height = sum(heights) + max(0, len(lines) - 1) * line_spacing
    return max_width, total_height, heights


def _font_candidates(font_style):
    font_style = _canonical(font_style, FONT_ALIASES)
    fonts = []
    if font_style == "Signature":
        fonts.append(os.path.join(FONTS_DIR, "Caveat-Regular.ttf"))
    elif font_style == "Editorial":
        fonts.append(os.path.join(FONTS_DIR, "PlayfairDisplay-Regular.ttf"))
    elif font_style == "Tech":
        fonts.append(os.path.join(FONTS_DIR, "Orbitron-Medium.ttf"))
    elif font_style == "CJK Handwritten Optional":
        fonts.extend(
            [
                os.path.join(OPTIONAL_FONTS_DIR, "LXGWWenKai-Regular.ttf"),
                os.path.join(OPTIONAL_FONTS_DIR, "LXGWWenKai.ttf"),
            ]
        )
    elif font_style == "CJK Display Optional":
        fonts.extend(
            [
                os.path.join(OPTIONAL_FONTS_DIR, "SmileySans-Oblique.ttf"),
                os.path.join(OPTIONAL_FONTS_DIR, "SmileySans.ttf"),
            ]
        )

    windir = os.environ.get("WINDIR", r"C:\Windows")
    if font_style.startswith("CJK"):
        fonts.extend(
            [
                os.path.join(windir, "Fonts", "msyh.ttc"),
                os.path.join(windir, "Fonts", "simhei.ttf"),
                os.path.join(windir, "Fonts", "Deng.ttf"),
            ]
        )
    fonts.extend(
        [
            os.path.join(windir, "Fonts", "arial.ttf"),
            os.path.join(windir, "Fonts", "msyh.ttc"),
        ]
    )
    return fonts


def _load_font(font_style, size):
    for font_path in _font_candidates(font_style):
        if os.path.exists(font_path):
            try:
                return ImageFont.truetype(font_path, size=size)
            except OSError:
                pass

    return ImageFont.load_default()


def _layout_from_preset(mode, preset, width, height, auto_adapt):
    mode = _canonical(mode, MODE_ALIASES)
    preset = _canonical(preset, PRESET_ALIASES)
    aspect = width / max(1, height)
    chosen = preset
    if preset == "Auto" and auto_adapt:
        if mode == "Logo":
            chosen = "Bottom Right Logo"
        elif mode == "Logo + Text":
            chosen = "Logo Left + Text Right"
        elif mode == "Transparent Watermark":
            chosen = "Center Transparent Text"
        elif mode == "Pattern Watermark":
            chosen = "Soft Pattern Overlay"
        elif aspect < 0.8:
            chosen = "Bottom Camera Bar"
        elif aspect > 1.25:
            chosen = "Minimal Bottom Caption"
        else:
            chosen = "Signature Center"

    layouts = {
        "Bottom Camera Bar": {"x": 50, "y": 91, "w": 86, "h": 16, "layout": "Text Only Bar"},
        "Minimal Bottom Caption": {"x": 50, "y": 92, "w": 72, "h": 14, "layout": "Text Only Bar"},
        "Center Transparent Text": {"x": 50, "y": 50, "w": 72, "h": 18, "layout": "Text Only"},
        "Tiled Transparent Logo": {"x": 50, "y": 50, "w": 36, "h": 36, "layout": "Tiled"},
        "Bottom Right Logo": {"x": 84, "y": 88, "w": 22, "h": 16, "layout": "Logo Only"},
        "Logo Left + Text Right": {"x": 50, "y": 88, "w": 62, "h": 16, "layout": "Logo Left"},
        "Soft Pattern Overlay": {"x": 50, "y": 50, "w": 100, "h": 100, "layout": "Pattern Only"},
        "Signature Center": {"x": 50, "y": 58, "w": 54, "h": 18, "layout": "Text Only"},
    }
    return layouts.get(chosen, {"x": 50, "y": 88, "w": 55, "h": 16, "layout": "Text Only Bar"})


def _resolve_layout(layout_json, mode, width, height):
    mode = _canonical(mode, MODE_ALIASES)
    layout = _layout_from_preset(mode, "Auto", width, height, True)
    saved = _safe_json(layout_json)
    if saved:
        saved_mode = _canonical(saved.get("mode"), MODE_ALIASES) if saved.get("mode") else None
        if saved_mode and saved_mode != mode:
            return layout
        layout.update({k: saved[k] for k in ("x", "y", "w", "h", "layout") if k in saved})

    layout["w"] = _clamp(float(layout.get("w", 55)), 2.0, 100.0)
    layout["h"] = _clamp(float(layout.get("h", 16)), 2.0, 100.0)
    layout["x"] = _clamp(float(layout.get("x", 50)), layout["w"] / 2.0, 100.0 - layout["w"] / 2.0)
    layout["y"] = _clamp(float(layout.get("y", 88)), layout["h"] / 2.0, 100.0 - layout["h"] / 2.0)
    return layout


def _scaled_logo(logo_image, target_width, logo_opacity, target_height=None):
    ratio = target_width / max(1, logo_image.width)
    if target_height is not None and target_height > 0:
        ratio = min(ratio, target_height / max(1, logo_image.height))
    size = (max(1, int(logo_image.width * ratio)), max(1, int(logo_image.height * ratio)))
    logo_image = logo_image.resize(size, Image.LANCZOS)
    if logo_opacity < 255:
        alpha = logo_image.getchannel("A").point(lambda p: int(p * logo_opacity / 255))
        logo_image.putalpha(alpha)
    return logo_image


def _draw_text_block(base, lines, center_x, center_y, target_width, font_style, font_size, text_color, text_opacity):
    clean_lines = [str(line) for line in lines if str(line).strip()]
    if not clean_lines:
        return (0, 0)

    base_size = max(6, int(font_size))
    draw = ImageDraw.Draw(base)
    font = _load_font(font_style, base_size)
    spacing = max(1, int(base_size * 0.25))
    text_width, text_height, line_heights = _text_block_size(draw, clean_lines, font, spacing)
    if text_width > 0 and target_width > 0:
        scale = target_width / text_width
        scaled_size = max(6, int(base_size * scale))
        font = _load_font(font_style, scaled_size)
        spacing = max(1, int(scaled_size * 0.25))
        text_width, text_height, line_heights = _text_block_size(draw, clean_lines, font, spacing)

    x, y = _center_to_xy(center_x, center_y, text_width, text_height)
    color = _parse_color(text_color, (0, 0, 0)) + (_opacity(text_opacity),)
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    layer_draw = ImageDraw.Draw(layer)
    cursor_y = y
    for line, line_height in zip(clean_lines, line_heights):
        layer_draw.text((x, cursor_y), line, fill=color, font=font)
        cursor_y += line_height + spacing
    base.alpha_composite(layer)
    return text_width, text_height


def _draw_bar(base, center_y, bar_height, bar_color, bar_opacity):
    if bar_height <= 0 or bar_opacity <= 0:
        return
    y = int(center_y - bar_height / 2)
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.rectangle([0, y, base.width, y + int(bar_height)], fill=_parse_color(bar_color, (255, 255, 255)) + (_opacity(bar_opacity),))
    base.alpha_composite(layer)


def _draw_logo(base, logo_image, center_x, center_y, target_width, logo_opacity, target_height=None):
    logo_image = _scaled_logo(logo_image, target_width, _opacity(logo_opacity), target_height)
    x, y = _center_to_xy(center_x, center_y, logo_image.width, logo_image.height)
    base.alpha_composite(logo_image, (x, y))
    return logo_image.width, logo_image.height


def _tile_logo(base, logo_image, target_width, opacity):
    logo_image = _scaled_logo(logo_image, target_width, _opacity(opacity))
    step_x = max(1, int(logo_image.width * 2.2))
    step_y = max(1, int(logo_image.height * 2.2))
    for y in range(-step_y, base.height + step_y, step_y):
        for x in range(-step_x, base.width + step_x, step_x):
            base.alpha_composite(logo_image, (x, y))


def _draw_pattern(base, pattern_type, seed, density, scale_min, scale_max, pattern_color, pattern_opacity, bounds=None):
    pattern_type = _canonical(pattern_type, PATTERN_ALIASES)
    if pattern_opacity <= 0:
        return
    if pattern_type == "None":
        pattern_type = "Gradient Glow"

    if bounds:
        x0, y0, x1, y1 = [int(v) for v in bounds]
        x0 = max(0, min(base.width, x0))
        y0 = max(0, min(base.height, y0))
        x1 = max(x0 + 1, min(base.width, x1))
        y1 = max(y0 + 1, min(base.height, y1))
        target = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 0))
        _draw_pattern(target, pattern_type, seed, density, scale_min, scale_max, pattern_color, pattern_opacity)
        base.alpha_composite(target, (x0, y0))
        return

    rng = random.Random(int(seed))
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    color = _parse_color(pattern_color, (255, 255, 255)) + (_opacity(pattern_opacity),)
    count = max(1, int(_clamp(density, 1, 100) * (base.width * base.height) / 180000))
    min_size = max(2, int(scale_min))
    max_size = max(min_size, int(scale_max))

    if pattern_type == "Gradient Glow":
        rgb = _parse_color(pattern_color, (255, 255, 255))
        alpha = _opacity(pattern_opacity)
        width = max(1, base.width)
        height = max(1, base.height)
        for y in range(height):
            row_alpha = int(alpha * (0.08 + 0.38 * (y / height)))
            draw.line([(0, y), (width, y)], fill=rgb + (row_alpha,), width=1)

        glow_count = max(3, count)
        for _ in range(glow_count):
            cx = rng.randint(0, width)
            cy = rng.randint(0, height)
            radius = rng.randint(max(18, min_size * 5), max(24, max_size * 9))
            for step in range(5, 0, -1):
                r = int(radius * step / 5)
                a = max(1, int(alpha * 0.035 * step))
                draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=rgb + (a,), width=max(1, r // 18))

        line_count = max(5, count * 2)
        for _ in range(line_count):
            length = rng.randint(max(30, min_size * 8), max(42, max_size * 14))
            x = rng.randint(-length, width)
            y = rng.randint(0, height + length)
            drift = rng.randint(length // 4, max(length // 2, length))
            draw.line([(x, y), (x + length, y - drift)], fill=rgb + (max(1, int(alpha * 0.45)),), width=max(1, max_size // 12))

        block_count = max(4, count)
        for _ in range(block_count):
            w = rng.randint(max(20, min_size * 6), max(26, max_size * 12))
            h = rng.randint(max(3, min_size), max(6, max_size // 2))
            x = rng.randint(-w // 2, width)
            y = rng.randint(0, height)
            draw.rounded_rectangle([x, y, x + w, y + h], radius=max(1, h // 2), fill=rgb + (max(1, int(alpha * 0.5)),))
    elif pattern_type == "Dots":
        for _ in range(count * 12):
            r = rng.randint(min_size, max_size)
            x = rng.randint(0, base.width)
            y = rng.randint(0, base.height)
            draw.ellipse([x - r, y - r, x + r, y + r], fill=color)
    elif pattern_type == "Diagonal Lines":
        gap = max(20, int(1200 / max(1, density)))
        line_width = max(1, int(max_size / 8))
        for x in range(-base.height, base.width + base.height, gap):
            draw.line([(x, base.height), (x + base.height, 0)], fill=color, width=line_width)
    elif pattern_type == "Soft Waves":
        line_width = max(1, int(max_size / 10))
        for i in range(max(3, count)):
            y0 = rng.randint(0, base.height)
            points = []
            amplitude = rng.randint(min_size, max_size)
            for x in range(0, base.width + 20, 20):
                y = y0 + math.sin((x / 80.0) + i) * amplitude
                points.append((x, y))
            draw.line(points, fill=color, width=line_width)
    elif pattern_type == "Tiny Stars":
        for _ in range(count * 6):
            r = rng.randint(min_size, max_size)
            x = rng.randint(0, base.width)
            y = rng.randint(0, base.height)
            draw.line([(x - r, y), (x + r, y)], fill=color, width=1)
            draw.line([(x, y - r), (x, y + r)], fill=color, width=1)
    elif pattern_type == "Gradient Blocks":
        for _ in range(count * 2):
            w = rng.randint(min_size * 4, max_size * 8)
            h = rng.randint(min_size * 2, max_size * 5)
            x = rng.randint(-w, base.width)
            y = rng.randint(-h, base.height)
            draw.rounded_rectangle([x, y, x + w, y + h], radius=max(2, min(w, h) // 5), fill=color)
    elif pattern_type == "Sci-Fi Grid":
        rgb = _parse_color(pattern_color, (255, 255, 255))
        alpha = _opacity(pattern_opacity)
        soft = rgb + (max(1, int(alpha * 0.28)),)
        medium = rgb + (max(1, int(alpha * 0.52)),)
        bright = rgb + (alpha,)
        span = max(1, min(base.width, base.height))
        grid_gap = max(10, int(_clamp((min_size + max_size) * 1.8, 10, 90) * 35 / max(8, density)))
        fine_gap = max(6, grid_gap // 3)
        line_width = max(1, max_size // 18)
        random_units = max(8, int(_clamp(density, 1, 100) * (base.width * base.height) / 90000))

        for x in range(rng.randint(-fine_gap, 0), base.width + fine_gap, fine_gap):
            draw.line([(x, 0), (x, base.height)], fill=soft, width=1)
        for y in range(rng.randint(-fine_gap, 0), base.height + fine_gap, fine_gap):
            draw.line([(0, y), (base.width, y)], fill=soft, width=1)
        for x in range(rng.randint(-grid_gap, 0), base.width + grid_gap, grid_gap):
            draw.line([(x, 0), (x, base.height)], fill=medium, width=line_width)
        for y in range(rng.randint(-grid_gap, 0), base.height + grid_gap, grid_gap):
            draw.line([(0, y), (base.width, y)], fill=medium, width=line_width)

        for _ in range(random_units):
            length = rng.randint(max(16, span // 8), max(24, span // 2))
            x = rng.randint(-length, base.width)
            y = rng.randint(0, base.height + length)
            drift = rng.randint(length // 4, max(length // 3, length))
            draw.line([(x, y), (x + length, y - drift)], fill=medium, width=max(1, line_width + 1))
            if rng.random() < 0.45:
                draw.line([(x + length // 3, y - drift // 3), (x + length, y - drift)], fill=bright, width=1)

        node_count = max(8, random_units * 2)
        for _ in range(node_count):
            x = rng.randint(0, base.width)
            y = rng.randint(0, base.height)
            r = rng.randint(max(1, min_size // 3), max(2, max_size // 4))
            draw.ellipse([x - r, y - r, x + r, y + r], outline=bright, width=1)
            if r > 2:
                draw.point((x, y), fill=bright)

        for _ in range(max(5, random_units // 2)):
            w = rng.randint(max(18, min_size * 5), max(24, max_size * 9))
            h = rng.randint(max(8, min_size * 2), max(10, max_size * 3))
            x = rng.randint(-w // 2, base.width)
            y = rng.randint(0, base.height)
            corner = max(4, min(w, h) // 3)
            draw.line([(x, y), (x + corner, y), (x + corner, y + 1)], fill=bright, width=1)
            draw.line([(x, y), (x, y + corner)], fill=bright, width=1)
            draw.rectangle([x + corner, y + h // 3, x + w, y + h], outline=soft, width=1)

    base.alpha_composite(layer)


def _prepare_logo(logo, logo_mask, index):
    if logo is None:
        return None
    logo_index = index if logo.shape[0] > 1 else 0
    logo_image = _tensor_to_pil(logo[logo_index])
    if logo_mask is not None:
        logo_image.putalpha(_mask_to_alpha(logo_mask, index, logo_image.size))
    return logo_image


class FreeCameraWatermark:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "mode": (MODE_CHOICES, {"default": "\u76f8\u673a\u767d\u6761", "tooltip": "\u9009\u62e9\u6c34\u5370\u7c7b\u578b\u3002"}),
                "font_style": (FONT_STYLE_CHOICES, {"default": "\u9ed8\u8ba4", "tooltip": "\u6587\u5b57\u5b57\u4f53\u98ce\u683c\u3002"}),
                "layout_json": ("STRING", {"default": "{}", "multiline": True, "tooltip": "拖拽框保存的位置数据，通常不用改。"}),
                "auto_adapt": ("BOOLEAN", {"default": True, "tooltip": "兼容旧工作流，新版使用拖拽画布自定义。"}),
                "safe_margin": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 25.0, "step": 0.5, "tooltip": "兼容旧工作流。"}),
                "line_1": ("STRING", {"default": "iPhone 18 SuperPro Max"}),
                "line_2": ("STRING", {"default": "Main Camera"}),
                "line_3": ("STRING", {"default": "24mm | f/1.8 | 1/125s | ISO 50"}),
                "font_size": ("INT", {"default": 28, "min": 6, "max": 256, "step": 1, "tooltip": "文字大小。"}),
                "text_color": ("STRING", {"default": "#ffffff", "tooltip": "主颜色：用于文字、白条、透明水印和图案。"}),
                "text_opacity": ("INT", {"default": 100, "min": 0, "max": 100, "step": 1, "tooltip": "透明度：0 看不见，100 不透明。"}),
                "bar_color": ("STRING", {"default": "#ffffff", "tooltip": "兼容旧工作流，新版改用主颜色。"}),
                "bar_opacity": ("INT", {"default": 100, "min": 0, "max": 255, "step": 1, "tooltip": "兼容旧工作流，新版改用透明度。"}),
                "bar_height": ("INT", {"default": 90, "min": 0, "max": 1024, "step": 1, "tooltip": "兼容旧工作流，新版用拖拽框高度控制。"}),
                "logo_opacity": ("INT", {"default": 100, "min": 0, "max": 255, "step": 1, "tooltip": "兼容旧工作流，新版改用统一透明度。"}),
                "pattern_type": (PATTERN_TYPE_CHOICES, {"default": "\u6e10\u53d8\u5149\u5f71", "tooltip": "\u56fe\u6848\u6837\u5f0f\u3002"}),
                "pattern_color": ("STRING", {"default": "#ffffff", "tooltip": "兼容旧工作流，新版改用主颜色。"}),
                "pattern_opacity": ("INT", {"default": 32, "min": 0, "max": 255, "step": 1, "tooltip": "兼容旧工作流，新版改用透明度。"}),
                "pattern_density": ("INT", {"default": 18, "min": 1, "max": 100, "step": 1, "tooltip": "图案数量。"}),
                "pattern_seed": ("INT", {"default": 20260623, "min": 0, "max": 2147483647, "step": 1, "tooltip": "随机种子。"}),
                "pattern_scale_min": ("INT", {"default": 6, "min": 1, "max": 512, "step": 1, "tooltip": "图案最小尺寸。"}),
                "pattern_scale_max": ("INT", {"default": 22, "min": 1, "max": 1024, "step": 1, "tooltip": "图案最大尺寸。"}),
            },
            "optional": {
                "logo": ("IMAGE",),
                "logo_mask": ("MASK",),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "apply_watermark"
    CATEGORY = "image/watermark"
    DESCRIPTION = "轻量相机水印：文字、Logo、透明水印和图案。"

    def apply_watermark(
        self,
        image,
        mode,
        font_style,
        layout_json,
        auto_adapt,
        safe_margin,
        line_1,
        line_2,
        line_3,
        font_size,
        text_color,
        text_opacity,
        bar_color,
        bar_opacity,
        bar_height,
        logo_opacity,
        pattern_type,
        pattern_color,
        pattern_opacity,
        pattern_density,
        pattern_seed,
        pattern_scale_min,
        pattern_scale_max,
        logo=None,
        logo_mask=None,
    ):
        mode = _canonical(mode, MODE_ALIASES)
        font_style = _canonical(font_style, FONT_ALIASES)
        pattern_type = _canonical(pattern_type, PATTERN_ALIASES)
        main_color = text_color
        main_opacity = _ui_opacity(text_opacity)
        output_images = []

        for index in range(image.shape[0]):
            base = _tensor_to_pil(image[index])
            layout = _resolve_layout(layout_json, mode, base.width, base.height)
            center_x = base.width * layout["x"] / 100.0
            center_y = base.height * layout["y"] / 100.0
            target_width = base.width * layout["w"] / 100.0
            target_height = base.height * layout["h"] / 100.0
            logo_image = _prepare_logo(logo, logo_mask, index)

            if mode == "Pattern Watermark":
                bounds = (
                    center_x - target_width / 2,
                    center_y - target_height / 2,
                    center_x + target_width / 2,
                    center_y + target_height / 2,
                )
                _draw_pattern(base, pattern_type, pattern_seed, pattern_density, pattern_scale_min, pattern_scale_max, main_color, main_opacity, bounds)
            elif mode == "Transparent Watermark":
                if logo_image is not None:
                    _draw_logo(base, logo_image, center_x, center_y, target_width, main_opacity, target_height)
                else:
                    _draw_text_block(base, [line_1, line_2, line_3], center_x, center_y, target_width, font_style, font_size, main_color, main_opacity)
            elif mode == "Logo" and logo_image is not None:
                _draw_logo(base, logo_image, center_x, center_y, target_width, main_opacity, target_height)
            elif mode == "Logo + Text":
                self._render_logo_text(base, logo_image, center_x, center_y, target_width, layout.get("layout", "Logo Left"), [line_1, line_2, line_3], font_style, font_size, main_color, main_opacity, main_opacity)
            elif mode in ("Text", "Camera Bar"):
                if mode == "Camera Bar":
                    _draw_bar(base, center_y, target_height, main_color, main_opacity)
                    text_draw_color = _contrast_hex(main_color)
                else:
                    text_draw_color = main_color
                _draw_text_block(base, [line_1, line_2, line_3], center_x, center_y, target_width, font_style, font_size, text_draw_color, main_opacity)

            output_images.append(_pil_to_tensor(base))

        return (torch.stack(output_images, dim=0),)

    def _render_logo_text(self, base, logo_image, center_x, center_y, target_width, layout_name, lines, font_style, font_size, text_color, text_opacity, logo_opacity):
        clean_lines = [str(line) for line in lines if str(line).strip()]
        if logo_image is None:
            _draw_text_block(base, clean_lines, center_x, center_y, target_width, font_style, font_size, text_color, text_opacity)
            return

        logo_width = target_width * 0.28
        gap = target_width * 0.06
        text_width = target_width - logo_width - gap
        if layout_name in ("Logo Above", "Logo Below"):
            logo_width = target_width * 0.36
            text_width = target_width

        if layout_name == "Logo Right":
            _draw_text_block(base, clean_lines, center_x - (logo_width + gap) / 2, center_y, text_width, font_style, font_size, text_color, text_opacity)
            _draw_logo(base, logo_image, center_x + (text_width + gap) / 2, center_y, logo_width, logo_opacity)
        elif layout_name == "Logo Above":
            _draw_logo(base, logo_image, center_x, center_y - logo_width * 0.35, logo_width, logo_opacity)
            _draw_text_block(base, clean_lines, center_x, center_y + logo_width * 0.35, text_width, font_style, font_size, text_color, text_opacity)
        elif layout_name == "Logo Below":
            _draw_text_block(base, clean_lines, center_x, center_y - logo_width * 0.28, text_width, font_style, font_size, text_color, text_opacity)
            _draw_logo(base, logo_image, center_x, center_y + logo_width * 0.42, logo_width, logo_opacity)
        else:
            _draw_logo(base, logo_image, center_x - (text_width + gap) / 2, center_y, logo_width, logo_opacity)
            _draw_text_block(base, clean_lines, center_x + (logo_width + gap) / 2, center_y, text_width, font_style, font_size, text_color, text_opacity)


NODE_CLASS_MAPPINGS = {
    "FreeCameraWatermark": FreeCameraWatermark,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "FreeCameraWatermark": "\u81ea\u7531\u76f8\u673a\u6c34\u5370",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
