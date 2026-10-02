import os
import numpy as np
import pandas as pd

from df_utils import load_df_xlwings_with_dialog_and_names
from plot_utils import (
    COLORS,
    apply_plot_background_from_env,
    apply_preview_legend,
    save_preview_png,
    apply_axis_labels_from_env,
    apply_axis_overrides_from_env,
    apply_column_map_from_env,
    apply_paper_style,
    apply_series_colors_from_env,
    configure_axes_with_env,
    env_axes_size_cm,
    env_style_options,
    figure_with_fixed_axes_cm,
    series_legend_labels_from_pairs,
    save_svg_interactive,
    show_and_close,
)


def split_header_label_unit(header_text: str) -> tuple[str, str]:
    text = (header_text or "").strip()
    if not text:
        return "", ""
    if "/" in text:
        label, unit = text.rsplit("/", 1)
        return label.strip(), unit.strip()
    return text, ""


def env_float(name: str, default: float) -> float:
    value = os.getenv(name, "").strip()
    if not value:
        return default
    try:
        return float(value)
    except ValueError:
        return default


def parse_color_list(name: str) -> list[str]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return []
    return [c.strip() for c in raw.split(",") if c.strip()]


def resolve_series_color(token: str, fallback: str) -> str:
    lowered = (token or "").strip().lower()
    if lowered in {"", "auto", "__auto__", "default", "none"}:
        return fallback
    return token


sheet_number = int(os.getenv("PLOT_SHEET_NUMBER", "0"))
preset_xlsx_path = os.getenv("PLOT_XLSX_PATH")
bar_width = max(0.01, env_float("PLOT_BAR_WIDTH", 0.8))
bar_alpha = max(0.0, min(1.0, env_float("PLOT_BAR_ALPHA", 0.9)))
bar_edge_width = max(0.0, env_float("PLOT_BAR_EDGE_WIDTH", 0.4))
bar_edge_color = os.getenv("PLOT_BAR_EDGE_COLOR", "__AUTO__").strip()
line_colors = parse_color_list("PLOT_GENERIC_LINE_COLORS")
scatter_colors = parse_color_list("PLOT_GENERIC_SCATTER_COLORS")

df, sheet_name, column_names, book, dir_name, df_name = load_df_xlwings_with_dialog_and_names(
    sheet_index=sheet_number, xlsx_path=preset_xlsx_path
)

ax_w_cm, ax_h_cm = env_axes_size_cm(5.0, 3.0)
fig, ax = figure_with_fixed_axes_cm(ax_w_cm=ax_w_cm, ax_h_cm=ax_h_cm)
apply_plot_background_from_env(fig, ax)

style_options = dict(
    linewidth_scale=1.0,
    fontsize_tick_scale=1.0,
    fontsize_label_scale=1.0,
    data_line_scale=1.2,
)
style_options = env_style_options(style_options)
used = apply_paper_style(ax, ax_w_cm=ax_w_cm, **style_options)
_ = used

axis_options = dict(
    hide_xticklabels=False,
    hide_yticklabels=False,
    hide_xticks=False,
    hide_yticks=False,
    spine_left=True,
    spine_right=True,
    spine_top=True,
    spine_bottom=True,
    yaxis_right=False,
    xaxis_top=False,
)
configure_axes_with_env(ax, axis_options)

uniform_color = os.getenv("PLOT_SPINE_COLOR", "black")
spine_colors = {side: uniform_color for side in ("left", "right", "top", "bottom")}
for side, color in spine_colors.items():
    ax.spines[side].set_color(color)
ax.tick_params(axis="x", which="both", colors=spine_colors["bottom"])
ax.tick_params(axis="y", which="both", colors=spine_colors["left"])

default_pairs = [(column_names[0], column_names[1], 0, 0, COLORS["blue"][7])]
plot_pairs = apply_column_map_from_env(column_names, default_pairs)
plot_pairs = apply_series_colors_from_env(plot_pairs)
series_legend_labels = series_legend_labels_from_pairs(plot_pairs, column_names)

first_x_label, first_x_unit = split_header_label_unit(str(plot_pairs[0][0]))
first_y_label, first_y_unit = split_header_label_unit(str(plot_pairs[0][1]))
default_xlabel = first_x_label or str(plot_pairs[0][0])
default_ylabel = first_y_label or str(plot_pairs[0][1])
if first_x_unit:
    default_xlabel = f"{default_xlabel} ({first_x_unit})"
if first_y_unit:
    default_ylabel = f"{default_ylabel} ({first_y_unit})"
ax.set_xlabel(default_xlabel, color=spine_colors["bottom"], labelpad=0)
ax.set_ylabel(default_ylabel, color=spine_colors["left"], labelpad=0)
apply_axis_labels_from_env(ax)

first_x = plot_pairs[0][0]
x_numeric = pd.to_numeric(df[first_x], errors="coerce").to_numpy(dtype=float)
is_numeric_x = np.isfinite(x_numeric).all()

series_count = max(1, len(plot_pairs))
series_bar_w = bar_width / series_count
xticks_for_category = np.arange(len(df))

for i, (xcol, ycol, xoff, yoff, color) in enumerate(plot_pairs):
    ydata = pd.to_numeric(df[ycol], errors="coerce").to_numpy(dtype=float) + float(yoff)
    series_color = color
    if line_colors:
        series_color = resolve_series_color(line_colors[i % len(line_colors)], color)
    if scatter_colors:
        series_color = resolve_series_color(scatter_colors[i % len(scatter_colors)], series_color)
    offset = (i - (series_count - 1) / 2.0) * series_bar_w
    edge = series_color if bar_edge_color.lower() in {"", "auto", "__auto__", "default"} else bar_edge_color

    if is_numeric_x:
        xdata = pd.to_numeric(df[xcol], errors="coerce").to_numpy(dtype=float) + float(xoff) + offset
        finite_mask = np.isfinite(xdata) & np.isfinite(ydata)
        ax.bar(
            xdata[finite_mask],
            ydata[finite_mask],
            width=series_bar_w,
            color=series_color,
            edgecolor=edge,
            linewidth=bar_edge_width,
            alpha=bar_alpha,
            zorder=2,
            label=series_legend_labels[i],
        )
    else:
        xpos = xticks_for_category + offset
        finite_mask = np.isfinite(ydata)
        ax.bar(
            xpos[finite_mask],
            ydata[finite_mask],
            width=series_bar_w,
            color=series_color,
            edgecolor=edge,
            linewidth=bar_edge_width,
            alpha=bar_alpha,
            zorder=2,
            label=series_legend_labels[i],
        )

if not is_numeric_x:
    labels = [str(v) for v in df[first_x]]
    ax.set_xticks(xticks_for_category)
    ax.set_xticklabels(labels)

apply_axis_overrides_from_env(ax)

preview_only = os.getenv("PLOT_PREVIEW_ONLY", "0") == "1"
skip_show = os.getenv("PLOT_SKIP_SHOW", "0") == "1"
apply_preview_legend(ax)
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
        base_stem=os.path.splitext(df_name)[0],
        sheet_name=sheet_name,
        tight=True,
    )
    print("Saved to:", out_path)
    show_and_close(fig, show=not skip_show, close=False)
