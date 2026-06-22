# ComfyUI-FreeCameraWatermark

Lightweight ComfyUI node for adding either a camera-style text bar or a logo/signature watermark.

No pip install. No comfy-env.

## Install

Copy this folder into:

```text
ComfyUI/custom_nodes
```

Restart ComfyUI, then search:

```text
Free Camera Watermark
```

## Transform Box

The node includes a small transform box inside the node UI:

- Drag the box to move the active watermark.
- Drag the bottom-right corner to scale it.
- The hidden `position_x`, `position_y`, and `scale` values are saved in the workflow.

This is a lightweight node-local controller, not a full image editor on the main preview canvas.

## Mode

- `watermark_mode = Text`: use the text lines and white bar. Logo input is ignored.
- `watermark_mode = Logo`: use the connected logo/signature image. Text and bar settings are ignored.

## Text Mode

- `line_1`, `line_2`, `line_3`: text lines.
- `font_size`: base text size.
- `bar_height`: base white bar height. Set to `0` to hide the bar.
- `bar_opacity`: `0` is transparent, `255` is opaque.
- `text_color`: text color, for example `#000000`.
- `bar_color`: bar color, for example `#ffffff`.

In Text mode, the transform box `scale` changes both the text size and the bar height.

## Logo Mode

- Connect a logo/signature image to `logo`.
- If using a transparent PNG from ComfyUI `LoadImage`, also connect its `mask` output to `logo_mask`.
- Use the transform box to control position and size.

## Notes

This node composites pixels into the output image. It does not upload files, read EXIF, or remove metadata.
