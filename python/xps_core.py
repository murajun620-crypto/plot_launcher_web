# %%
import os
import numpy as np
from df_utils import load_df_xlwings_with_dialog_and_names


# %%
sheet_number = int(os.getenv("PLOT_SHEET_NUMBER", "0"))
preset_xlsx_path = os.getenv("PLOT_XLSX_PATH")

df, sheet_name, column_names, book, dir_name, df_name = \
    load_df_xlwings_with_dialog_and_names(sheet_index=sheet_number, xlsx_path=preset_xlsx_path)

# 繧ｷ繝ｼ繝亥錐縺ｨdf縺ｮ陦ｨ遉ｺ
print(sheet_name)
df

# %%
from plot_utils import (
    apply_plot_background_from_env,
    figure_with_fixed_axes_cm,
    configure_axes_options,
    apply_axis_overrides_from_env,
    apply_axis_labels_from_env,
    apply_column_map_from_env,
    apply_series_colors_from_env,
    autoscale_axis_limits_from_data,
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

# ---- Axes鬆伜沺繧団m謖・ｮ・
ax_w_cm, ax_h_cm = env_axes_size_cm(4, 3)  # 蟷・ｼ晄ｨｪ霆ｸ髟ｷ縺・ 鬮倥＆・晉ｸｦ霆ｸ髟ｷ縺・

fig, ax = figure_with_fixed_axes_cm(ax_w_cm=ax_w_cm, ax_h_cm=ax_h_cm)
apply_plot_background_from_env(fig, ax)

# ===== 邱壹・螟ｪ縺輔ｄ繝輔か繝ｳ繝医し繧､繧ｺ縺ｮ蠕ｮ隱ｿ謨ｴ繧ｪ繝励す繝ｧ繝ｳ =====
STYLE_OPTIONS = dict(
    linewidth_scale=1.0,
    fontsize_tick_scale=1.0,
    fontsize_label_scale=1.0,
    data_line_scale=1.0,  # 繝励Ο繝・ヨ縺ｮ邱壹・螟ｪ縺包ｼ嘖pine豈・
)
STYLE_OPTIONS = env_style_options(STYLE_OPTIONS)
# ===========================

used = apply_paper_style(ax, ax_w_cm=ax_w_cm, **STYLE_OPTIONS)
lw = used["data_linewidth"]
# ---- 繧医￥菴ｿ縺・ｻｸ繧ｪ繝励す繝ｧ繝ｳ
AXIS_OPTIONS = dict(
    hide_xticklabels=False,   # x霆ｸ謨ｰ蟄励ｒ豸医☆・・lt.xticks(color="None")逶ｸ蠖難ｼ・
    hide_yticklabels=True,   # y霆ｸ謨ｰ蟄励ｒ豸医☆
    hide_xticks=False,        # x霆ｸ逶ｮ逶帙ｊ邱壹ｒ豸医☆
    hide_yticks=True,        # y霆ｸ逶ｮ逶帙ｊ邱壹ｒ豸医☆
    spine_left=True,          # 霆ｸ繧呈ｶ医☆縺ｨ縺阪・False
    spine_right=True,
    spine_top=True,
    spine_bottom=True,
    yaxis_right=False,        # y霆ｸ繧貞承縺ｫ縺励◆縺代ｌ縺ｰ True
    xaxis_top=False,
)
configure_axes_with_env(ax, AXIS_OPTIONS)

# ---- 邵ｦ霆ｸ繝ｻ逶ｮ逶帷ｷ壹・濶ｲ繧貞､峨∴繧九が繝励す繝ｧ繝ｳ
uniform_color = os.getenv("PLOT_SPINE_COLOR", "black")  # 荳諡ｬ縺ｧ螟画峩縺吶ｋ蝣ｴ蜷・
spine_colors = {side: uniform_color for side in ("left", "right", "top", "bottom")}
# spine_colors = {"left": "red", "right": "blue", "top": "green","bottom": "blue"} # 蜷・ｻｸ縺ｧ濶ｲ繧貞､峨∴繧句ｴ蜷・

for side, color in spine_colors.items():
    ax.spines[side].set_color(color)
ax.tick_params(axis="x", which="both", colors=spine_colors["bottom"])  # x霆ｸ逶ｮ逶帙ｊ邱壹・濶ｲ・捶霆ｸ縺ｨ蜷後§
ax.tick_params(axis="y", which="both", colors=spine_colors["left"])    # y霆ｸ逶ｮ逶帙ｊ邱壹・濶ｲ・掣霆ｸ縺ｨ蜷後§

# ---- 繝ｩ繝吶Ν縺ｮ險ｭ螳・
ax.set_xlabel("Binding energy (eV)", color=spine_colors["bottom"], labelpad=0)
ax.set_ylabel("Intensity (arb. units)", color=spine_colors["left"], labelpad=0)
apply_axis_labels_from_env(ax)

# ---- x霆ｸ縲【霆ｸ縺ｮ螳夂ｾｩ
# 菴ｿ逕ｨ縺ｧ縺阪ｋcolor縺ｯ縲｜lack / blue / orange / green / purple / gray / red・・=阮・＞, 9=豼・＞・・
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
    raise ValueError("XPS Core plot requires at least one x column and one y column.")
plot_pairs = apply_column_map_from_env(column_names, plot_pairs)
plot_pairs = apply_series_colors_from_env(plot_pairs)
line_widths = parse_nonnegative_float_list("PLOT_GENERIC_LINE_WIDTHS")
series_legend_labels = series_legend_labels_from_pairs(plot_pairs, column_names)
plot_pair_indices = plot_pair_column_indices(plot_pairs, column_names)

# ---- 繝励Ο繝・ヨ・医ョ繝ｼ繧ｿ萓晏ｭ倥↑縺ｮ縺ｧ繝｡繧､繝ｳ・・
for i, (xcol, ycol, xoff, yoff, color) in enumerate(plot_pairs):
    x_idx, y_idx = plot_pair_indices[i]
    ax.plot(df.iloc[:, x_idx] + xoff, df.iloc[:, y_idx] + yoff, linewidth=line_width_for_series(line_widths, i, lw), color=color, label=series_legend_labels[i])

autoscale_axis_limits_from_data(ax, invert_x=True)
apply_axis_overrides_from_env(ax)
if not ax.xaxis_inverted():
    ax.invert_xaxis()
configure_axes_with_env(ax, AXIS_OPTIONS)

# ---- 菫晏ｭ假ｼ亥・騾壼喧・・
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

# %%



