import { app } from "/scripts/app.js";

const NODE_NAME = "FreeCameraWatermark";
const TRANSFORM_WIDGET = "watermark_transform";
const PALETTE_WIDGET = "watermark_palette";
const MIN_BOX = 4;
const CONTROL_HEIGHT = 390;
const PALETTE_HEIGHT = 54;

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
    "Sci-Fi Grid": "科幻光栅",
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
    layout_json: "拖拽位置",
    auto_adapt: "自动适配",
    safe_margin: "安全边距",
    line_1: "文字1",
    line_2: "文字2",
    line_3: "文字3",
    font_size: "字号",
    text_color: "主颜色",
    text_opacity: "透明度",
    bar_color: "旧版白条颜色",
    bar_opacity: "旧版白条透明度",
    bar_height: "旧版白条高度",
    logo_opacity: "旧版Logo透明度",
    pattern_type: "图案",
    pattern_color: "旧版图案颜色",
    pattern_opacity: "旧版图案透明度",
    pattern_density: "图案密度",
    pattern_seed: "随机种子",
    pattern_scale_min: "最小尺寸",
    pattern_scale_max: "最大尺寸",
};

const COLOR_SWATCHES = [
    ["白", "#ffffff"],
    ["黑", "#000000"],
    ["灰", "#888888"],
    ["金", "#d9a441"],
    ["红", "#e53935"],
    ["蓝", "#3b82f6"],
];

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

function mode(node) {
    const value = String(widgetValue(node, "mode", "相机白条"));
    return MODE_TO_EN[value] || value;
}

const PATTERN_TO_EN = Object.fromEntries(Object.entries(PATTERN_TO_CN).map(([key, value]) => [value, key]));

function patternType(node) {
    const value = String(widgetValue(node, "pattern_type", "科幻光栅"));
    return PATTERN_TO_EN[value] || value;
}

function defaultLayoutName(modeName) {
    if (modeName === "Logo") {
        return "Logo Only";
    }
    if (modeName === "Logo + Text") {
        return "Logo Left";
    }
    if (modeName === "Pattern Watermark") {
        return "Pattern Only";
    }
    return "Text Only Bar";
}

function defaultLayoutForMode(modeName, aspect = 9 / 16) {
    if (modeName === "Logo") {
        return { x: 50, y: 50, w: 42, h: aspect < 0.8 ? 16 : 24, layout: "Logo Only", aspect };
    }
    if (modeName === "Logo + Text") {
        return { x: 50, y: 86, w: 72, h: aspect < 0.8 ? 10 : 14, layout: "Logo Left", aspect };
    }
    if (modeName === "Transparent Watermark") {
        return { x: 50, y: 50, w: 72, h: 16, layout: "Text Only", aspect };
    }
    if (modeName === "Pattern Watermark") {
        return { x: 50, y: 50, w: 100, h: 100, layout: "Pattern Only", aspect };
    }
    if (modeName === "Text") {
        return { x: 50, y: 88, w: 74, h: 10, layout: "Text Only", aspect };
    }
    return { x: 50, y: 91, w: 86, h: 12, layout: "Text Only Bar", aspect };
}

function readLayout(node) {
    const modeName = mode(node);
    const fallback = defaultLayoutForMode(modeName, canvasAspect(node));
    const raw = widgetValue(node, "layout_json", "{}");
    try {
        const parsed = JSON.parse(raw || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            if (parsed.mode && parsed.mode !== modeName) {
                return fallback;
            }
            return {
                x: Number.isFinite(Number(parsed.x)) ? Number(parsed.x) : fallback.x,
                y: Number.isFinite(Number(parsed.y)) ? Number(parsed.y) : fallback.y,
                w: Number.isFinite(Number(parsed.w)) ? Number(parsed.w) : fallback.w,
                h: Number.isFinite(Number(parsed.h)) ? Number(parsed.h) : fallback.h,
                layout: typeof parsed.layout === "string" ? parsed.layout : fallback.layout,
                aspect: Number.isFinite(Number(parsed.aspect)) ? Number(parsed.aspect) : fallback.aspect,
                mode: modeName,
            };
        }
    } catch {
        // Invalid hand-edited JSON should not break the node UI.
    }
    return fallback;
}

