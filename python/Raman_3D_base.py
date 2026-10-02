import os

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from df_utils import load_df_xlwings_with_dialog_and_names
from plot_utils import (
    COLORS,
    apply_series_colors_from_env,
    env_axes_size_cm,
    env_style_options,
    save_preview_png,
    save_svg_interactive,
    show_and_close,
)


def env_float(name: str, default: float) -> float:
    value = os.getenv(name, "").strip()
    if not value:
        return default
    try:
        return float(value)
    except ValueError:
        return default


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name, "").strip().lower()
    if not value:
        return default
    return value in {"1", "true", "yes", "on"}


def build_label(default_text: str, env_text_name: str, env_unit_name: str) -> str:
    text = os.getenv(env_text_name, "").strip()
    unit = os.getenv(env_unit_name, "").strip()
    if text and unit:
        return f"{text} ({unit})"
    if text:
        return text
    if unit:
        return f"{default_text} ({unit})"
    return default_text


def to_numeric_array(series: pd.Series) -> np.ndarray:
    return pd.to_numeric(series, errors="coerce").to_numpy(dtype=float)


sheet_number = int(os.getenv("PLOT_SHEET_NUMBER", "0"))
preset_xlsx_path = os.getenv("PLOT_XLSX_PATH")
normalize_each = env_bool("PLOT_R3D_NORMALIZE", True)
depth_step = max(0.01, env_float("PLOT_R3D_DEPTH_STEP", 1.0))

df, sheet_name, column_names, book, dir_name, df_name = load_df_xlwings_with_dialog_and_names(
    sheet_index=sheet_number, xlsx_path=preset_xlsx_path
)

# Raman_3D uses fixed data layout:
#   1st column -> Raman shift (x)
#   2nd and later columns -> intensity series (waterfall)
plot_pairs = []
if len(column_names) >= 2:
    base_x = column_names[0]
    palette = plt.cm.turbo(np.linspace(0.05, 0.95, max(1, len(column_names) - 1)))
    for i, ycol in enumerate(column_names[1:]):
        r, g, b, _ = palette[i]
        plot_pairs.append((base_x, ycol, 0, 0, f"#{int(r*255):02X}{int(g*255):02X}{int(b*255):02X}"))
else:
    plot_pairs = [(column_names[0], column_names[0], 0, 0, COLORS["blue"][7])]

plot_pairs = apply_series_colors_from_env(plot_pairs)

ax_w_cm, ax_h_cm = env_axes_size_cm(6.0, 4.0)
fig = plt.figure(figsize=(ax_w_cm / 2.54, ax_h_cm / 2.54))
ax = fig.add_subplot(111, projection="3d")

style = env_style_options(
    dict(
        linewidth_scale=1.0,
        fontsize_tick_scale=1.0,
        fontsize_label_scale=1.0,
        data_line_scale=1.2,
    )
)
line_width = max(0.4, float(style.get("data_line_scale", 1.2)))

for i, (xcol, ycol, xoff, yoff, color) in enumerate(plot_pairs):
    x = to_numeric_array(df[xcol]) + float(xoff)
    z = to_numeric_array(df[ycol]) + float(yoff)
    mask = np.isfinite(x) & np.isfinite(z)
    if not np.any(mask):
        continue
    x = x[mask]
    z = z[mask]

    if normalize_each:
        zmin = float(np.min(z))
        zmax = float(np.max(z))
        if zmax > zmin:
            z = (z - zmin) / (zmax - zmin)
        else:
            z = z - zmin

    y = np.full_like(x, i * depth_step, dtype=float)
    ax.plot(x, y, z, color=color, linewidth=line_width)

xlabel = build_label("Raman shift", "PLOT_XLABEL_TEXT", "PLOT_XUNIT")
zlabel = build_label("Normalized intensity", "PLOT_YLABEL_TEXT", "PLOT_YUNIT")
ax.set_xlabel(xlabel)
ax.set_ylabel("Series")
ax.set_zlabel(zlabel)

# waterfall-like viewpoint
ax.view_init(elev=24, azim=-66)
ax.grid(True, alpha=0.35)

# Use existing launcher range controls:
# PLOT_XMIN/XMAX -> x axis, PLOT_YMIN/YMAX -> z axis
xmin = os.getenv("PLOT_XMIN", "").strip()
xmax = os.getenv("PLOT_XMAX", "").strip()
zmin = os.getenv("PLOT_YMIN", "").strip()
zmax = os.getenv("PLOT_YMAX", "").strip()
if xmin or xmax:
    try:
        current_min, current_max = ax.get_xlim()
        ax.set_xlim(float(xmin) if xmin else current_min, float(xmax) if xmax else current_max)
    except ValueError:
        pass
if zmin or zmax:
    try:
        current_min, current_max = ax.get_zlim()
        ax.set_zlim(float(zmin) if zmin else current_min, float(zmax) if zmax else current_max)
    except ValueError:
        pass

if os.getenv("PLOT_XSCALE", "").strip().lower() == "log":
    ax.set_xscale("log")
if os.getenv("PLOT_YSCALE", "").strip().lower() == "log":
    ax.set_zscale("log")

preview_only = os.getenv("PLOT_PREVIEW_ONLY", "0") == "1"
skip_show = os.getenv("PLOT_SKIP_SHOW", "0") == "1"
if preview_only:
    preview_path = os.getenv("PLOT_PREVIEW_PATH", "").strip()
    if preview_path:
        save_preview_png(fig, preview_path)
    print("[PREVIEW] Save skipped.")
    show_and_close(fig, show=not skip_show, close=False)
else:
    out_path = save_svg_interactive(
        fig,
        out_dir=dir_name,
        base_stem=os.path.splitext(df_name)[0] + "_Raman3D",
        sheet_name=sheet_name,
        tight=False,
    )
    print("Saved to:", out_path)
    show_and_close(fig, show=not skip_show, close=False)
