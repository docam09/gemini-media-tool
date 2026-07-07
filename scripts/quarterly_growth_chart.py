#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vẽ biểu đồ cột so sánh theo quý (Năm 2025 vs Năm 2026) kèm % tăng trưởng.

Tái tạo thiết kế slide: mỗi quý có panel nền kem với thanh cam trên đỉnh,
hai cột gradient (xanh = năm trước, cam = năm sau), mũi tên cong và con số
tăng trưởng so với cùng kỳ.

Chạy:  python scripts/quarterly_growth_chart.py [đường_dẫn_ảnh_ra.png]
"""

import sys

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch, PathPatch, Rectangle
from matplotlib.path import Path

# ----------------------------------------------------------------------------
# Dữ liệu — chỉnh ở đây
# ----------------------------------------------------------------------------
QUARTERS = ["Quý 1", "Quý 2", "Quý 3", "Quý 4"]
YEAR_PREV_LABEL = "Năm 2025"
YEAR_CURR_LABEL = "Năm 2026"
VALUES_PREV = [3, 2.5, 3.5, 3]      # cột xanh
VALUES_CURR = [4, 3.5, 2, 4.5]      # cột cam
GROWTH = ["30%", "40%", "25%", "45%"]  # hiển thị cạnh mũi tên
GROWTH_UP = [True, True, False, True]  # True = tăng (cam, mũi tên lên)

# ----------------------------------------------------------------------------
# Màu sắc
# ----------------------------------------------------------------------------
BLUE_TOP, BLUE_BOTTOM = "#3B82F6", "#1D4ED8"        # gradient cột xanh
ORANGE_TOP, ORANGE_BOTTOM = "#FBBF24", "#EA7A0B"    # gradient cột cam
PANEL_TOP, PANEL_BOTTOM = "#FBE7C2", "#FFFDF8"      # gradient panel nền
STRIP_COLOR = "#F5A81C"                             # thanh cam đỉnh panel
NAVY = "#1E2A5A"                                    # chữ tiêu đề panel
ORANGE_TEXT = "#EE7D1A"                             # % tăng
BLUE_TEXT = "#2458D6"                               # % giảm
AXIS_GRAY = "#D8D8D8"

BAR_SCALE = 1.05          # 1 đơn vị dữ liệu = bấy nhiêu đơn vị trục y
PANEL_H = 9.0             # chiều cao panel
PANEL_HALF_W = 0.42       # nửa bề rộng panel
BAR_W = 0.26              # bề rộng một cột
BAR_GAP = 0.07            # khe hở giữa hai cột


def rounded_top_bar_path(x, w, h, r):
    """Path hình cột: đáy vuông, hai góc trên bo tròn bán kính r."""
    r = min(r, w / 2, h)
    k = 0.5523 * r  # hệ số bezier xấp xỉ cung tròn
    verts = [
        (x, 0), (x + w, 0), (x + w, h - r),                     # cạnh phải
        (x + w, h - r + k), (x + w - r + k, h), (x + w - r, h),  # góc phải
        (x + r, h),                                              # cạnh trên
        (x + r - k, h), (x, h - r + k), (x, h - r),              # góc trái
        (x, 0),
    ]
    codes = [Path.MOVETO, Path.LINETO, Path.LINETO,
             Path.CURVE4, Path.CURVE4, Path.CURVE4,
             Path.LINETO,
             Path.CURVE4, Path.CURVE4, Path.CURVE4,
             Path.CLOSEPOLY]
    return Path(verts, codes)


def draw_gradient(ax, patch, c_top, c_bottom, zorder):
    """Tô gradient dọc (trên → dưới) bên trong một patch."""
    x0, y0 = patch.get_extents().transformed(ax.transData.inverted()).min
    x1, y1 = patch.get_extents().transformed(ax.transData.inverted()).max
    grad = np.linspace(0, 1, 256).reshape(-1, 1)
    cmap = LinearSegmentedColormap.from_list("g", [c_top, c_bottom])
    im = ax.imshow(grad, extent=(x0, x1, y0, y1), aspect="auto",
                   cmap=cmap, origin="upper", zorder=zorder,
                   interpolation="bicubic")
    im.set_clip_path(patch)


def main(out_path="quarterly_growth_chart.png"):
    fig, ax = plt.subplots(figsize=(12.8, 7.2), dpi=150)
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")

    for i, quarter in enumerate(QUARTERS):
        xc = float(i)
        up = GROWTH_UP[i]

        # --- Panel nền + thanh cam trên đỉnh -------------------------------
        panel = FancyBboxPatch(
            (xc - PANEL_HALF_W, 0), 2 * PANEL_HALF_W, PANEL_H,
            boxstyle="round,pad=0,rounding_size=0.03",
            linewidth=0, facecolor="none", zorder=1, mutation_aspect=0.12)
        ax.add_patch(panel)
        draw_gradient(ax, panel, PANEL_TOP, PANEL_BOTTOM, zorder=1)
        strip = FancyBboxPatch(
            (xc - PANEL_HALF_W - 0.015, PANEL_H - 0.02),
            2 * PANEL_HALF_W + 0.03, 0.16,
            boxstyle="round,pad=0,rounding_size=0.02",
            linewidth=0, facecolor=STRIP_COLOR, zorder=3, mutation_aspect=0.12)
        ax.add_patch(strip)

        # --- Chữ trong panel ------------------------------------------------
        ax.text(xc, PANEL_H - 0.45, f"Tăng trưởng\nso với cùng kỳ\n{quarter}",
                ha="center", va="top", fontsize=13.5, fontweight="bold",
                color=NAVY, linespacing=1.45, zorder=4)

        pct_color = ORANGE_TEXT if up else BLUE_TEXT
        ax.text(xc - 0.13, 6.05, GROWTH[i], ha="center", va="center",
                fontsize=27, fontweight="bold", color=pct_color, zorder=4)

        # --- Mũi tên cong (lên = cam, xuống = xanh) -------------------------
        if up:
            arrow = FancyArrowPatch(
                (xc + 0.08, 5.75), (xc + 0.33, 6.85),
                connectionstyle="arc3,rad=-0.55",
                arrowstyle="simple,head_width=16,head_length=13,tail_width=7",
                facecolor=pct_color, edgecolor="none", zorder=4)
        else:
            arrow = FancyArrowPatch(
                (xc + 0.06, 6.55), (xc + 0.33, 5.45),
                connectionstyle="arc3,rad=-0.55",
                arrowstyle="simple,head_width=16,head_length=13,tail_width=7",
                facecolor=pct_color, edgecolor="none", zorder=4)
        ax.add_patch(arrow)

        # --- Hai cột gradient -----------------------------------------------
        for value, x_left, c_top, c_bottom in (
            (VALUES_PREV[i], xc - BAR_GAP / 2 - BAR_W, BLUE_TOP, BLUE_BOTTOM),
            (VALUES_CURR[i], xc + BAR_GAP / 2, ORANGE_TOP, ORANGE_BOTTOM),
        ):
            h = value * BAR_SCALE
            bar = PathPatch(rounded_top_bar_path(x_left, BAR_W, h, 0.05),
                            facecolor="none", linewidth=0, zorder=5)
            ax.add_patch(bar)
            draw_gradient(ax, bar, c_top, c_bottom, zorder=5)
            label = f"{value:g}"
            ax.text(x_left + BAR_W / 2, h - 0.28, label, ha="center", va="top",
                    fontsize=15, fontweight="bold", color="white", zorder=6)

        # --- Nhãn quý dưới trục ----------------------------------------------
        ax.text(xc, -0.55, quarter, ha="center", va="top",
                fontsize=15, color="#3A3A3A", zorder=4)

    # Đường trục đáy
    ax.add_patch(Rectangle((-0.62, -0.07), len(QUARTERS) - 1 + 1.24, 0.09,
                           facecolor=AXIS_GRAY, edgecolor="none", zorder=2))

    # Chú giải
    legend_y = -1.35
    for dx, color, label in ((-0.62, BLUE_BOTTOM, YEAR_PREV_LABEL),
                             (0.18, ORANGE_BOTTOM, YEAR_CURR_LABEL)):
        x0 = (len(QUARTERS) - 1) / 2 + dx
        ax.add_patch(Rectangle((x0, legend_y - 0.09), 0.055, 0.24,
                               facecolor=color, edgecolor="none", zorder=4))
        ax.text(x0 + 0.09, legend_y + 0.03, label, ha="left", va="center",
                fontsize=14.5, color="#222222", zorder=4)

    ax.set_xlim(-0.75, len(QUARTERS) - 1 + 0.75)
    ax.set_ylim(-1.9, PANEL_H + 0.55)
    ax.axis("off")

    fig.tight_layout()
    fig.savefig(out_path, bbox_inches="tight", facecolor="white")
    print(f"Đã lưu biểu đồ: {out_path}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "quarterly_growth_chart.png")
