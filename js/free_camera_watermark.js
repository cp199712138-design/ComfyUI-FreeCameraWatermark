import { app } from "/scripts/app.js";

const NODE_NAME = "FreeCameraWatermark";
const DOM_WIDGET = "fcw_dom_panel";
const MIN_BOX = 4;

const MODES = ["文字", "Logo", "Logo+文字", "相机白条", "透明水印", "图案水印"];
const MODE_TO_EN = {
    "文字": "Text",
    "Logo": "Logo",
    "Logo+文字": "Logo + Text",
    "相机白条": "Camera Bar",
    "透明水印": "Transparent Watermark",
    "图案水印": "Pattern Watermark",
};
const EN_TO_MODE = Object.fromEntries(Object.entries(MODE_TO_EN).map(([key, value]) => [value, key]));

const FONT_STYLES = ["默认", "手写", "优雅", "科技", "中文系统", "中文手写(可选)", "中文标题(可选)"];
const PATTERNS = ["渐变光影", "科幻光栅", "圆点", "斜线", "波纹", "星光", "色块", "无"];

const CONTROLLED_WIDGETS = new Set([
    "mode",
    "preset",
    "font_style",
    "layout_json",
    "auto_adapt",
    "safe_margin",
    "line_1",
    "line_2",
    "line_3",
    "font_size",
    "text_color",
    "text_opacity",
    "bar_color",
    "bar_opacity",
    "bar_height",
    "logo_opacity",
    "pattern_type",
    "pattern_color",
    "pattern_opacity",
    "pattern_density",
    "pattern_seed",
    "pattern_scale_min",
    "pattern_scale_max",
]);

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

function dirtyNode(node) {
    node?.setDirtyCanvas?.(true, true);
    node?.graph?.setDirtyCanvas?.(true, true);
    app?.canvas?.setDirty?.(true, true);
}

function getWidgetValue(node, name, fallback) {
    const widget = findWidget(node, name);
    return widget?.value ?? fallback;
}

function setWidgetValue(node, name, value, callCallback = true) {
    const widget = findWidget(node, name);
    if (!widget) {
        return;
    }
    widget.value = value;
    if (callCallback) {
        widget.callback?.(value, null, node);
    }
}

