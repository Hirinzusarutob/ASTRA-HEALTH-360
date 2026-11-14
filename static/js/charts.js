
/*
 * ASTRA HEALTH 360
 * Reusable Canvas Chart Utilities
 *
 * Supports:
 * 1. Line charts
 * 2. Bar charts
 * 3. Empty-state handling
 * 4. Responsive canvas resizing
 *
 * No external chart library required.
 */

window.AstraCharts = (() => {
    "use strict";

    const COLORS = {
        text: "#b9cce0",
        grid: "rgba(160,190,220,0.15)",
        line: "#35d6bd",
        fill: "rgba(53,214,189,0.12)",
        bar: "#258cc4",
        background: "#0c1b2c"
    };

    function getCanvas(canvasOrId) {
        if (typeof canvasOrId === "string") {
            return document.getElementById(canvasOrId);
        }

        return canvasOrId;
    }

    function prepareCanvas(canvas) {
        if (!canvas) return null;

        const rect = canvas.getBoundingClientRect();
        const width = Math.max(rect.width, 280);
        const height = Math.max(
            Number(canvas.dataset.chartHeight) || rect.height || 260,
            180
        );

        const ratio = window.devicePixelRatio || 1;

        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);

        const context = canvas.getContext("2d");

        if (!context) return null;

        context.setTransform(ratio, 0, 0, ratio, 0, 0);

        return { context, width, height };
    }

    function drawEmpty(canvas, message = "No data available") {
        const prepared = prepareCanvas(canvas);
        if (!prepared) return;

        const { context, width, height } = prepared;

        context.fillStyle = COLORS.background;
        context.fillRect(0, 0, width, height);

        context.fillStyle = COLORS.text;
        context.font = "14px Arial";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(message, width / 2, height / 2);
    }

    function drawGrid(context, width, height, padding, maxValue) {
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        context.strokeStyle = COLORS.grid;
        context.lineWidth = 1;
        context.font = "11px Arial";
        context.fillStyle = COLORS.text;
        context.textAlign = "right";

        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartHeight / 4) * i;
            const value = maxValue - (maxValue / 4) * i;

            context.beginPath();
            context.moveTo(padding.left, y);
            context.lineTo(width - padding.right, y);
            context.stroke();

            context.fillText(
                value.toFixed(0),
                padding.left - 8,
                y + 4
            );
        }

        return { chartWidth, chartHeight };
    }

    function drawLine(canvasOrId, values, options = {}) {
        const canvas = getCanvas(canvasOrId);

        if (!canvas) return;

        const data = Array.isArray(values)
            ? values.map(Number).filter(Number.isFinite)
            : [];

        if (!data.length) {
            drawEmpty(canvas, options.emptyMessage);
            return;
        }

        const prepared = prepareCanvas(canvas);
        if (!prepared) return;

        const { context, width, height } = prepared;

        const padding = {
            top: 20,
            right: 20,
            bottom: 35,
            left: 45
        };

        context.clearRect(0, 0, width, height);

        context.fillStyle = COLORS.background;
        context.fillRect(0, 0, width, height);

        const minimum = Math.min(0, ...data);
        const maximum = Math.max(1, ...data);
        const range = maximum - minimum || 1;

        const maxValue = Math.ceil(maximum * 1.15);

        const { chartWidth, chartHeight } = drawGrid(
            context,
            width,
            height,
            padding,
            maxValue
        );

        const points = data.map((value, index) => ({
            x: padding.left +
                (data.length === 1
                    ? chartWidth / 2
                    : (chartWidth * index) / (data.length - 1)),
            y: padding.top +
                chartHeight -
                ((value - minimum) / range) * chartHeight
        }));

        // Draw filled area.
        if (points.length > 1) {
            context.beginPath();
            context.moveTo(points[0].x, padding.top + chartHeight);

            points.forEach(point => {
                context.lineTo(point.x, point.y);
            });

            context.lineTo(
                points[points.length - 1].x,
                padding.top + chartHeight
            );

            context.closePath();
            context.fillStyle = COLORS.fill;
            context.fill();
        }

        // Draw line.
        context.beginPath();

        points.forEach((point, index) => {
            if (index === 0) {
                context.moveTo(point.x, point.y);
            } else {
                context.lineTo(point.x, point.y);
            }
        });

        context.strokeStyle = options.color || COLORS.line;
        context.lineWidth = 2.5;
        context.lineJoin = "round";
        context.lineCap = "round";
        context.stroke();

        // Draw points.
        points.forEach(point => {
            context.beginPath();
            context.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
            context.fillStyle = options.color || COLORS.line;
            context.fill();
        });

        // Draw x-axis labels.
        context.font = "10px Arial";
        context.fillStyle = COLORS.text;
        context.textAlign = "center";

        const labels = options.labels || [];

        points.forEach((point, index) => {
            if (
                index === 0 ||
                index === points.length - 1 ||
                index % Math.ceil(points.length / 5) === 0
            ) {
                context.fillText(
                    String(labels[index] ?? index + 1),
                    point.x,
                    height - 10
                );
            }
        });
    }

    function drawBars(canvasOrId, values, options = {}) {
        const canvas = getCanvas(canvasOrId);

        if (!canvas) return;

        const data = Array.isArray(values)
            ? values.map(Number).filter(Number.isFinite)
            : [];

        if (!data.length) {
            drawEmpty(canvas, options.emptyMessage);
            return;
        }

        const prepared = prepareCanvas(canvas);
        if (!prepared) return;

        const { context, width, height } = prepared;

        const padding = {
            top: 20,
            right: 20,
            bottom: 40,
            left: 45
        };

        context.clearRect(0, 0, width, height);

        context.fillStyle = COLORS.background;
        context.fillRect(0, 0, width, height);

        const maximum = Math.max(1, ...data);
        const maxValue = Math.ceil(maximum * 1.15);

        const { chartWidth, chartHeight } = drawGrid(
            context,
            width,
            height,
            padding,
            maxValue
        );

        const gap = chartWidth * 0.04;
        const barWidth = Math.max(
            4,
            (chartWidth - gap * (data.length - 1)) / data.length
        );

        data.forEach((value, index) => {
            const barHeight = (value / maxValue) * chartHeight;
            const x = padding.left + index * (barWidth + gap);
            const y = padding.top + chartHeight - barHeight;

            context.fillStyle = options.color || COLORS.bar;

            context.beginPath();
            context.roundRect(
                x,
                y,
                barWidth,
                Math.max(0, barHeight),
                4
            );
            context.fill();

            context.fillStyle = COLORS.text;
            context.font = "10px Arial";
            context.textAlign = "center";

            const label = options.labels?.[index] ?? index + 1;

            context.fillText(
                String(label).slice(0, 12),
                x + barWidth / 2,
                height - 12
            );
        });
    }

    function clear(canvasOrId) {
        const canvas = getCanvas(canvasOrId);

        if (!canvas) return;

        const context = canvas.getContext("2d");
        if (context) {
            context.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    return {
        drawLine,
        drawBars,
        drawEmpty,
        clear
    };
})();
