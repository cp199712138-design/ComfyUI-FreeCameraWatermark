# ComfyUI-FreeCameraWatermark

Lightweight ComfyUI node for adding either a camera-style text bar or a logo/signature watermark.

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

## Simple Controls

- `watermark_mode`: choose `Text` or `Logo`.
- `placement`: choose a safe preset position.
- `offset_x`: move left/right from the preset.
- `offset_y`: move up/down from the preset.
- `scale`: resize the active watermark.

These controls replace separate `logo_x`, `logo_y`, `bar_x`, `bar_y`, `text_x`, and `text_y` fields to keep the node harder to break.

## Text Mode

Text mode ignores the `logo` input.

- `line_1`, `line_2`, `line_3`: text lines.
- `font_size`: base text size.
- `bar_height`: base white bar height. Set to `0` to hide the bar.
- `bar_opacity`: `0` is transparent, `255` is opaque.
- `text_color`: text color, for example `#000000`.
- `bar_color`: bar color, for example `#ffffff`.

In Text mode, `scale` changes both the text size and the bar height.

## Logo Mode

Logo mode ignores text and bar settings.

- Connect a logo/signature image to `logo`.
- If using a transparent PNG from ComfyUI `LoadImage`, also connect its `mask` output to `logo_mask`.
- Use `placement`, `offset_x`, `offset_y`, and `scale` to control position and size.

## Notes

This is a backend-only lightweight node. It does not include a mouse-drag transform UI, upload files, read EXIF, or remove metadata.
