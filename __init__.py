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
    "Text",
    "Logo",
    "Logo + Text",
    "Camera Bar",
    "Transparent Watermark",
    "Pattern Watermark",
]
PRESETS = [
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
FONT_STYLES = [
    "System Default",
    "Signature",
    "Editorial",
    "Tech",
    "CJK System",
    "CJK Handwritten Optional",
    "CJK Display Optional",
]
PATTERN_TYPES = [
    "None",
    "Dots",
    "Diagonal Lines",
    "Soft Waves",
    "Tiny Stars",
    "Gradient Blocks",
]


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
        "Bottom Camera Bar": {"x": 50, "y": 91, "w": 86, "layout": "Text Only Bar"},
        "Minimal Bottom Caption": {"x": 50, "y": 92, "w": 72, "layout": "Text Only Bar"},
        "Center Transparent Text": {"x": 50, "y": 50, "w": 72, "layout": "Text Only"},
        "Tiled Transparent Logo": {"x": 50, "y": 50, "w": 36, "layout": "Tiled"},
        "Bottom Right Logo": {"x": 84, "y": 88, "w": 22, "layout": "Logo Only"},
        "Logo Left + Text Right": {"x": 50, "y": 88, "w": 62, "layout": "Logo Left"},
        "Soft Pattern Overlay": {"x": 50, "y": 50, "w": 100, "layout": "Pattern Only"},
        "Signature Center": {"x": 50, "y": 58, "w": 54, "layout": "Text Only"},
    }
    return layouts.get(chosen, {"x": 50, "y": 88, "w": 55, "layout": "Text Only Bar"})


def _resolve_layout(layout_json, mode, preset, width, height, safe_margin, auto_adapt):
    layout = _layout_from_preset(mode, preset, width, height, auto_adapt)
    saved = _safe_json(layout_json)
    if saved:
        layout.update({k: saved[k] for k in ("x", "y", "w", "layout") if k in saved})

    margin = _clamp(float(safe_margin), 0.0, 25.0)
    layout["x"] = _clamp(float(layout.get("x", 50)), margin, 100.0 - margin)
    layout["y"] = _clamp(float(layout.get("y", 88)), margin, 100.0 - margin)
    layout["w"] = _clamp(float(layout.get("w", 55)), 2.0, 100.0 - margin * 2)
    return layout


def _scaled_logo(logo_image, target_width, logo_opacity):
    ratio = target_width / max(1, logo_image.width)
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


def _draw_logo(base, logo_image, center_x, center_y, target_width, logo_opacity):
    logo_image = _scaled_logo(logo_image, target_width, _opacity(logo_opacity))
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