function canonicalMode(value) {
    const raw = String(value || "相机白条");
    return EN_TO_MODE[raw] || raw;
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

function imageAspect(node) {
    const img = node?.imgs?.[0];
    const width = img?.naturalWidth || img?.width;
    const height = img?.naturalHeight || img?.height;
    if (width && height) {
        return width / height;
    }
    const layout = readRawLayout(node);
    if (layout.aspect && Number.isFinite(Number(layout.aspect))) {
        return Number(layout.aspect);
    }
    return 9 / 16;
}

function defaultLayout(mode, aspect = 9 / 16) {
    const layoutName = mode === "Logo" ? "Logo Only" : mode === "Logo+文字" ? "Logo Left" : mode === "图案水印" ? "Pattern Only" : "Text Only";
    if (mode === "Logo") {
        return { mode, x: 50, y: 50, w: 42, h: aspect < 0.8 ? 16 : 24, layout: layoutName, aspect };
    }
    if (mode === "Logo+文字") {
        return { mode, x: 50, y: 86, w: 72, h: aspect < 0.8 ? 10 : 14, layout: layoutName, aspect };
    }
    if (mode === "透明水印") {
        return { mode, x: 50, y: 50, w: 72, h: 16, layout: layoutName, aspect };
    }
    if (mode === "图案水印") {
        return { mode, x: 50, y: 50, w: 100, h: 100, layout: layoutName, aspect };
    }
    if (mode === "文字") {
        return { mode, x: 50, y: 88, w: 74, h: 10, layout: layoutName, aspect };
    }
    return { mode, x: 50, y: 91, w: 86, h: 12, layout: "Text Only Bar", aspect };
}

function readRawLayout(node) {
    try {
        const parsed = JSON.parse(getWidgetValue(node, "layout_json", "{}") || "{}");
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function readLayout(node) {
    const mode = canonicalMode(getWidgetValue(node, "mode", "相机白条"));
    const fallback = defaultLayout(mode, imageAspect(node));
    const saved = readRawLayout(node);
    const savedMode = canonicalMode(saved.mode || mode);
    if (saved.mode && savedMode !== mode) {
        return fallback;
    }
    return normalizeLayout({
        ...fallback,
        x: Number.isFinite(Number(saved.x)) ? Number(saved.x) : fallback.x,
        y: Number.isFinite(Number(saved.y)) ? Number(saved.y) : fallback.y,
        w: Number.isFinite(Number(saved.w)) ? Number(saved.w) : fallback.w,
        h: Number.isFinite(Number(saved.h)) ? Number(saved.h) : fallback.h,
        layout: typeof saved.layout === "string" ? saved.layout : fallback.layout,
        aspect: Number.isFinite(Number(saved.aspect)) ? Number(saved.aspect) : fallback.aspect,
        mode,
    });
}

function normalizeLayout(layout) {
    const w = round(clamp(Number(layout.w), MIN_BOX, 100));
    const h = round(clamp(Number(layout.h), MIN_BOX, 100));
    const halfW = w / 2;
    const halfH = h / 2;
    return {
        ...layout,
        x: round(clamp(Number(layout.x), halfW, 100 - halfW)),
        y: round(clamp(Number(layout.y), halfH, 100 - halfH)),
        w,
        h,
    };
}

function writeLayout(node, layout) {
    const next = normalizeLayout({
        mode: canonicalMode(layout.mode || getWidgetValue(node, "mode", "相机白条")),
        x: layout.x,
        y: layout.y,
        w: layout.w,
        h: layout.h,
        layout: layout.layout || "Text Only",
        aspect: Number.isFinite(Number(layout.aspect)) ? Number(layout.aspect) : imageAspect(node),
    });
    setWidgetValue(node, "layout_json", JSON.stringify(next), false);
    dirtyNode(node);
}

function hideWidget(widget) {
    widget.hidden = true;
    widget.type = "hidden";
    widget.computeSize = () => [0, -4];
}

function hideControlledWidgets(node) {
    for (const widget of node.widgets || []) {
        if (CONTROLLED_WIDGETS.has(widget?.name)) {
            hideWidget(widget);
        }
    }
}

function ensureStyle() {
    if (document.getElementById("fcw-style")) {
        return;
    }
    const style = document.createElement("style");
    style.id = "fcw-style";
    style.textContent = `
.fcw-panel{box-sizing:border-box;width:100%;padding:10px;color:#e5e7eb;font:12px/1.35 sans-serif;user-select:none}
.fcw-panel *{box-sizing:border-box}
.fcw-row{display:grid;grid-template-columns:72px 1fr;align-items:center;gap:8px;margin-bottom:7px}
.fcw-row label{color:#cbd5e1;white-space:nowrap}
.fcw-panel input,.fcw-panel select{width:100%;height:24px;border:1px solid #555;border-radius:5px;background:#242424;color:#f8fafc;font:12px sans-serif;padding:2px 6px}
.fcw-panel input[type=color]{width:34px;padding:0;border-radius:6px;cursor:pointer}
.fcw-color-wrap{display:grid;grid-template-columns:38px 1fr;gap:8px;align-items:center}
.fcw-opacity-wrap{display:grid;grid-template-columns:1fr 44px;gap:8px;align-items:center}
.fcw-opacity-wrap input{padding:0}
.fcw-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.fcw-preview-title{margin:9px 0 5px;color:#cbd5e1}
.fcw-stage{position:relative;margin:0 auto 7px;width:170px;height:260px;max-width:100%;border:1px solid #334155;border-radius:7px;overflow:hidden;background:#111827;background-size:cover;background-position:center;touch-action:none}
.fcw-stage::before{content:"";position:absolute;inset:0;background-image:linear-gradient(#334155 1px,transparent 1px),linear-gradient(90deg,#334155 1px,transparent 1px);background-size:32px 32px;opacity:.55}
.fcw-box{position:absolute;border:2px solid #60a5fa;border-radius:7px;background:rgba(96,165,250,.16);min-width:18px;min-height:18px;cursor:move;touch-action:none}
.fcw-box-label{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;color:#fff;font-size:11px;overflow:hidden;pointer-events:none}
.fcw-handle{position:absolute;right:-3px;bottom:-3px;width:9px;height:9px;background:#60a5fa;border:1px solid #fff;border-radius:2px;cursor:nwse-resize}
.fcw-info{text-align:right;color:#9ca3af;font-size:10px;min-height:14px}
.fcw-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:8px}
.fcw-actions button,.fcw-random{height:24px;border:1px solid #555;border-radius:5px;background:#2b2b2b;color:#f8fafc;font-size:11px;cursor:pointer}
.fcw-actions button:hover,.fcw-random:hover{border-color:#93c5fd}
.fcw-hidden{display:none}
`;
    document.head.appendChild(style);
}

function make(tag, className, text) {
    const el = document.createElement(tag);
    if (className) {
        el.className = className;
    }
    if (text !== undefined) {
        el.textContent = text;
    }
    return el;
}

function addRow(root, label, child) {
    const row = make("div", "fcw-row");
    row.appendChild(make("label", "", label));
    row.appendChild(child);
    root.appendChild(row);
    return row;
}

function makeSelect(values, value) {
    const select = document.createElement("select");
    for (const item of values) {
        const option = document.createElement("option");
        option.value = item;
        option.textContent = item;
        select.appendChild(option);
    }
    select.value = values.includes(value) ? value : values[0];
    return select;
}

function stageSize(aspect) {
    const maxW = 210;
    const maxH = 260;
    let w = maxW;
    let h = w / Math.max(0.1, aspect);
    if (h > maxH) {
        h = maxH;
        w = h * aspect;
    }
    return { w: Math.max(90, Math.round(w)), h: Math.max(90, Math.round(h)) };
}

function updateBox(panel) {
    const { node, stage, box, info } = panel;
    const layout = readLayout(node);
    const rect = stage.getBoundingClientRect();
    const x = (layout.x / 100) * rect.width;
    const y = (layout.y / 100) * rect.height;
    const w = (layout.w / 100) * rect.width;
    const h = (layout.h / 100) * rect.height;
    box.style.left = `${x - w / 2}px`;
    box.style.top = `${y - h / 2}px`;
    box.style.width = `${w}px`;
    box.style.height = `${h}px`;
    const approxW = Math.round((layout.w / 100) * (node.imgs?.[0]?.naturalWidth || node.imgs?.[0]?.width || 0));
    const approxH = Math.round((layout.h / 100) * (node.imgs?.[0]?.naturalHeight || node.imgs?.[0]?.height || 0));
    info.textContent = `x ${round(layout.x)}%  y ${round(layout.y)}%  宽 ${round(layout.w)}%  高 ${round(layout.h)}%${approxW ? ` 约 ${approxW}×${approxH}px` : ""}`;
}

function updatePreview(panel) {
    const { node, stage, boxLabel } = panel;
    const mode = canonicalMode(getWidgetValue(node, "mode", "相机白条"));
    const aspect = imageAspect(node);
    const size = stageSize(aspect);
    const img = node.imgs?.[0];
    stage.style.width = `${size.w}px`;
    stage.style.height = `${size.h}px`;
    stage.style.backgroundImage = img?.src ? `url("${img.src}")` : "";
    const line1 = getWidgetValue(node, "line_1", "");
    const line2 = getWidgetValue(node, "line_2", "");
    if (mode === "Logo") {
        boxLabel.textContent = "LOGO";
    } else if (mode === "Logo+文字") {
        boxLabel.textContent = "LOGO + 文字";
    } else if (mode === "图案水印") {
        boxLabel.textContent = getWidgetValue(node, "pattern_type", "渐变光影");
    } else {
        boxLabel.textContent = [line1, line2].filter(Boolean).join("\n") || mode;
    }
    updateBox(panel);
}

function applyMode(panel, nextMode, reset = true) {
    const { node, sections, controls } = panel;
    const mode = canonicalMode(nextMode);
    setWidgetValue(node, "mode", mode);
    if (reset) {
        writeLayout(node, defaultLayout(mode, imageAspect(node)));
    }
    sections.text.classList.toggle("fcw-hidden", !["文字", "Logo+文字", "相机白条", "透明水印"].includes(mode));
    sections.pattern.classList.toggle("fcw-hidden", mode !== "图案水印");
    controls.mode.value = mode;
    updatePreview(panel);
    dirtyNode(node);
}

function syncFromWidgets(panel) {
    const { node, controls } = panel;
    controls.mode.value = canonicalMode(getWidgetValue(node, "mode", "相机白条"));
    controls.font.value = getWidgetValue(node, "font_style", "默认");
    controls.color.value = hexColor(getWidgetValue(node, "text_color", "#ffffff"));
    controls.colorHex.value = controls.color.value;
    controls.opacity.value = String(clamp(Number(getWidgetValue(node, "text_opacity", 100)), 0, 100));
    controls.opacityText.textContent = `${controls.opacity.value}%`;
    controls.line1.value = getWidgetValue(node, "line_1", "");
    controls.line2.value = getWidgetValue(node, "line_2", "");
    controls.line3.value = getWidgetValue(node, "line_3", "");
    controls.fontSize.value = String(getWidgetValue(node, "font_size", 28));
    controls.pattern.value = getWidgetValue(node, "pattern_type", "渐变光影");
    controls.density.value = String(getWidgetValue(node, "pattern_density", 18));
    controls.scaleMin.value = String(getWidgetValue(node, "pattern_scale_min", 6));
    controls.scaleMax.value = String(getWidgetValue(node, "pattern_scale_max", 22));
    applyMode(panel, controls.mode.value, false);
}

function bindDrag(panel) {
    const { node, stage, box, handle } = panel;
    let drag = null;
    const pointerToPercent = (event) => {
        const rect = stage.getBoundingClientRect();
        return {
            x: ((event.clientX - rect.left) / rect.width) * 100,
            y: ((event.clientY - rect.top) / rect.height) * 100,
        };
    };
    const stop = (event) => {
        event.preventDefault();
        event.stopPropagation();
    };
    const startDrag = (event, kind) => {
        stop(event);
        const layout = readLayout(node);
        const point = pointerToPercent(event);
        const left = layout.x - layout.w / 2;
        const top = layout.y - layout.h / 2;
        drag = {
            kind,
            layout,
            left,
            top,
            offsetX: point.x - layout.x,
            offsetY: point.y - layout.y,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    stage.addEventListener("pointerdown", (event) => {
        if (event.target === handle || event.target === box) {
            return;
        }
        stop(event);
        const point = pointerToPercent(event);
        const layout = { ...readLayout(node), x: point.x, y: point.y };
        writeLayout(node, layout);
        updateBox(panel);
        startDrag(event, "move");
    });
    box.addEventListener("pointerdown", (event) => startDrag(event, "move"));
    handle.addEventListener("pointerdown", (event) => startDrag(event, "scale"));
    const onMove = (event) => {
        if (!drag) {
            return;
        }
        stop(event);
        const point = pointerToPercent(event);
        const next = { ...drag.layout };
        if (drag.kind === "scale") {
            next.w = clamp(point.x - drag.left, MIN_BOX, 100);
            next.h = clamp(point.y - drag.top, MIN_BOX, 100);
            next.x = drag.left + next.w / 2;
            next.y = drag.top + next.h / 2;
        } else {
            next.x = clamp(point.x - drag.offsetX, 0, 100);
            next.y = clamp(point.y - drag.offsetY, 0, 100);
        }
        writeLayout(node, next);
        updateBox(panel);
    };
    const onUp = (event) => {
        if (drag) {
            stop(event);
            drag = null;
        }
    };
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", onUp, true);
}

function createPanel(node) {
    ensureStyle();
    const root = make("div", "fcw-panel");
    root.addEventListener("pointerdown", (event) => event.stopPropagation());
    root.addEventListener("mousedown", (event) => event.stopPropagation());
    root.addEventListener("wheel", (event) => event.stopPropagation());

    const controls = {};
    controls.mode = makeSelect(MODES, canonicalMode(getWidgetValue(node, "mode", "相机白条")));
    addRow(root, "模式", controls.mode);

    controls.font = makeSelect(FONT_STYLES, getWidgetValue(node, "font_style", "默认"));
    addRow(root, "字体", controls.font);

    const textSection = make("div");
    controls.line1 = document.createElement("input");
    controls.line2 = document.createElement("input");
    controls.line3 = document.createElement("input");
    controls.fontSize = document.createElement("input");
    controls.fontSize.type = "number";
    controls.fontSize.min = "6";
    controls.fontSize.max = "256";
    addRow(textSection, "文字1", controls.line1);
    addRow(textSection, "文字2", controls.line2);
    addRow(textSection, "文字3", controls.line3);
    addRow(textSection, "字号", controls.fontSize);
    root.appendChild(textSection);

    const colorWrap = make("div", "fcw-color-wrap");
    controls.color = document.createElement("input");
    controls.color.type = "color";
    controls.colorHex = document.createElement("input");
    controls.colorHex.placeholder = "#ffffff";
    colorWrap.appendChild(controls.color);
    colorWrap.appendChild(controls.colorHex);
    addRow(root, "主颜色", colorWrap);

    const opacityWrap = make("div", "fcw-opacity-wrap");
    controls.opacity = document.createElement("input");
    controls.opacity.type = "range";
    controls.opacity.min = "0";
    controls.opacity.max = "100";
    controls.opacity.step = "1";
    controls.opacityText = make("span", "", "100%");
    opacityWrap.appendChild(controls.opacity);
    opacityWrap.appendChild(controls.opacityText);
    addRow(root, "透明度", opacityWrap);

    const patternSection = make("div");
    controls.pattern = makeSelect(PATTERNS, getWidgetValue(node, "pattern_type", "渐变光影"));
    addRow(patternSection, "图案", controls.pattern);
    const patternTwoA = make("div", "fcw-two");
    controls.density = document.createElement("input");
    controls.density.type = "number";
    controls.density.min = "1";
    controls.density.max = "100";
    controls.scaleMin = document.createElement("input");
    controls.scaleMin.type = "number";
    controls.scaleMin.min = "1";
    controls.scaleMin.max = "512";
    patternTwoA.appendChild(controls.density);
    patternTwoA.appendChild(controls.scaleMin);
    addRow(patternSection, "密度/小", patternTwoA);
    const patternTwoB = make("div", "fcw-two");
    controls.scaleMax = document.createElement("input");
    controls.scaleMax.type = "number";
    controls.scaleMax.min = "1";
    controls.scaleMax.max = "1024";
    controls.random = make("button", "fcw-random", "随机图案");
    patternTwoB.appendChild(controls.scaleMax);
    patternTwoB.appendChild(controls.random);
    addRow(patternSection, "大/随机", patternTwoB);
    root.appendChild(patternSection);

    root.appendChild(make("div", "fcw-preview-title", "拖动移动，拉右下角缩放"));
    const stage = make("div", "fcw-stage");
    const box = make("div", "fcw-box");
    const boxLabel = make("div", "fcw-box-label");
    const handle = make("div", "fcw-handle");
    box.appendChild(boxLabel);
    box.appendChild(handle);
    stage.appendChild(box);
    root.appendChild(stage);
    const info = make("div", "fcw-info");
    root.appendChild(info);

    const actions = make("div", "fcw-actions");
    for (const [label, action] of [
        ["重置", () => writeLayout(node, defaultLayout(canonicalMode(controls.mode.value), imageAspect(node)))],
        ["居中", () => writeLayout(node, { ...readLayout(node), x: 50, y: 50 })],
        ["底部", () => writeLayout(node, { ...readLayout(node), x: 50, y: 90 })],
        ["适宽", () => writeLayout(node, { ...readLayout(node), w: canonicalMode(controls.mode.value) === "图案水印" ? 100 : 86, h: canonicalMode(controls.mode.value) === "图案水印" ? 100 : readLayout(node).h })],
    ]) {
        const button = make("button", "", label);
        button.addEventListener("click", (event) => {
            event.preventDefault();
            action();
            updatePreview(panel);
        });
        actions.appendChild(button);
    }
    root.appendChild(actions);

    const panel = {
        node,
        root,
        controls,
        sections: { text: textSection, pattern: patternSection },
        stage,
        box,
        boxLabel,
        handle,
        info,
    };

    controls.mode.addEventListener("change", () => applyMode(panel, controls.mode.value, true));
    controls.font.addEventListener("change", () => {
        setWidgetValue(node, "font_style", controls.font.value);
        updatePreview(panel);
    });
    for (const [control, widgetName] of [
        [controls.line1, "line_1"],
        [controls.line2, "line_2"],
        [controls.line3, "line_3"],
        [controls.fontSize, "font_size"],
        [controls.pattern, "pattern_type"],
        [controls.density, "pattern_density"],
        [controls.scaleMin, "pattern_scale_min"],
        [controls.scaleMax, "pattern_scale_max"],
    ]) {
        control.addEventListener("input", () => {
            setWidgetValue(node, widgetName, control.value);
            updatePreview(panel);
        });
    }
    controls.color.addEventListener("input", () => {
        const value = hexColor(controls.color.value);
        controls.colorHex.value = value;
        setWidgetValue(node, "text_color", value);
        updatePreview(panel);
    });
    controls.colorHex.addEventListener("change", () => {
        const value = hexColor(controls.colorHex.value, controls.color.value);
        controls.color.value = value;
        controls.colorHex.value = value;
        setWidgetValue(node, "text_color", value);
        updatePreview(panel);
    });
    controls.opacity.addEventListener("input", () => {
        controls.opacityText.textContent = `${controls.opacity.value}%`;
        setWidgetValue(node, "text_opacity", Number(controls.opacity.value));
        updatePreview(panel);
    });
    controls.random.addEventListener("click", (event) => {
        event.preventDefault();
        setWidgetValue(node, "pattern_seed", Math.floor(Math.random() * 2147483647));
        updatePreview(panel);
    });

    bindDrag(panel);
    syncFromWidgets(panel);
    return panel;
}

function installPanel(node) {
    hideControlledWidgets(node);
    if (node._fcwPanelWidget) {
        return;
    }
    const panel = createPanel(node);
    node._fcwPanel = panel;
    node._fcwPanelWidget = node.addDOMWidget(DOM_WIDGET, "fcw", panel.root, {
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => 500,
        getMaxHeight: () => 760,
    });
    node._fcwPanelWidget.computeSize = (width) => [width, 560];
    node.serialize_widgets = true;
    node.setSize?.([Math.max(node.size?.[0] || 380, 420), Math.max(node.size?.[1] || 620, 620)]);
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
            installPanel(this);
            return result;
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            const result = onExecuted?.apply(this, arguments);
            setTimeout(() => {
                if (this._fcwPanel) {
                    const layout = readLayout(this);
                    writeLayout(this, { ...layout, aspect: imageAspect(this) });
                    updatePreview(this._fcwPanel);
                }
            }, 80);
            return result;
        };
    },
});
