# ComfyUI-FreeCameraWatermark

Lightweight ComfyUI node for adding a camera-style watermark bar, text, and an optional signature/logo image.

No pip install. No comfy-env. No custom frontend.

## Install

Copy this folder into:

```text
ComfyUI/custom_nodes
```

Restart ComfyUI, then search:

```text
Free Camera Watermark
```

## Inputs

- `image`: main image.
- `logo`: optional signature/logo image.
- `logo_mask`: optional mask output from ComfyUI `LoadImage`; connect it when using a transparent PNG logo.
- `line_1`, `line_2`, `line_3`: up to three text lines.
- `logo_x`, `logo_y`: logo position in pixels.
- `logo_scale`: logo size multiplier. `1.0` keeps the original loaded logo size.
- `bar_x`, `bar_y`: white bar position in pixels.
- `bar_width`: bar width in pixels. `0` means full remaining width.
- `bar_height`: bar height in pixels. `0` disables the bar.
- `text_x`, `text_y`: text position in pixels.
- `font_size`: text size.
- `line_spacing`: space between text lines.
- `text_color`: text color, for example `#000000`.
- `bar_color`: bar color, for example `#ffffff`.
- `bar_opacity`: `0` is fully transparent, `255` is fully opaque.

## Coordinate Rule

Coordinates are pixel values:

- `0` starts from the left/top edge.
- Negative values count from the right/bottom edge.

Examples:

- `text_x = 48`: text starts 48 px from the left.
- `text_y = -140`: text sits near the bottom.
- `logo_x = -240`: logo sits near the right side.
- `bar_y = -180`: bar sits at the bottom.

## Notes

This node only composites pixels into the image. It does not remove metadata, read EXIF, upload files, or provide a drag UI.
