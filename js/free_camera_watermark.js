import { app } from "/scripts/app.js";

const NODE_NAME = "FreeCameraWatermark";
const WIDGET_NAME = "watermark_transform";
const CONTROL_HEIGHT = 210;
const MIN_WIDTH = 4;
const MAX_WIDTH = 100;

const MODE_TO_CN = {
    Text: "文字",
    Logo: "Logo",
    "Logo + Text": "Logo+文字",
    "Camera Bar": "相机白条",
    "Transparent Watermark": "透明水印",
    "Pattern Watermark": "图案水印",
};

const PRESET_TO_CN = {
    Auto: "自动",
    "Bottom Camera Bar": "底部白条",
    "Minimal Bottom Caption": "底部小字",
    "Center Transparent Text": "居中文字",
    "Tiled Transparent Logo": "平铺Logo",
    "Bottom Right Logo": "右下Logo",
    "Logo Left + Text Right": "Logo左文字右",
    "Soft Pattern Overlay": "柔和图案",
    "Signature Center": "居中签名",
    Custom: "自定义",
};

const FONT_TO_CN = {
    "System Default": "默认",
    Signature: "手写",
    Editorial: "优雅",
    Tech: "科技",
    "CJK System": "中文系统",
    "CJK Handwritten Optional": "中文手写(可选)",
    "CJK Display Optional": "中文标题(可选)",
};

const PATTERN_TO_CN = {
    None: "无",
    Dots: "圆点",
    "Diagonal Lines": "斜线",
    "Soft Waves": "波纹",
    "Tiny Stars": "星光",
    "Gradient Blocks": "色块",
};

const MODE_TO_EN = Object.fromEntries(Object.entries(MODE_TO_CN).map(([key, value]) => [value, key]));
const CN_CHOICES = {
    mode: Object.values(MODE_TO_CN),
    preset: Object.values(PRESET_TO_CN),
    font_style: Object.values(FONT_TO_CN),
    pattern_type: Object.values(PATTERN_TO_CN),
};

