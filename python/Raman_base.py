# %%
import os
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

# Axis limits/ticks are controlled from GUI/env. No fixed Raman range.
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

ax.set_xlabel("Raman shift (cm$^{-1}$)", color=spine_colors["bottom"], labelpad=0)
ax.set_ylabel("Intensity (arb. units)", color=spine_colors["left"], labelpad=0)
apply_axis_labels_from_env(ax)

default_series = [
    (0, 0.002, COLORS["blue"][5]),
    (0, 0.004, COLORS["blue"][9]),
    (0, 0.0002, COLORS["black"][2]),
]
plot_pairs = []
for idx, y_idx in enumerate(range(1, len(column_names))):
    xoff, yoff, color = default_series[idx % len(default_series)]
    plot_pairs.append((column_names[0], column_names[y_idx], xoff, yoff, color))
if not plot_pairs:
    raise ValueError("Raman plot requires at least one x column and one y column.")
plot_pairs = apply_column_map_from_env(column_names, plot_pairs)
plot_pairs = apply_series_colors_from_env(plot_pairs)
line_widths = parse_nonnegative_float_list("PLOT_GENERIC_LINE_WIDTHS")
series_legend_labels = series_legend_labels_from_pairs(plot_pairs, column_names)
plot_pair_indices = plot_pair_column_indices(plot_pairs, column_names)

for i, (xcol, ycol, xoff, yoff, color) in enumerate(plot_pairs):
    x_idx, y_idx = plot_pair_indices[i]
    ax.plot(df.iloc[:, x_idx] + xoff, df.iloc[:, y_idx] + yoff, linewidth=line_width_for_series(line_widths, i, lw), color=color, label=series_legend_labels[i])

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