function writeLayout(node, next) {
    const aspect = canvasAspect(node);
    const modeName = mode(node);
    const layout = {
        x: round(clamp(Number(next.x), 0, 100)),
        y: round(clamp(Number(next.y), 0, 100)),
        w: round(clamp(Number(next.w), MIN_BOX, 100)),
        h: round(clamp(Number(next.h), MIN_BOX, 100)),
        layout: next.layout || defaultLayoutName(modeName),
        mode: modeName,
        aspect,
    };
    setWidgetValue(node, "layout_json", JSON.stringify(layout));
}

function resetLayoutForMode(node) {
    writeLayout(node, defaultLayoutForMode(mode(node), canvasAspect(node)));
}

function layoutMode(node) {
    try {
        const parsed = JSON.parse(widgetValue(node, "layout_json", "{}") || "{}");
        return typeof parsed.mode === "string" ? parsed.mode : null;
    } catch {
        return null;
    }
}

function ensureModeLayout(node) {
    const modeName = mode(node);
    if (node._fcwLastMode !== modeName || layoutMode(node) !== modeName) {
        node._fcwLastMode = modeName;
        writeLayout(node, defaultLayoutForMode(modeName, canvasAspect(node)));
        applyCompactVisibility(node);
        return true;
    }
    return false;
}

function hexColor(value, fallback = "#ffffff") {
    const raw = String(value || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
        return raw.toLowerCase();
    }
    if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
        return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
    }
    return fallback;
}

function opacityPercent(node) {
    const value = Number(widgetValue(node, "text_opacity", 100));
    return value > 100 ? Math.round((value / 255) * 100) : clamp(value, 0, 100);
}

function canvasAspect(node) {
    refreshAspectFromImgs(node);
    return node._fcwAspect || readAspectFromLayout(node) || 9 / 16;
}

function readAspectFromLayout(node) {
    try {
        const parsed = JSON.parse(widgetValue(node, "layout_json", "{}") || "{}");
        const aspect = Number(parsed.aspect);
        return Number.isFinite(aspect) && aspect > 0 ? aspect : null;
    } catch {
        return null;
    }
}

function refreshAspectFromImgs(node) {
    const img = node?.imgs?.[0];
    const width = img?.naturalWidth || img?.width;
    const height = img?.naturalHeight || img?.height;
    if (width > 0 && height > 0) {
        node._fcwAspect = width / height;
    }
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
    widget.computeSize = hidden ? () => [0, -4] : widget._fcwOriginalComputeSize;
    widget.serialize = true;
}

