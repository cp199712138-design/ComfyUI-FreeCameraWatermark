import { app } from "/scripts/app.js";

const NODE_NAME = "FreeCameraWatermark";
const WIDGET_NAME = "watermark_transform";
const CONTROL_HEIGHT = 170;
const MIN_SCALE = 0.05;
const MAX_SCALE = 8.0;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function round(value, digits = 2) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function findWidget(node, name) {
    return node.widgets?.find((widget) => widget?.name === name);
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

function getNumber(node, name, fallback) {
    const value = Number(findWidget(node, name)?.value);
    return Number.isFinite(value) ? value : fallback;
}

function getMode(node) {
    return String(findWidget(node, "watermark_mode")?.value || "Text");
}

function hideNumericTransformWidgets(node) {
    for (const name of ["position_x", "position_y", "scale"]) {
        const widget = findWidget(node, name);
        if (!widget) {
            continue;
        }

        widget.hidden = true;
        widget.type = "hidden";
        widget.computeSize = () => [0, -4];
        widget.serialize = true;
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
        const headerHeight = 18;
        const areaX = margin;
        const areaY = widgetY + headerHeight + 8;
        const areaWidth = Math.max(80, widgetWidth - margin * 2);
        const areaHeight = 124;
        const mode = getMode(node);
        const posX = clamp(getNumber(node, "position_x", 50), 0, 100);
        const posY = clamp(getNumber(node, "position_y", 88), 0, 100);
        const scale = clamp(getNumber(node, "scale", 1), MIN_SCALE, MAX_SCALE);

        const baseWidth = mode === "Logo" ? 72 : 150;
        const baseHeight = mode === "Logo" ? 44 : 34;
        const boxWidth = clamp(baseWidth * scale, 16, areaWidth);
        const boxHeight = clamp(baseHeight * scale, 14, areaHeight);
        const centerX = areaX + (posX / 100) * areaWidth;
        const centerY = areaY + (posY / 100) * areaHeight;
        const boxX = centerX - boxWidth / 2;
        const boxY = centerY - boxHeight / 2;

        this._area = { x: areaX, y: areaY, w: areaWidth, h: areaHeight };
        this._box = { x: boxX, y: boxY, w: boxWidth, h: boxHeight };

        ctx.save();
        ctx.font = "12px sans-serif";
        ctx.fillStyle = "#cfcfcf";
        ctx.textAlign = "left";
        ctx.fillText("Transform: drag box to move, drag corner to scale", margin, widgetY + 13);

        ctx.fillStyle = "#20242a";
        drawRoundRect(ctx, areaX, areaY, areaWidth, areaHeight, 7);
        ctx.fill();
        ctx.strokeStyle = "#4b5563";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i += 1) {
            const x = areaX + (areaWidth * i) / 4;
            ctx.beginPath();
            ctx.moveTo(x, areaY);
            ctx.lineTo(x, areaY + areaHeight);
            ctx.stroke();
        }
        for (let i = 1; i < 3; i += 1) {
            const y = areaY + (areaHeight * i) / 3;
            ctx.beginPath();
            ctx.moveTo(areaX, y);
            ctx.lineTo(areaX + areaWidth, y);
            ctx.stroke();
        }

        ctx.fillStyle = mode === "Logo" ? "rgba(88, 166, 255, 0.28)" : "rgba(255, 255, 255, 0.9)";
        drawRoundRect(ctx, boxX, boxY, boxWidth, boxHeight, 5);
        ctx.fill();
        ctx.strokeStyle = "#58a6ff";
        ctx.lineWidth = 2;
        ctx.stroke();

        const handleSize = 11;
        ctx.fillStyle = "#58a6ff";
        ctx.fillRect(boxX + boxWidth - handleSize, boxY + boxHeight - handleSize, handleSize, handleSize);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX + boxWidth - handleSize, boxY + boxHeight - handleSize, handleSize, handleSize);

        ctx.fillStyle = mode === "Logo" ? "#d7ecff" : "#20242a";
        ctx.textAlign = "center";
        ctx.font = "11px sans-serif";
        ctx.fillText(mode, centerX, centerY + 4);

        ctx.fillStyle = "#9ca3af";
        ctx.textAlign = "right";
        ctx.font = "10px sans-serif";
        ctx.fillText(`x ${round(posX, 1)}  y ${round(posY, 1)}  scale ${round(scale, 2)}`, areaX + areaWidth, areaY + areaHeight + 14);
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
        const handleSize = 14;
        const inBox = x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
        const inHandle = x >= box.x + box.w - handleSize && x <= box.x + box.w + 3
            && y >= box.y + box.h - handleSize && y <= box.y + box.h + 3;

        if (event.type === "pointerdown") {
            if (!inBox) {
                return false;
            }

            this._drag = {
                mode: inHandle ? "scale" : "move",
                startX: x,
                startY: y,
                startPosX: getNumber(node, "position_x", 50),
                startPosY: getNumber(node, "position_y", 88),
                startScale: getNumber(node, "scale", 1),
                centerX: box.x + box.w / 2,
                centerY: box.y + box.h / 2,
                baseWidth: getMode(node) === "Logo" ? 72 : 150,
                baseHeight: getMode(node) === "Logo" ? 44 : 34,
            };
            return true;
        }

        if (event.type === "pointermove" && this._drag) {
            if (this._drag.mode === "move") {
                const nextX = clamp(((x - area.x) / area.w) * 100, 0, 100);
                const nextY = clamp(((y - area.y) / area.h) * 100, 0, 100);
                setWidgetValue(node, "position_x", round(nextX, 1));
                setWidgetValue(node, "position_y", round(nextY, 1));
            } else {
                const halfWidthScale = Math.abs(x - this._drag.centerX) / Math.max(1, this._drag.baseWidth / 2);
                const halfHeightScale = Math.abs(y - this._drag.centerY) / Math.max(1, this._drag.baseHeight / 2);
                const nextScale = clamp(Math.max(halfWidthScale, halfHeightScale), MIN_SCALE, MAX_SCALE);
                setWidgetValue(node, "scale", round(nextScale, 2));
            }
            return true;
        }

        if ((event.type === "pointerup" || event.type === "pointerleave") && this._drag) {
            this._drag = null;
            return true;
        }

        return false;
    }
}

function addTransformWidget(node) {
    if (node.widgets?.some((widget) => widget?.name === WIDGET_NAME)) {
        return;
    }

    hideNumericTransformWidgets(node);
    node.addCustomWidget(new WatermarkTransformWidget());
    node.serialize_widgets = true;

    const width = Math.max(node.size?.[0] || 300, 340);
    const height = Math.max(node.size?.[1] || 260, 360);
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
