import os

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont


TIP_COORDS = (
    "Pixel position. 0 starts from the left/top. Negative values count from "
    "the right/bottom, so -40 means 40 pixels from the edge."
)
TIP_LOGO_SCALE = "Logo scale multiplier. 1.0 keeps the loaded logo size."
TIP_BAR_WIDTH = "White bar width in pixels. 0 means use the remaining image width."
TIP_BAR_HEIGHT = "White bar height in pixels. 0 disables the bar."


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


def _resolve_position(value, canvas_size, item_size):
    value = int(value)
    if value < 0:
        return canvas_size - item_size + value
    return value


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


class FreeCameraWatermark:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "line_1": ("STRING", {"default": "iPhone 18 SuperPro Max"}),
                "line_2": ("STRING", {"default": "Main Camera"}),
                "line_3": ("STRING", {"default": "24mm | f/1.8 | 1/125s | ISO 50"}),
                "logo_x": ("INT", {"default": -240, "min": -8192, "max": 8192, "step": 1, "tooltip": TIP_COORDS}),
                "logo_y": ("INT", {"default": -120, "min": -8192, "max": 8192, "step": 1, "tooltip": TIP_COORDS}),
                "logo_scale": ("FLOAT", {"default": 1.0, "min": 0.01, "max": 10.0, "step": 0.01, "tooltip": TIP_LOGO_SCALE}),
                "bar_x": ("INT", {"default": 0, "min": -8192, "max": 8192, "step": 1, "tooltip": TIP_COORDS}),
                "bar_y": ("INT", {"default": -180, "min": -8192, "max": 8192, "step": 1, "tooltip": TIP_COORDS}),
                "bar_width": ("INT", {"default": 0, "min": 0, "max": 16384, "step": 1, "tooltip": TIP_BAR_WIDTH}),
                "bar_height": ("INT", {"default": 180, "min": 0, "max": 4096, "step": 1, "tooltip": TIP_BAR_HEIGHT}),
                "text_x": ("INT", {"default": 48, "min": -8192, "max": 8192, "step": 1, "tooltip": TIP_COORDS}),
                "text_y": ("INT", {"default": -140, "min": -8192, "max": 8192, "step": 1, "tooltip": TIP_COORDS}),
                "font_size": ("INT", {"default": 32, "min": 6, "max": 512, "step": 1}),
                "line_spacing": ("INT", {"default": 8, "min": 0, "max": 256, "step": 1}),
                "text_color": ("STRING", {"default": "#000000"}),
                "bar_color": ("STRING", {"default": "#ffffff"}),
                "bar_opacity": ("INT", {"default": 255, "min": 0, "max": 255, "step": 1}),
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
    DESCRIPTION = "Add a simple movable camera-style watermark bar, text, and optional logo."

    def apply_watermark(
        self,
        image,
        line_1,
        line_2,
        line_3,
        logo_x,
        logo_y,
        logo_scale,
        bar_x,
        bar_y,
        bar_width,
        bar_height,
        text_x,
        text_y,
        font_size,
        line_spacing,
        text_color,
        bar_color,
        bar_opacity,
        logo=None,
        logo_mask=None,
    ):
        images = image
        logos = logo
        output_images = []

        for index in range(images.shape[0]):
            base = _tensor_to_pil(images[index])
            width, height = base.size

            if bar_height > 0 and bar_opacity > 0:
                overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
                draw = ImageDraw.Draw(overlay)
                resolved_bar_width = int(bar_width) if bar_width > 0 else width
                bx = _resolve_position(bar_x, width, resolved_bar_width)
                by = _resolve_position(bar_y, height, bar_height)
                fill = _parse_color(bar_color, (255, 255, 255)) + (int(bar_opacity),)
                draw.rectangle([bx, by, bx + resolved_bar_width, by + int(bar_height)], fill=fill)
                base = Image.alpha_composite(base, overlay)

            if logos is not None:
                logo_index = index if logos.shape[0] > 1 else 0
                logo_image = _tensor_to_pil(logos[logo_index])
                if logo_mask is not None:
                    logo_image.putalpha(_mask_to_alpha(logo_mask, index, logo_image.size))
                scaled_width = max(1, int(logo_image.width * float(logo_scale)))
                scaled_height = max(1, int(logo_image.height * float(logo_scale)))
                logo_image = logo_image.resize((scaled_width, scaled_height), Image.LANCZOS)
                lx = _resolve_position(logo_x, width, scaled_width)
                ly = _resolve_position(logo_y, height, scaled_height)
                base.alpha_composite(logo_image, (lx, ly))

            lines = [line for line in (line_1, line_2, line_3) if str(line).strip()]
            if lines:
                draw = ImageDraw.Draw(base)
                font = _load_font(int(font_size))
                color = _parse_color(text_color, (0, 0, 0)) + (255,)

                line_heights = []
                max_line_width = 0
                for line in lines:
                    bbox = draw.textbbox((0, 0), str(line), font=font)
                    max_line_width = max(max_line_width, bbox[2] - bbox[0])
                    line_heights.append(bbox[3] - bbox[1])

                total_text_height = sum(line_heights) + max(0, len(lines) - 1) * int(line_spacing)
                tx = _resolve_position(text_x, width, max_line_width)
                ty = _resolve_position(text_y, height, total_text_height)

                cursor_y = ty
                for line, line_height in zip(lines, line_heights):
                    draw.text((tx, cursor_y), str(line), fill=color, font=font)
                    cursor_y += line_height + int(line_spacing)

            output_images.append(_pil_to_tensor(base))

        return (torch.stack(output_images, dim=0),)


NODE_CLASS_MAPPINGS = {
    "FreeCameraWatermark": FreeCameraWatermark,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "FreeCameraWatermark": "Free Camera Watermark",
}
