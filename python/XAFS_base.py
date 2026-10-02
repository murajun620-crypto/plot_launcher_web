# %%
import os
import numpy as np
from df_utils import load_df_xlwings_with_dialog_and_names


# %%
sheet_number = int(os.getenv("PLOT_SHEET_NUMBER", "0"))
preset_xlsx_path = os.getenv("PLOT_XLSX_PATH")

df, sheet_name, column_names, book, dir_name, df_name = \
    load_df_xlwings_with_dialog_and_names(sheet_index=sheet_number, xlsx_path=preset_xlsx_path)

print(sheet_name)
df


# %%
from plot_utils import (
    apply_plot_background_from_env,
    figure_with_fixed_axes_cm,
    apply_axis_overrides_from_env,
    apply_axis_labels_from_env,
    apply_column_map_from_env,
    apply_series_colors_from_env,
    configure_axes_with_env,
    env_axes_size_cm,
    env_style_options,
    save_svg_interactive,
    show_and_close,
    apply_preview_legend,
    save_preview_png,
    apply_paper_style,
    line_width_for_series,
    parse_nonnegative_float_list,
    plot_pair_column_indices,
    series_legend_labels_from_pairs,
    COLORS,
)


df_name_wo_ext = os.path.splitext(df_name)[0]

# Default axes area in cm
ax_w_cm, ax_h_cm = env_axes_size_cm(4, 3)
fig, ax = figure_with_fixed_axes_cm(ax_w_cm=ax_w_cm, ax_h_cm=ax_h_cm)
apply_plot_background_from_env(fig, ax)

STYLE_OPTIONS = dict(
    linewidth_scale=1.0,
    fontsize_tick_scale=1.0,
    fontsize_label_scale=1.0,
    data_line_scale=1.0,
)
STYLE_OPTIONS = env_style_options(STYLE_OPTIONS)
used = apply_paper_style(ax, ax_w_cm=ax_w_cm, **STYLE_OPTIONS)
lw = used["data_linewidth"]

# Default mapping (x=0, y=1). Launcher can override by PLOT_COLUMN_MAP.
plot_pairs = [
    (column_names[0], column_names[1], 0.0, 0.0, COLORS["blue"][7]),
]
plot_pairs = apply_column_map_from_env(column_names, plot_pairs)
plot_pairs = apply_series_colors_from_env(plot_pairs)
line_widths = parse_nonnegative_float_list("PLOT_GENERIC_LINE_WIDTHS")
series_legend_labels = series_legend_labels_from_pairs(plot_pairs, column_names)
plot_pair_indices = plot_pair_column_indices(plot_pairs, column_names)

all_x: list[np.ndarray] = []
all_y: list[np.ndarray] = []
for i, (xcol, ycol, xoff, yoff, color) in enumerate(plot_pairs):
    x_idx, y_idx = plot_pair_indices[i]
    x = df.iloc[:, x_idx].to_numpy(dtype=float) + float(xoff)
    y = df.iloc[:, y_idx].to_numpy(dtype=float) + float(yoff)
    all_x.append(x)
    all_y.append(y)
    ax.plot(x, y, linewidth=line_width_for_series(line_widths, i, lw), color=color, label=series_legend_labels[i])

# Auto limits from plotted data unless env override is provided.
if all_x and all_y:
    x_concat = np.concatenate(all_x)
    y_concat = np.concatenate(all_y)
    x_valid = x_concat[np.isfinite(x_concat)]
    y_valid = y_concat[np.isfinite(y_concat)]
    if x_valid.size > 1:
        xmin = float(np.min(x_valid))
        xmax = float(np.max(x_valid))
        if xmin != xmax:
            ax.set_xlim(xmin, xmax)
    if y_valid.size > 0:
        ymin = float(np.min(y_valid))
        ymax = float(np.max(y_valid))
        if np.isfinite(ymin) and np.isfinite(ymax):
            if ymin == ymax:
                pad = 1.0 if ymin == 0 else abs(ymin) * 0.1
                ax.set_ylim(ymin - pad, ymax + pad)
            else:
                pad = (ymax - ymin) * 0.1
                ax.set_ylim(ymin - pad, ymax + pad)
apply_axis_overrides_from_env(ax)

AXIS_OPTIONS = dict(
    hide_xticklabels=False,
    hide_yticklabels=True,
    hide_xticks=False,
    hide_yticks=True,
    spine_left=True,
    spine_right=True,
    spine_top=True,
    spine_bottom=True,
    yaxis_right=False,
    xaxis_top=False,
)
configure_axes_with_env(ax, AXIS_OPTIONS)

uniform_color = os.getenv("PLOT_SPINE_COLOR", "black")
spine_colors = {side: uniform_color for side in ("left", "right", "top", "bottom")}
for side, color in spine_colors.items():
    ax.spines[side].set_color(color)
ax.tick_params(axis="x", which="both", colors=spine_colors["bottom"])
ax.tick_params(axis="y", which="both", colors=spine_colors["left"])

ax.set_xlabel("Photon energy (eV)", color=spine_colors["bottom"], labelpad=0)
ax.set_ylabel("Intensity (arb. units)", color=spine_colors["left"], labelpad=0)
apply_axis_labels_from_env(ax)

preview_only = os.getenv("PLOT_PREVIEW_ONLY", "0") == "1"
skip_show = os.getenv("PLOT_SKIP_SHOW", "0") == "1"
apply_preview_legend(ax)
ymin, ymax = ax.get_ylim()
print("ymax =", ymax)
if preview_only:
    preview_path = os.getenv("PLOT_PREVIEW_PATH", "").strip()
    if preview_path:
        save_preview_png(fig, preview_path)
    print("[PREVIEW] Save skipped.")
    show_and_close(fig, show=not skip_show, close=False)
else:
    out_path = save_svg_interactive(fig, out_dir=dir_name, base_stem=df_name_wo_ext, sheet_name=sheet_name, tight=True)
    print("Saved to:", out_path)
    show_and_close(fig, show=not skip_show, close=False)



