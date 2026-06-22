import os

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont


WEB_DIRECTORY = "./js"

TIP_MODE = "Choose Text or Logo. Text mode ignores logo input; Logo mode ignores text lines and bar."
TIP_POSITION = "Controlled by the transform box. 0 is left/top, 100 is right/bottom."
TIP_SCALE = "Controlled by the transform box. Text mode scales font and bar; Logo mode scales the logo."


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


def _load_font(size):
    font_candidates = [
        os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "arial.ttf"),
        os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "msyh.ttc"),
    ]

    for font_path in font_candidates:
        if os.path.exists(font_path):
            try:
                return ImageFont.truetype(font_path, size=size)
            except OSError:
                pass

    return ImageFont.load_default()


def _center_to_xy(center_x, center_y, item_width, item_height):
    return int(center_x - item_width / 2), int(center_y - item_height / 2)


def _text_block_size(draw, lines, font, line_spacing):
    max_width = 0
    heights = []
    for line in lines:
        bbox = draw.textbbox((0, 0), str(line), font=font)
        max_width = max(max_width, bbox[2] - bbox[0])
        heights.append(bbox[3] - bbox[1])

    total_height = sum(heights) + max(0, len(lines) - 1) * line_spacing
    return max_width, total_height, heights


class FreeCameraWatermark:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "watermark_mode": (["Text", "Logo"], {"default": "Text", "tooltip": TIP_MODE}),
                "position_x": ("FLOAT", {"default": 50.0, "min": 0.0, "max": 100.0, "step": 0.1, "tooltip": TIP_POSITION}),
                "position_y": ("FLOAT", {"default": 88.0, "min": 0.0, "max": 100.0, "step": 0.1, "tooltip": TIP_POSITION}),
                "scale": ("FLOAT", {"default": 1.0, "min": 0.05, "max": 8.0, "step": 0.01, "tooltip": TIP_SCALE}),
                "line_1": ("STRING", {"default": "iPhone 18 SuperPro Max"}),
                "line_2": ("STRING", {"default": "Main Camera"}),
                "line_3": ("STRING", {"default": "24mm | f/1.8 | 1/125s | ISO 50"}),
                "font_size": ("INT", {"default": 28, "min": 6, "max": 256, "step": 1}),
                "bar_height": ("INT", {"default": 90, "min": 0, "max": 1024, "step": 1}),
                "bar_opacity": ("INT", {"default": 255, "min": 0, "max": 255, "step": 1}),
                "text_color": ("STRING", {"default": "#000000"}),
                "bar_color": ("STRING", {"default": "#ffffff"}),
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
    DESCRIPTION = "Add either a simple text camera bar or a draggable logo watermark."

    def apply_watermark(
        self,
        image,
        watermark_mode,
        position_x,
        position_y,
        scale,
        line_1,
        line_2,
        line_3,
        font_size,
        bar_height,
        bar_opacity,
        text_color,
        bar_color,
        logo=None,
        logo_mask=None,
    ):
        output_images = []

        for index in range(image.shape[0]):
            base = _tensor_to_pil(image[index])
            center_x = base.width * max(0.0, min(100.0, float(position_x))) / 100.0
            center_y = base.height * max(0.0, min(100.0, float(position_y))) / 100.0

            if watermark_mode == "Logo" and logo is not None:
                self._apply_logo(base, logo, logo_mask, index, center_x, center_y, scale)
            elif watermark_mode == "Text":
                self._apply_text_bar(
                    base,
                    center_x,
                    center_y,
                    scale,
                    [line_1, line_2, line_3],
                    font_size,
                    bar_height,
                    bar_opacity,
                    text_color,
                    bar_color,
                )

            output_images.append(_pil_to_tensor(base))

        return (torch.stack(output_images, dim=0),)

    def _apply_logo(self, base, logo, logo_mask, index, center_x, center_y, scale):
        logo_index = index if logo.shape[0] > 1 else 0
        logo_image = _tensor_to_pil(logo[logo_index])
        if logo_mask is not None:
            logo_image.putalpha(_mask_to_alpha(logo_mask, index, logo_image.size))

        scaled_width = max(1, int(logo_image.width * float(scale)))
        scaled_height = max(1, int(logo_image.height * float(scale)))
        logo_image = logo_image.resize((scaled_width, scaled_height), Image.LANCZOS)

        x, y = _center_to_xy(center_x, center_y, scaled_width, scaled_height)
        base.alpha_composite(logo_image, (x, y))

    def _apply_text_bar(
        self,
        base,
        center_x,
        center_y,
        scale,
        lines,
        font_size,
        bar_height,
        bar_opacity,
        text_color,
        bar_color,
    ):
        clean_lines = [str(line) for line in lines if str(line).strip()]
        if not clean_lines:
            return

        scaled_font_size = max(6, int(font_size * float(scale)))
        scaled_bar_height = max(0, int(bar_height * float(scale)))
        line_spacing = max(1, int(scaled_font_size * 0.25))

        draw = ImageDraw.Draw(base)
        font = _load_font(scaled_font_size)
        text_width, text_height, line_heights = _text_block_size(draw, clean_lines, font, line_spacing)
        group_height = max(text_height, scaled_bar_height)
        text_x, group_y = _center_to_xy(center_x, center_y, text_width, group_height)

        if scaled_bar_height > 0 and bar_opacity > 0:
            overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
            overlay_draw = ImageDraw.Draw(overlay)
            by = int(center_y - scaled_bar_height / 2)
            fill = _parse_color(bar_color, (255, 255, 255)) + (int(bar_opacity),)
            overlay_draw.rectangle([0, by, base.width, by + scaled_bar_height], fill=fill)
            base.alpha_composite(overlay)

        text_y = int(group_y + (group_height - text_height) / 2)
        color = _parse_color(text_color, (0, 0, 0)) + (255,)
        cursor_y = text_y
        for line, line_height in zip(clean_lines, line_heights):
            draw.text((text_x, cursor_y), line, fill=color, font=font)
            cursor_y += line_height + line_spacing


NODE_CLASS_MAPPINGS = {
    "FreeCameraWatermark": FreeCameraWatermark,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "FreeCameraWatermark": "Free Camera Watermark",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