function migrateWidgetValue(node, name, mapping) {
    const widget = findWidget(node, name);
    if (widget && Object.hasOwn(mapping, widget.value)) {
        setWidgetValue(node, name, mapping[widget.value]);
    }
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

function applyChineseLabels(node) {
    for (const widget of node.widgets || []) {
        if (LABELS[widget.name]) {
            widget.label = LABELS[widget.name];
        }
    }
}

function applyCompactVisibility(node) {
    const modeName = mode(node);
    const textModes = new Set(["Text", "Logo + Text", "Camera Bar", "Transparent Watermark"]);
    const visible = new Set(["mode", "text_opacity"]);

    if (modeName !== "Logo") {
        visible.add("text_color");
    }
    if (textModes.has(modeName)) {
        ["font_style", "line_1", "line_2", "line_3", "font_size"].forEach((name) => visible.add(name));
    }
    if (modeName === "Pattern Watermark") {
        ["pattern_type", "pattern_density", "pattern_seed", "pattern_scale_min", "pattern_scale_max"].forEach((name) => visible.add(name));
    }

    const alwaysHidden = new Set([
        "preset",
        "layout_json",
        "auto_adapt",
        "safe_margin",
        "bar_color",
        "bar_opacity",
        "bar_height",
        "logo_opacity",
        "pattern_color",
        "pattern_opacity",
    ]);

    for (const widget of node.widgets || []) {
        if (!widget?.name || widget.name === TRANSFORM_WIDGET || widget.name === PALETTE_WIDGET || widget.type === "button") {
            continue;
        }
        setWidgetHidden(widget, alwaysHidden.has(widget.name) || !visible.has(widget.name));
    }
    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
}

function installModeCallback(node) {
    const widget = findWidget(node, "mode");
    if (!widget || widget._fcwModeCallbackInstalled) {
        return;
    }
    const originalCallback = widget.callback;
    widget.callback = (value, canvas, targetNode, pos, event) => {
        const result = originalCallback?.(value, canvas, targetNode, pos, event);
        node._fcwLastMode = null;
        resetLayoutForMode(node);
        applyCompactVisibility(node);
        return result;
    };
    widget._fcwModeCallbackInstalled = true;
}

function transformArea(widgetWidth, widgetY, aspect) {
    const margin = 12;
    const header = 24;
    const maxW = Math.max(120, widgetWidth - margin * 2);
    const maxH = 300;
    let width = maxW;
    let height = width / aspect;
    if (height > maxH) {
        height = maxH;
        width = height * aspect;
    }
    return {
        x: margin + (maxW - width) / 2,
        y: widgetY + header + 8,
        w: width,
        h: height,
        maxX: margin,
        maxW,
    };
}

function isDownEvent(event) {
    return event.type === "pointerdown" || event.type === "mousedown";
}

function isMoveEvent(event) {
    return event.type === "pointermove" || event.type === "mousemove";
}

function isUpEvent(event) {
    return event.type === "pointerup" || event.type === "mouseup" || event.type === "pointerleave" || event.type === "mouseleave";
}

function targetBox(area, layout) {
    const width = clamp((layout.w / 100) * area.w, 18, area.w);
    const height = clamp((layout.h / 100) * area.h, 16, area.h);
    const centerX = area.x + (layout.x / 100) * area.w;
    const centerY = area.y + (layout.y / 100) * area.h;
    return {
        x: clamp(centerX - width / 2, area.x, area.x + area.w - width),
        y: clamp(centerY - height / 2, area.y, area.y + area.h - height),
        w: width,
        h: height,
    };
}

function imageSize(node, area) {
    const img = node?.imgs?.[0];
    const width = img?.naturalWidth || img?.width || Math.round(area.w);
    const height = img?.naturalHeight || img?.height || Math.round(area.h);
    return { width, height };
}

function drawReferenceCanvas(ctx, node, area) {
    const img = node?.imgs?.[0];
    ctx.save();
    drawRoundRect(ctx, area.x, area.y, area.w, area.h, 7);
    ctx.clip();
    if (img) {
        ctx.fillStyle = "#111827";
        ctx.fillRect(area.x, area.y, area.w, area.h);
        ctx.drawImage(img, area.x, area.y, area.w, area.h);
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.fillRect(area.x, area.y, area.w, area.h);
    } else {
        ctx.fillStyle = "#1f242c";
        ctx.fillRect(area.x, area.y, area.w, area.h);
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
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
    }
    ctx.restore();

    ctx.strokeStyle = "#4b5563";
    ctx.lineWidth = 1;
    drawRoundRect(ctx, area.x, area.y, area.w, area.h, 7);
    ctx.stroke();
}

function drawSciFiPatternPreview(ctx, box, color, alpha) {
    ctx.save();
    ctx.strokeStyle = `${color}${alpha}`;
    ctx.fillStyle = `${color}18`;
    ctx.lineWidth = 1;
    const gap = Math.max(12, Math.min(box.w, box.h) / 5);
    for (let x = box.x; x <= box.x + box.w; x += gap) {
        ctx.beginPath();
        ctx.moveTo(x, box.y);
        ctx.lineTo(x, box.y + box.h);
        ctx.stroke();
    }
    for (let y = box.y; y <= box.y + box.h; y += gap) {
        ctx.beginPath();
        ctx.moveTo(box.x, y);
        ctx.lineTo(box.x + box.w, y);
        ctx.stroke();
    }
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(box.x + box.w * 0.08, box.y + box.h * 0.22);
    ctx.lineTo(box.x + box.w * 0.42, box.y + box.h * 0.22);
    ctx.lineTo(box.x + box.w * 0.52, box.y + box.h * 0.34);
    ctx.lineTo(box.x + box.w * 0.9, box.y + box.h * 0.34);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(box.x + box.w * 0.12, box.y + box.h * 0.74);
    ctx.lineTo(box.x + box.w * 0.36, box.y + box.h * 0.74);
    ctx.lineTo(box.x + box.w * 0.46, box.y + box.h * 0.62);
    ctx.lineTo(box.x + box.w * 0.82, box.y + box.h * 0.62);
    ctx.stroke();
    ctx.fillRect(box.x + box.w * 0.16, box.y + box.h * 0.42, box.w * 0.12, 2);
    ctx.fillRect(box.x + box.w * 0.66, box.y + box.h * 0.48, box.w * 0.18, 2);
    ctx.restore();
}

function drawPatternPreview(ctx, node, box, color, alpha) {
    if (patternType(node) === "Sci-Fi Grid") {
        drawSciFiPatternPreview(ctx, box, color, alpha);
        return;
    }
    ctx.strokeStyle = `${color}${alpha}`;
    ctx.lineWidth = 1;
    for (let x = box.x - box.h; x < box.x + box.w + box.h; x += 18) {
        ctx.beginPath();
        ctx.moveTo(x, box.y + box.h);
        ctx.lineTo(x + box.h, box.y);
        ctx.stroke();
    }
}

function drawModePreview(ctx, node, box) {
    const modeName = mode(node);
    const color = hexColor(widgetValue(node, "text_color", "#ffffff"));
    const alpha = clamp(opacityPercent(node) / 100, 0.08, 1);

    ctx.save();
    ctx.globalAlpha = alpha;
    if (modeName === "Pattern Watermark") {
        ctx.fillStyle = `${color}24`;
        drawRoundRect(ctx, box.x, box.y, box.w, box.h, 6);
        ctx.fill();
        drawPatternPreview(ctx, node, box, color, "66");
    } else if (modeName === "Logo") {
        ctx.fillStyle = "rgba(96,165,250,0.28)";
        drawRoundRect(ctx, box.x, box.y, box.w, box.h, 6);
        ctx.fill();
        ctx.fillStyle = "#dbeafe";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("LOGO 原色", box.x + box.w / 2, box.y + box.h / 2 + 4);
    } else if (modeName === "Logo + Text") {
        ctx.fillStyle = "rgba(96,165,250,0.28)";
        drawRoundRect(ctx, box.x + 8, box.y + 8, box.w * 0.22, box.h - 16, 4);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.fillRect(box.x + box.w * 0.34, box.y + box.h * 0.34, box.w * 0.52, 2);
        ctx.fillRect(box.x + box.w * 0.34, box.y + box.h * 0.55, box.w * 0.42, 2);
    } else {
        ctx.fillStyle = modeName === "Camera Bar" ? color : `${color}33`;
        drawRoundRect(ctx, box.x, box.y, box.w, box.h, 6);
        ctx.fill();
        ctx.fillStyle = modeName === "Camera Bar" ? "#111827" : color;
        ctx.fillRect(box.x + box.w * 0.16, box.y + box.h * 0.34, box.w * 0.68, 2);
        ctx.fillRect(box.x + box.w * 0.28, box.y + box.h * 0.56, box.w * 0.44, 2);
    }
    ctx.restore();
}

class ColorPaletteWidget {
    constructor() {
        this.name = PALETTE_WIDGET;
        this.type = "custom";
        this.value = "";
        this._swatches = [];
    }

    computeSize(width) {
        return [width, PALETTE_HEIGHT];
    }

    draw(ctx, node, widgetWidth, widgetY) {
        const modeName = mode(node);
        const current = hexColor(widgetValue(node, "text_color", "#ffffff"));
        const muted = modeName === "Logo";
        this._swatches = [];

        ctx.save();
        ctx.font = "12px sans-serif";
        ctx.fillStyle = muted ? "#8b949e" : "#d1d5db";
        ctx.fillText(muted ? "Logo 保留原色，颜色不改变 Logo" : "常用色", 12, widgetY + 14);

        let x = 12;
        for (const [label, color] of COLOR_SWATCHES) {
            const box = { x, y: widgetY + 24, w: 32, h: 22, color };
            this._swatches.push(box);
            ctx.globalAlpha = muted ? 0.35 : 1;
            ctx.fillStyle = color;
            ctx.fillRect(box.x, box.y, box.w, box.h);
            ctx.strokeStyle = current === color ? "#60a5fa" : "#4b5563";
            ctx.lineWidth = current === color ? 2 : 1;
            ctx.strokeRect(box.x, box.y, box.w, box.h);
            ctx.fillStyle = color === "#000000" ? "#ffffff" : "#111827";
            ctx.font = "10px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(label, box.x + box.w / 2, box.y + 15);
            x += 38;
        }
        ctx.restore();
    }

    mouse(event, pos, node) {
        if (mode(node) === "Logo") {
            return false;
        }
        if (!isDownEvent(event)) {
            return false;
        }
        const hit = this._swatches.find((box) => pos[0] >= box.x && pos[0] <= box.x + box.w && pos[1] >= box.y && pos[1] <= box.y + box.h);
        if (!hit) {
            return false;
        }
        setWidgetValue(node, "text_color", hit.color);
        return true;
    }
}

class WatermarkTransformWidget {
    constructor() {
        this.name = TRANSFORM_WIDGET;
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
        ensureModeLayout(node);
        const aspect = canvasAspect(node);
        const area = transformArea(widgetWidth, widgetY, aspect);
        const layout = readLayout(node);
        const box = targetBox(area, layout);
        this._area = area;
        this._box = box;

        ctx.save();
        ctx.font = "12px sans-serif";
        ctx.textAlign = "left";
        ctx.fillStyle = "#d1d5db";
        ctx.fillText("拖动移动，拉右下角缩放", 12, widgetY + 16);

        drawReferenceCanvas(ctx, node, area);

        drawModePreview(ctx, node, box);

        ctx.strokeStyle = "#60a5fa";
        ctx.lineWidth = 2;
        drawRoundRect(ctx, box.x, box.y, box.w, box.h, 6);
        ctx.stroke();

        const handle = 22;
        ctx.fillStyle = "#60a5fa";
        ctx.fillRect(box.x + box.w - handle, box.y + box.h - handle, handle, handle);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.strokeRect(box.x + box.w - handle, box.y + box.h - handle, handle, handle);

        const pixels = imageSize(node, area);
        const approxW = Math.round((layout.w / 100) * pixels.width);
        const approxH = Math.round((layout.h / 100) * pixels.height);
        ctx.fillStyle = "#9ca3af";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(`x ${round(layout.x)}%  y ${round(layout.y)}%  宽 ${round(layout.w)}%  高 ${round(layout.h)}%  约 ${approxW}×${approxH}px`, area.maxX + area.maxW, area.y + area.h + 16);
        ctx.restore();
    }

    mouse(event, pos, node) {
        if (!this._area || !this._box) {
            return false;
        }
        const [x, y] = pos;
        const area = this._area;
        const box = this._box;
        const hitPad = Math.max(32, Math.min(56, Math.max(box.w, box.h) * 0.7));
        const handle = 42;
        const inArea = x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h;
        const inBox = x >= box.x - hitPad && x <= box.x + box.w + hitPad && y >= box.y - hitPad && y <= box.y + box.h + hitPad;
        const inHandle = x >= box.x + box.w - handle && x <= box.x + box.w + hitPad && y >= box.y + box.h - handle && y <= box.y + box.h + hitPad;

        if (isDownEvent(event)) {
            if (!inArea && !inBox) {
                return false;
            }
            const start = readLayout(node);
            const pointerX = ((clamp(x, area.x, area.x + area.w) - area.x) / area.w) * 100;
            const pointerY = ((clamp(y, area.y, area.y + area.h) - area.y) / area.h) * 100;
            let startLayout = start;
            if (!inBox) {
                startLayout = { ...start, x: pointerX, y: pointerY };
                writeLayout(node, startLayout);
            }
            this._drag = {
                mode: inHandle ? "scale" : "move",
                start: startLayout,
                offsetX: inBox ? pointerX - start.x : 0,
                offsetY: inBox ? pointerY - start.y : 0,
                left: ((box.x - area.x) / area.w) * 100,
                top: ((box.y - area.y) / area.h) * 100,
            };
            return true;
        }

        if (isMoveEvent(event) && this._drag) {
            const next = { ...this._drag.start };
            if (this._drag.mode === "move") {
                next.x = ((clamp(x, area.x, area.x + area.w) - area.x) / area.w) * 100 - this._drag.offsetX;
                next.y = ((clamp(y, area.y, area.y + area.h) - area.y) / area.h) * 100 - this._drag.offsetY;
            } else {
                const right = ((clamp(x, area.x, area.x + area.w) - area.x) / area.w) * 100;
                const bottom = ((clamp(y, area.y, area.y + area.h) - area.y) / area.h) * 100;
                next.w = Math.max(MIN_BOX, right - this._drag.left);
                next.h = Math.max(MIN_BOX, bottom - this._drag.top);
                next.x = this._drag.left + next.w / 2;
                next.y = this._drag.top + next.h / 2;
            }
            writeLayout(node, next);
            return true;
        }

        if (isUpEvent(event) && this._drag) {
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

function randomizePattern(node) {
    const current = String(widgetValue(node, "pattern_type", "科幻光栅"));
    if (current === "无" || current === "None") {
        setWidgetValue(node, "pattern_type", "科幻光栅");
    }
    setWidgetValue(node, "pattern_seed", Math.floor(Math.random() * 2147483647));
}

function fitWidth(node) {
    const layout = readLayout(node);
    const modeName = mode(node);
    writeLayout(node, {
        ...layout,
        w: modeName === "Pattern Watermark" ? 100 : 86,
        h: modeName === "Pattern Watermark" ? 100 : layout.h,
    });
}

function addCustomWidgets(node) {
    if (node.widgets?.some((widget) => widget?.name === TRANSFORM_WIDGET)) {
        return;
    }
    localizeWidgetValues(node);
    localizeComboChoices(node);
    applyChineseLabels(node);
    installModeCallback(node);

    node.addCustomWidget(new ColorPaletteWidget());
    node.addCustomWidget(new WatermarkTransformWidget());
    addButton(node, "重置位置", resetLayoutForMode);
    addButton(node, "居中", (target) => writeLayout(target, { ...readLayout(target), x: 50, y: 50 }));
    addButton(node, "底部", (target) => writeLayout(target, { ...readLayout(target), x: 50, y: 90 }));
    addButton(node, "适配宽度", fitWidth);
    addButton(node, "随机图案", randomizePattern);
    applyCompactVisibility(node);

    node.serialize_widgets = true;
    const width = Math.max(node.size?.[0] || 330, 380);
    const height = Math.max(node.size?.[1] || 360, 600);
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
            addCustomWidgets(this);
            return result;
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            const result = onExecuted?.apply(this, arguments);
            setTimeout(() => {
                refreshAspectFromImgs(this);
                this.setDirtyCanvas?.(true, true);
                this.graph?.setDirtyCanvas?.(true, true);
            }, 60);
            return result;
        };
    },
});
