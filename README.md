# ComfyUI-FreeCameraWatermark

Lightweight ComfyUI node for camera-style watermarks, signatures, transparent logos, and simple decorative patterns.

No pip install. No comfy-env. No external runtime.

## Download

Use either method:

1. Download the ready-to-use package:

   ```text
   dist/ComfyUI-FreeCameraWatermark.zip
   ```

2. Or download this repository with GitHub `Code > Download ZIP`.

## Install

1. Close ComfyUI.
2. Unzip the package.
3. Put the whole folder here:

   ```text
   ComfyUI/custom_nodes/ComfyUI-FreeCameraWatermark
   ```

4. Start ComfyUI.
5. Search for:

   ```text
   Free Camera Watermark
   ```

## Basic Use

Connect your main image to `image`.

Choose `mode`:

- `Text`: draw 1-3 text lines.
- `Logo`: draw only the connected logo/signature image.
- `Logo + Text`: draw a logo and text together.
- `Camera Bar`: draw text on a camera-style bottom bar.
- `Transparent Watermark`: draw a low-opacity logo or text watermark.
- `Pattern Watermark`: draw a lightweight generated pattern.

For a logo or signature, connect `logo`. If the logo comes from ComfyUI `Load Image`, connect its `mask` output to `logo_mask` for transparency.

## Transform Box

The node has a small transform box inside the node UI:

- Drag the box to move the watermark.
- Drag the bottom-right corner to resize it.
- `Reset Layout` returns to automatic layout.
- `Center`, `Bottom`, and `Fit Width` are quick layout helpers.
- `Random Pattern` changes only the pattern seed.

The transform box saves its values in hidden `layout_json`, so workflows keep the position and size without showing extra numeric controls.

## Presets

- `Auto`: chooses a sensible layout from image shape and mode.
- `Bottom Camera Bar`: classic bottom white bar.
- `Minimal Bottom Caption`: smaller bottom caption.
- `Center Transparent Text`: centered transparent text.
- `Tiled Transparent Logo`: repeated transparent logo.
- `Bottom Right Logo`: small logo near the lower-right.
- `Logo Left + Text Right`: compact logo and text block.
- `Soft Pattern Overlay`: full-image light pattern.
- `Signature Center`: signature-like centered text.
- `Custom`: keeps the transform box layout.

## Fonts

Bundled lightweight fonts:

- `Signature`: Caveat, good for handwritten signatures.
- `Editorial`: Playfair Display, good for elegant camera-card text.
- `Tech`: Orbitron, good for digital/camera UI style.
- `System Default`: uses installed system fonts.
- `CJK System`: tries common Windows Chinese fonts.

Optional Chinese display fonts can be placed in `optional_fonts`:

- `LXGWWenKai-Regular.ttf` for `CJK Handwritten Optional`.
- `SmileySans-Oblique.ttf` for `CJK Display Optional`.

The node will fall back to system fonts if optional files are not present.

## Color And Opacity

Colors use hex strings such as:

```text
#ffffff
#000000
#88ccff
```

Opacity values use `0-255`:

- `0`: invisible.
- `32`: very light transparent watermark.
- `128`: half transparent.
- `255`: fully opaque.

## Patterns

`Pattern Watermark` is generated locally with PIL. It does not download images.

Pattern types:

- `Dots`
- `Diagonal Lines`
- `Soft Waves`
- `Tiny Stars`
- `Gradient Blocks`

`pattern_density` controls how many marks appear. `pattern_scale_min` and `pattern_scale_max` control the size range. `pattern_seed` makes the result repeatable.

## Notes

This node composites pixels into the output image. It does not remove metadata, upload files, or edit source images.