def _draw_pattern(base, pattern_type, seed, density, scale_min, scale_max, pattern_color, pattern_opacity):
    if pattern_type == "None" or pattern_opacity <= 0:
        return

    rng = random.Random(int(seed))
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    color = _parse_color(pattern_color, (255, 255, 255)) + (_opacity(pattern_opacity),)
    count = int(_clamp(density, 1, 100) * (base.width * base.height) / 180000)
    min_size = max(2, int(scale_min))
    max_size = max(min_size, int(scale_max))

    if pattern_type == "Dots":
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
                "mode": (MODES, {"default": "Camera Bar", "tooltip": "Choose text, logo, camera bar, transparent watermark, or generated pattern."}),
                "preset": (PRESETS, {"default": "Auto", "tooltip": "Auto picks a sensible layout. Custom keeps the transform box layout."}),
                "font_style": (FONT_STYLES, {"default": "System Default", "tooltip": "Bundled styles: Signature, Editorial, Tech. CJK optional styles use optional_fonts if present."}),
                "layout_json": ("STRING", {"default": "{}", "multiline": True, "tooltip": "Hidden transform data written by the drag box."}),
                "auto_adapt": ("BOOLEAN", {"default": True, "tooltip": "Adjust the default layout based on mode and image shape."}),
                "safe_margin": ("FLOAT", {"default": 3.0, "min": 0.0, "max": 25.0, "step": 0.5, "tooltip": "Minimum edge margin in percent for the transform center."}),
                "line_1": ("STRING", {"default": "iPhone 18 SuperPro Max"}),
                "line_2": ("STRING", {"default": "Main Camera"}),
                "line_3": ("STRING", {"default": "24mm | f/1.8 | 1/125s | ISO 50"}),
                "font_size": ("INT", {"default": 28, "min": 6, "max": 256, "step": 1, "tooltip": "Base text size. The transform box can auto-fit text to the selected width."}),
                "text_color": ("STRING", {"default": "#000000", "tooltip": "Text color, for example #000000 or #ffffff."}),
                "text_opacity": ("INT", {"default": 255, "min": 0, "max": 255, "step": 1, "tooltip": "0 is invisible, 128 is half transparent, 255 is fully opaque."}),
                "bar_color": ("STRING", {"default": "#ffffff", "tooltip": "Camera bar color, for example #ffffff."}),
                "bar_opacity": ("INT", {"default": 255, "min": 0, "max": 255, "step": 1, "tooltip": "0 hides the bar, 255 makes it solid."}),
                "bar_height": ("INT", {"default": 90, "min": 0, "max": 1024, "step": 1, "tooltip": "Base bar height in pixels. Set to 0 to hide the bar."}),
                "logo_opacity": ("INT", {"default": 255, "min": 0, "max": 255, "step": 1, "tooltip": "Logo transparency: 0 invisible, 255 opaque."}),
                "pattern_type": (PATTERN_TYPES, {"default": "None", "tooltip": "Lightweight local pattern drawn with PIL. No downloads."}),
                "pattern_color": ("STRING", {"default": "#ffffff", "tooltip": "Pattern color, for example #ffffff."}),
                "pattern_opacity": ("INT", {"default": 32, "min": 0, "max": 255, "step": 1, "tooltip": "Use low values like 16-48 for subtle transparent watermarks."}),
                "pattern_density": ("INT", {"default": 18, "min": 1, "max": 100, "step": 1, "tooltip": "Higher values draw more marks."}),
                "pattern_seed": ("INT", {"default": 20260623, "min": 0, "max": 2147483647, "step": 1, "tooltip": "Same seed repeats the same generated pattern."}),
                "pattern_scale_min": ("INT", {"default": 6, "min": 1, "max": 512, "step": 1, "tooltip": "Smallest generated pattern element size."}),
                "pattern_scale_max": ("INT", {"default": 22, "min": 1, "max": 1024, "step": 1, "tooltip": "Largest generated pattern element size."}),
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
    DESCRIPTION = "Lightweight draggable watermark node with text, logo, transparency, fonts, and procedural patterns."

    def apply_watermark(
        self,
        image,
        mode,
        preset,
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
        output_images = []

        for index in range(image.shape[0]):
            base = _tensor_to_pil(image[index])
            layout = _resolve_layout(layout_json, mode, preset, base.width, base.height, safe_margin, auto_adapt)
            center_x = base.width * layout["x"] / 100.0
            center_y = base.height * layout["y"] / 100.0
            target_width = base.width * layout["w"] / 100.0
            logo_image = _prepare_logo(logo, logo_mask, index)

            if mode == "Pattern Watermark":
                _draw_pattern(base, pattern_type, pattern_seed, pattern_density, pattern_scale_min, pattern_scale_max, pattern_color, pattern_opacity)
            elif mode == "Transparent Watermark":
                if logo_image is not None and preset == "Tiled Transparent Logo":
                    _tile_logo(base, logo_image, target_width, logo_opacity)
                elif logo_image is not None:
                    _draw_logo(base, logo_image, center_x, center_y, target_width, logo_opacity)
                else:
                    _draw_text_block(base, [line_1, line_2, line_3], center_x, center_y, target_width, font_style, font_size, text_color, text_opacity)
            elif mode == "Logo" and logo_image is not None:
                _draw_logo(base, logo_image, center_x, center_y, target_width, logo_opacity)
            elif mode == "Logo + Text":
                self._render_logo_text(base, logo_image, center_x, center_y, target_width, layout.get("layout", "Logo Left"), [line_1, line_2, line_3], font_style, font_size, text_color, text_opacity, logo_opacity)
            elif mode in ("Text", "Camera Bar"):
                scaled_bar_height = int(bar_height * (target_width / max(1, base.width * 0.55)))
                if mode == "Camera Bar":
                    _draw_bar(base, center_y, scaled_bar_height, bar_color, bar_opacity)
                _draw_text_block(base, [line_1, line_2, line_3], center_x, center_y, target_width, font_style, font_size, text_color, text_opacity)

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
    "FreeCameraWatermark": "Free Camera Watermark",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