const LABELS = {
    mode: "模式",
    preset: "位置预设",
    font_style: "字体",
    auto_adapt: "自动适配",
    safe_margin: "安全边距",
    line_1: "文字1",
    line_2: "文字2",
    line_3: "文字3",
    font_size: "字号",
    text_color: "文字颜色",
    text_opacity: "文字透明度",
    bar_color: "白条颜色",
    bar_opacity: "白条透明度",
    bar_height: "白条高度",
    logo_opacity: "Logo透明度",
    pattern_type: "图案",
    pattern_color: "图案颜色",
    pattern_opacity: "图案透明度",
    pattern_density: "图案密度",
    pattern_seed: "随机种子",
    pattern_scale_min: "最小尺寸",
    pattern_scale_max: "最大尺寸",
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function round(value, digits = 1) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function findWidget(node, name) {
    return node.widgets?.find((widget) => widget?.name === name);
}

function widgetValue(node, name, fallback) {
    const widget = findWidget(node, name);
    return widget?.value ?? fallback;
}

function setWidgetValue(node, name, value) {
    const widget = findWidget(node, name);
    if (!widget) {
        return;
    }

    widget.value = value;
    widget.callback?.(value, null, node);
    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
}

function readLayout(node) {
    const raw = widgetValue(node, "layout_json", "{}");
    try {
        const parsed = JSON.parse(raw || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return {
                x: Number.isFinite(Number(parsed.x)) ? Number(parsed.x) : 50,
                y: Number.isFinite(Number(parsed.y)) ? Number(parsed.y) : 88,
                w: Number.isFinite(Number(parsed.w)) ? Number(parsed.w) : 55,
                layout: typeof parsed.layout === "string" ? parsed.layout : defaultLayoutName(node),
            };
        }
    } catch {
        // Keep the node usable even if a user pasted invalid JSON.
    }
    return { x: 50, y: 88, w: 55, layout: defaultLayoutName(node) };
}

function writeLayout(node, next) {
    const layout = {
        x: round(clamp(next.x, 0, 100)),
        y: round(clamp(next.y, 0, 100)),
        w: round(clamp(next.w, MIN_WIDTH, MAX_WIDTH)),
        layout: next.layout || defaultLayoutName(node),
    };
    setWidgetValue(node, "layout_json", JSON.stringify(layout));
}

function mode(node) {
    const value = String(widgetValue(node, "mode", "相机白条"));
    return MODE_TO_EN[value] || value;
}

function defaultLayoutName(node) {
    if (mode(node) === "Logo") {
        return "Logo Only";
    }
    if (mode(node) === "Logo + Text") {
        return "Logo Left";
    }
    if (mode(node) === "Pattern Watermark") {
        return "Pattern Only";
    }
    return "Text Only Bar";
}

function hideLayoutJson(node) {
    const widget = findWidget(node, "layout_json");
    if (!widget) {
        return;
    }

    widget.hidden = true;
    widget.type = "hidden";
    widget.computeSize = () => [0, -4];
    widget.serialize = true;
}

function setWidgetHidden(widget, hidden) {
    if (!widget) {
        return;
    }

    if (!widget._fcwOriginalComputeSize) {
        widget._fcwOriginalComputeSize = widget.computeSize;
    }
    if (!widget._fcwOriginalType) {
        widget._fcwOriginalType = widget.type;
    }

    widget.hidden = hidden;
    widget.type = hidden ? "hidden" : widget._fcwOriginalType;
    if (hidden) {
        widget.computeSize = () => [0, -4];
    } else if (widget._fcwOriginalComputeSize) {
        widget.computeSize = widget._fcwOriginalComputeSize;
    }
}

function migrateWidgetValue(node, name, mapping) {
    const widget = findWidget(node, name);
    if (!widget || !Object.hasOwn(mapping, widget.value)) {
        return;
    }
    setWidgetValue(node, name, mapping[widget.value]);
}

function applyChineseLabels(node) {
    for (const widget of node.widgets || []) {
        if (LABELS[widget.name]) {
            widget.label = LABELS[widget.name];
        }
    }
}

function applyCompactVisibility(node) {
    const modeName = mode(node);
    const alwaysHidden = ["layout_json", "auto_adapt", "safe_margin", "pattern_scale_min", "pattern_scale_max"];
    const textWidgets = ["font_style", "line_1", "line_2", "line_3", "font_size", "text_color", "text_opacity"];
    const barWidgets = ["bar_color", "bar_opacity", "bar_height"];
    const logoWidgets = ["logo_opacity"];
    const patternWidgets = ["pattern_type", "pattern_color", "pattern_opacity", "pattern_density", "pattern_seed"];

    const visible = new Set(["mode", "preset"]);
    if (modeName === "Text") {
        textWidgets.forEach((name) => visible.add(name));
    } else if (modeName === "Camera Bar") {
        textWidgets.concat(barWidgets).forEach((name) => visible.add(name));
    } else if (modeName === "Logo") {
        logoWidgets.forEach((name) => visible.add(name));
    } else if (modeName === "Logo + Text") {
        textWidgets.concat(logoWidgets).forEach((name) => visible.add(name));
    } else if (modeName === "Transparent Watermark") {
        textWidgets.concat(logoWidgets).forEach((name) => visible.add(name));
    } else if (modeName === "Pattern Watermark") {
        patternWidgets.forEach((name) => visible.add(name));
    }

    for (const widget of node.widgets || []) {
        if (!widget?.name || widget.name === WIDGET_NAME || widget.type === "button") {
            continue;
        }
        setWidgetHidden(widget, alwaysHidden.includes(widget.name) || !visible.has(widget.name));
    }

    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
}

function localizeWidgetValues(node) {
    migrateWidgetValue(node, "mode", MODE_TO_CN);
    migrateWidgetValue(node, "preset", PRESET_TO_CN);
    migrateWidgetValue(node, "font_style", FONT_TO_CN);
    migrateWidgetValue(node, "pattern_type", PATTERN_TO_CN);
}

function localizeComboChoices(node) {
    for (const [name, values] of Object.entries(CN_CHOICES)) {
        const widget = findWidget(node, name);
        if (widget?.options?.values) {
            widget.options.values = values;
        }
    }
}

function installModeCallback(node) {
    const widget = findWidget(node, "mode");
    if (!widget || widget._fcwModeCallbackInstalled) {
        return;
    }

    const originalCallback = widget.callback;
    widget.callback = (value, canvas, targetNode, pos, event) => {
        const result = originalCallback?.(value, canvas, targetNode, pos, event);
        applyCompactVisibility(node);
        return result;
    };
    widget._fcwModeCallbackInstalled = true;
}

function drawRoundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function targetBox(modeName, area, layout) {
    const width = clamp((layout.w / 100) * area.w, 18, area.w);
    let height = width * 0.22;

    if (modeName === "Logo") {
        height = width * 0.42;
    } else if (modeName === "Logo + Text") {
        height = width * 0.26;
    } else if (modeName === "Transparent Watermark") {
        height = width * 0.24;
    } else if (modeName === "Pattern Watermark") {
        height = area.h * 0.84;
    }

    height = clamp(height, 16, area.h);
    const centerX = area.x + (layout.x / 100) * area.w;
    const centerY = area.y + (layout.y / 100) * area.h;
    return {
        x: clamp(centerX - width / 2, area.x, area.x + area.w - width),
        y: clamp(centerY - height / 2, area.y, area.y + area.h - height),
        w: width,
        h: height,
    };
}

function drawPatternPreview(ctx, box) {
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    for (let x = box.x + 10; x < box.x + box.w; x += 18) {
        ctx.beginPath();
        ctx.moveTo(x, box.y + box.h);
        ctx.lineTo(x + box.h, box.y);
        ctx.stroke();
    }
}

function drawModePreview(ctx, node, box) {
    const modeName = mode(node);
    ctx.save();
    ctx.globalAlpha = modeName === "Transparent Watermark" ? 0.48 : 1;

    if (modeName === "Pattern Watermark") {
        ctx.fillStyle = "rgba(96, 165, 250, 0.14)";
        drawRoundRect(ctx, box.x, box.y, box.w, box.h, 6);
        ctx.fill();
        drawPatternPreview(ctx, box);
    } else if (modeName === "Logo") {
        ctx.fillStyle = "rgba(96, 165, 250, 0.28)";
        drawRoundRect(ctx, box.x, box.y, box.w, box.h, 6);
        ctx.fill();
        ctx.fillStyle = "#dbeafe";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("LOGO", box.x + box.w / 2, box.y + box.h / 2 + 4);
    } else if (modeName === "Logo + Text") {
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        drawRoundRect(ctx, box.x, box.y, box.w, box.h, 6);
        ctx.fill();
        ctx.fillStyle = "rgba(96, 165, 250, 0.35)";
        drawRoundRect(ctx, box.x + 8, box.y + 7, box.w * 0.22, box.h - 14, 4);
        ctx.fill();
        ctx.fillStyle = "#1f2937";
        ctx.fillRect(box.x + box.w * 0.34, box.y + box.h * 0.34, box.w * 0.52, 2);
        ctx.fillRect(box.x + box.w * 0.34, box.y + box.h * 0.55, box.w * 0.42, 2);
    } else {
        ctx.fillStyle = "rgba(255,255,255,0.94)";
        drawRoundRect(ctx, box.x, box.y, box.w, box.h, 6);
        ctx.fill();
        ctx.fillStyle = "#111827";
        ctx.fillRect(box.x + box.w * 0.16, box.y + box.h * 0.34, box.w * 0.68, 2);
        ctx.fillRect(box.x + box.w * 0.28, box.y + box.h * 0.56, box.w * 0.44, 2);
    }

    ctx.restore();
}

class WatermarkTransformWidget {
    constructor() {
        this.name = WIDGET_NAME;
        this.type = "custom";
        this.value = "";
        this._area = null;
        this._box = null;
        this._drag = null;
    }

    computeSize(width) {
        return [width, CONTROL_HEIGHT];
    }

    draw(ctx, node, widgetWidth, widgetY) {
        const margin = 12;
        const headerY = widgetY + 14;
        const area = {
            x: margin,
            y: widgetY + 30,
            w: Math.max(120, widgetWidth - margin * 2),
            h: 142,
        };
        const layout = readLayout(node);
        const box = targetBox(mode(node), area, layout);
        this._area = area;
        this._box = box;

        ctx.save();
        ctx.font = "12px sans-serif";
        ctx.textAlign = "left";
        ctx.fillStyle = "#d1d5db";
        ctx.fillText("拖动移动，右下角缩放", margin, headerY);

        ctx.fillStyle = "#1f242c";
        drawRoundRect(ctx, area.x, area.y, area.w, area.h, 7);
        ctx.fill();
        ctx.strokeStyle = "#4b5563";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        for (let i = 1; i < 4; i += 1) {
            const x = area.x + (area.w * i) / 4;
            ctx.beginPath();
            ctx.moveTo(x, area.y);
            ctx.lineTo(x, area.y + area.h);
            ctx.stroke();
        }
        for (let i = 1; i < 3; i += 1) {
            const y = area.y + (area.h * i) / 3;
            ctx.beginPath();
            ctx.moveTo(area.x, y);
            ctx.lineTo(area.x + area.w, y);
            ctx.stroke();
        }

        drawModePreview(ctx, node, box);

        ctx.strokeStyle = "#60a5fa";
        ctx.lineWidth = 2;
        drawRoundRect(ctx, box.x, box.y, box.w, box.h, 6);
        ctx.stroke();

        const handleSize = 12;
        ctx.fillStyle = "#60a5fa";
        ctx.fillRect(box.x + box.w - handleSize, box.y + box.h - handleSize, handleSize, handleSize);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.strokeRect(box.x + box.w - handleSize, box.y + box.h - handleSize, handleSize, handleSize);

        ctx.fillStyle = "#9ca3af";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(`位置 ${round(layout.x)}, ${round(layout.y)}  宽 ${round(layout.w)}%`, area.x + area.w, area.y + area.h + 15);
        ctx.restore();
    }

    mouse(event, pos, node) {
        if (!this._area || !this._box) {
            return false;
        }

        const x = pos[0];
        const y = pos[1];
        const area = this._area;
        const box = this._box;
        const handleSize = 16;
        const inBox = x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
        const inHandle = x >= box.x + box.w - handleSize && x <= box.x + box.w + 4
            && y >= box.y + box.h - handleSize && y <= box.y + box.h + 4;

        if (event.type === "pointerdown") {
            if (!inBox) {
                return false;
            }

            this._drag = {
                mode: inHandle ? "scale" : "move",
                startX: x,
                startY: y,
                startW: readLayout(node).w,
                layout: readLayout(node),
                centerX: box.x + box.w / 2,
                centerY: box.y + box.h / 2,
            };
            return true;
        }

        if (event.type === "pointermove" && this._drag) {
            const current = { ...this._drag.layout };
            if (this._drag.mode === "move") {
                current.x = ((x - area.x) / area.w) * 100;
                current.y = ((y - area.y) / area.h) * 100;
            } else {
                const widthFromCenter = Math.abs(x - this._drag.centerX) * 2;
                current.w = (widthFromCenter / area.w) * 100;
            }
            writeLayout(node, current);
            return true;
        }

        if ((event.type === "pointerup" || event.type === "pointerleave") && this._drag) {
            this._drag = null;
            return true;
        }

        return false;
    }
}

function addButton(node, name, callback) {
    if (node.widgets?.some((widget) => widget?.name === name)) {
        return;
    }
    node.addWidget("button", name, null, () => callback(node));
}

function addTransformWidget(node) {
    if (node.widgets?.some((widget) => widget?.name === WIDGET_NAME)) {
        return;
    }

    hideLayoutJson(node);
    localizeWidgetValues(node);
    localizeComboChoices(node);
    applyChineseLabels(node);
    installModeCallback(node);
    applyCompactVisibility(node);
    node.addCustomWidget(new WatermarkTransformWidget());
    addButton(node, "重置位置", (target) => setWidgetValue(target, "layout_json", "{}"));
    addButton(node, "居中", (target) => writeLayout(target, { ...readLayout(target), x: 50, y: 50 }));
    addButton(node, "底部", (target) => writeLayout(target, { ...readLayout(target), x: 50, y: 88 }));
    addButton(node, "适配宽度", (target) => writeLayout(target, { ...readLayout(target), w: 78 }));
    addButton(node, "随机图案", (target) => setWidgetValue(target, "pattern_seed", Math.floor(Math.random() * 2147483647)));
    node.serialize_widgets = true;

    const width = Math.max(node.size?.[0] || 330, 380);
    const height = Math.max(node.size?.[1] || 360, 520);
    node.setSize?.([width, height]);
}

app.registerExtension({
    name: "cp199712138.FreeCameraWatermark",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            addTransformWidget(this);
            return result;
        };
    },
});
