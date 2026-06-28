import importlib.util
import pathlib

import torch


ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("fcw", ROOT / "__init__.py")
fcw = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fcw)


def run(mode, **kwargs):
    node = fcw.FreeCameraWatermark()
    image = torch.zeros((1, 96, 64, 3), dtype=torch.float32)
    layout = '{"mode":"%s","x":50,"y":50,"w":80,"h":20,"layout":"Text Only","aspect":0.6667}' % mode
    return node.apply_watermark(
        image=image,
        mode=mode,
        preset="自定义",
        font_style="默认",
        layout_json=layout,
        auto_adapt=True,
        safe_margin=0.0,
        line_1="Test",
        line_2="Camera",
        line_3="24mm",
        font_size=14,
        text_color="#ffffff",
        text_opacity=100,
        bar_color="#ffffff",
        bar_opacity=100,
        bar_height=90,
        logo_opacity=100,
        pattern_type=kwargs.get("pattern_type", "渐变光影"),
        pattern_color="#ffffff",
        pattern_opacity=32,
        pattern_density=kwargs.get("pattern_density", 18),
        pattern_seed=kwargs.get("pattern_seed", 123),
        pattern_scale_min=kwargs.get("pattern_scale_min", 4),
        pattern_scale_max=kwargs.get("pattern_scale_max", 12),
    )[0]


for mode in ["文字", "Logo", "Logo+文字", "相机白条", "透明水印", "图案水印"]:
    out = run(mode)
    assert tuple(out.shape) == (1, 96, 64, 3), mode

pattern = run("图案水印")
assert torch.count_nonzero(pattern).item() > 0, "pattern mode must alter pixels"

layout = fcw._resolve_layout('{"mode":"图案水印","x":7.7,"y":46.9,"w":78,"h":100}', "图案水印", 64, 96)
assert layout["x"] == 39.0, layout
assert layout["y"] == 50.0, layout
