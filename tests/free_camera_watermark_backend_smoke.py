import importlib.util
import pathlib

import torch
from PIL import Image


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
        font_style="\u9ed8\u8ba4",
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
        pattern_type=kwargs.get("pattern_type", "\u6e10\u53d8\u5149\u5f71"),
        pattern_color="#ffffff",
        pattern_opacity=32,
        pattern_density=kwargs.get("pattern_density", 18),
        pattern_seed=kwargs.get("pattern_seed", 123),
        pattern_scale_min=kwargs.get("pattern_scale_min", 4),
        pattern_scale_max=kwargs.get("pattern_scale_max", 12),
    )[0]


for mode in ["\u6587\u5b57", "Logo", "Logo+\u6587\u5b57", "\u76f8\u673a\u767d\u6761", "\u900f\u660e\u6c34\u5370", "\u56fe\u6848\u6c34\u5370"]:
    out = run(mode)
    assert tuple(out.shape) == (1, 96, 64, 3), mode

pattern = run("\u56fe\u6848\u6c34\u5370")
assert torch.count_nonzero(pattern).item() > 0, "pattern mode must alter pixels"

layout = fcw._resolve_layout('{"mode":"\u56fe\u6848\u6c34\u5370","x":7.7,"y":46.9,"w":78,"h":100}', "\u56fe\u6848\u6c34\u5370", 64, 96)
assert layout["x"] == 39.0, layout
assert layout["y"] == 50.0, layout

logo = Image.new("RGBA", (100, 100), (255, 255, 255, 255))
scaled = fcw._scaled_logo(logo, 80, 255, target_height=20)
assert scaled.size == (20, 20), scaled.size
