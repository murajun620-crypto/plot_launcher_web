# %%
import os
import numpy as np
from df_utils import load_df_xlwings_with_dialog_and_names


# %%
sheet_number = int(os.getenv("PLOT_SHEET_NUMBER", "0"))
preset_xlsx_path = os.getenv("PLOT_XLSX_PATH")

df, sheet_name, column_names, book, dir_name, df_name = \
    load_df_xlwings_with_dialog_and_names(sheet_index=sheet_number, xlsx_path=preset_xlsx_path)

# シート名とdfの表示
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

# test change 2

df_name_wo_ext = os.path.splitext(df_name)[0]

# ---- Axes領域をcm指定
ax_w_cm, ax_h_cm = env_axes_size_cm(5.4, 3) # 幅＝横軸長さ, 高さ＝縦軸長さ

fig, ax = figure_with_fixed_axes_cm(ax_w_cm=ax_w_cm, ax_h_cm=ax_h_cm)
apply_plot_background_from_env(fig, ax)

# ===== 線の太さやフォントサイズの微調整オプション =====
STYLE_OPTIONS = dict(
    linewidth_scale=1.0,
    fontsize_tick_scale=1.0,
    fontsize_label_scale=1.0,
    data_line_scale=1.5,  # プロットの線の太さ：spine比
)
STYLE_OPTIONS = env_style_options(STYLE_OPTIONS)
# ===========================

used = apply_paper_style(ax, ax_w_cm=ax_w_cm, **STYLE_OPTIONS)
lw = used["data_linewidth"]

# ---- よく使う軸オプション
AXIS_OPTIONS = dict(
    hide_xticklabels=False,   # x軸数字を消す（plt.xticks(color="None")相当）
    hide_yticklabels=True,    # y軸数字を消す
    hide_xticks=False,        # x軸目盛り線を消す
    hide_yticks=True,         # y軸目盛り線を消す
    spine_left=True,          # 軸を消すときはFalse
    spine_right=True,
    spine_top=True,
    spine_bottom=True,
    yaxis_right=False,        # y軸を右にしたければ True
    xaxis_top=False,
)
configure_axes_with_env(ax, AXIS_OPTIONS)

# ---- 縦軸・目盛線の色を変えるオプション
uniform_color = os.getenv("PLOT_SPINE_COLOR", "black") #一括で変更する場合
spine_colors = {side: uniform_color for side in ("left", "right", "top", "bottom")} 
# spine_colors = {"left": "red", "right": "blue", "top": "green","bottom": "blue"} # 各軸で色を変える場合

for side, color in spine_colors.items():
    ax.spines[side].set_color(color)
ax.tick_params(axis="x", which="both", colors=spine_colors["bottom"]) # x軸目盛り線の色＝x軸と同じ
ax.tick_params(axis="y", which="both", colors=spine_colors["left"]) # y軸目盛り線の色＝y軸と同じ

# ---- ラベルの設定
ax.set_xlabel("Energy (keV)", color=spine_colors["bottom"], labelpad=0)
ax.set_ylabel("Intensity (arb. units)", color=spine_colors["left"], labelpad=0)
apply_axis_labels_from_env(ax)

# ---- x軸、y軸の定義
# 使用できるcolorは、black / blue / orange / green / purple / gray / red（0=薄い, 5=濃い）
default_series = [
    (0, 400, COLORS["green"][7]),
    (0, 1400, COLORS["purple"][7]),
    (0, 2800, COLORS["red"][7]),
]
plot_pairs = []
for idx, y_idx in enumerate(range(1, len(column_names))):
    xoff, yoff, color = default_series[idx % len(default_series)]
    plot_pairs.append((column_names[0], column_names[y_idx], xoff, yoff, color))
if not plot_pairs:
    raise ValueError("EDX plot requires at least one x column and one y column.")
plot_pairs = apply_column_map_from_env(column_names, plot_pairs)
plot_pairs = apply_series_colors_from_env(plot_pairs)
line_widths = parse_nonnegative_float_list("PLOT_GENERIC_LINE_WIDTHS")
series_legend_labels = series_legend_labels_from_pairs(plot_pairs, column_names)
plot_pair_indices = plot_pair_column_indices(plot_pairs, column_names)

# ---- プロット（データ依存なのでメイン）
lw = used["data_linewidth"]
for i, (xcol, ycol, xoff, yoff, color) in enumerate(plot_pairs):
    x_idx, y_idx = plot_pair_indices[i]
    ax.plot(df.iloc[:, x_idx] + xoff, df.iloc[:, y_idx] + yoff, linewidth=line_width_for_series(line_widths, i, lw), color=color, label=series_legend_labels[i])

autoscale_axis_limits_from_data(ax)
apply_axis_overrides_from_env(ax)

# ---- 保存（共通化）
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





