# %%
import os

import numpy as np

from df_utils import load_df_xlwings_with_dialog_and_names
from plot_utils import (
    COLORS,
    apply_plot_background_from_env,
    apply_preview_legend,
    save_preview_png,
    apply_axis_overrides_from_env,
    apply_axis_labels_from_env,
    autoscale_axis_limits_from_data,
    configure_axes_with_env,
    env_axes_size_cm,
    env_style_options,
    apply_paper_style,
    configure_axes_options,
    figure_with_fixed_axes_cm,
    save_svg_interactive,
    show_and_close,
)

# %%
sheet_number = int(os.getenv("PLOT_SHEET_NUMBER", "0"))
preset_xlsx_path = os.getenv("PLOT_XLSX_PATH")

df, sheet_name, column_names, book, dir_name, df_name = load_df_xlwings_with_dialog_and_names(
    sheet_index=sheet_number,
    xlsx_path=preset_xlsx_path,
)
df_name_wo_ext = os.path.splitext(df_name)[0]

# 繧ｷ繝ｼ繝亥錐縺ｨdf縺ｮ陦ｨ遉ｺ
print(sheet_name)
df

# %%
# ---- 繝偵せ繝医げ繝ｩ繝蟇ｾ雎｡蛻励・螳夂ｾｩ
d_col = column_names[2]

# ---- log-normal fit縺ｮ縺溘ａ豁｣縺ｮ蛟､縺ｮ縺ｿ繧剃ｽｿ逕ｨ
d = df[d_col].astype(float).dropna()
d = d[d > 0].to_numpy()
if d.size == 0:
    raise ValueError(f"No positive values in column: {d_col}")

# ---- Axes鬆伜沺繧団m謖・ｮ・
ax_w_cm, ax_h_cm = env_axes_size_cm(3.0, 1.5)  # 蟷・ｼ晄ｨｪ霆ｸ髟ｷ縺・ 鬮倥＆・晉ｸｦ霆ｸ髟ｷ縺・
fig, ax = figure_with_fixed_axes_cm(ax_w_cm=ax_w_cm, ax_h_cm=ax_h_cm)
apply_plot_background_from_env(fig, ax)

# ===== 邱壹・螟ｪ縺輔ｄ繝輔か繝ｳ繝医し繧､繧ｺ縺ｮ蠕ｮ隱ｿ謨ｴ繧ｪ繝励す繝ｧ繝ｳ =====
STYLE_OPTIONS = dict(
    linewidth_scale=1.0,
    fontsize_tick_scale=1.0,
    fontsize_label_scale=1.0,
    data_line_scale=1.5,  # 邱壹・螟ｪ縺包ｼ嘖pine豈・
)
STYLE_OPTIONS = env_style_options(STYLE_OPTIONS)
# ===========================

used = apply_paper_style(ax, ax_w_cm=ax_w_cm, **STYLE_OPTIONS)
lw = used["data_linewidth"]

# ---- 繝偵せ繝医げ繝ｩ繝・磯ｻ蠎ｦ%・・
bin_width = 20
bins = np.arange(0, d.max() + bin_width, bin_width)
counts, edges = np.histogram(d, bins=bins)
freq = counts / counts.sum() * 100
centers = (edges[:-1] + edges[1:]) / 2

ax.bar(
    centers,
    freq,
    width=bin_width * 0.9,
    color=COLORS["blue"][4],
    edgecolor=COLORS["blue"][4],
    linewidth=lw * 0.8,
    label=str(d_col),
)

# ---- log-normal fit
ln_d = np.log(d)
mu = ln_d.mean()
sigma = ln_d.std(ddof=0)

x_fit = np.linspace(d.min(), d.max(), 500)
pdf = (1 / (x_fit * sigma * np.sqrt(2 * np.pi))) * np.exp(-((np.log(x_fit) - mu) ** 2) / (2 * sigma**2))
pdf_scaled = pdf * 100 * bin_width

ax.plot(x_fit, pdf_scaled, color=COLORS["red"][4], linewidth=lw, label=f"{d_col} fit")

autoscale_axis_limits_from_data(ax)
apply_axis_overrides_from_env(ax)

# ---- 繧医￥菴ｿ縺・ｻｸ繧ｪ繝励す繝ｧ繝ｳ
AXIS_OPTIONS = dict(
    hide_xticklabels=False,   # x霆ｸ謨ｰ蟄励ｒ豸医☆・・lt.xticks(color="None")逶ｸ蠖難ｼ・
    hide_yticklabels=False,   # y霆ｸ謨ｰ蟄励ｒ豸医☆
    hide_xticks=False,        # x霆ｸ逶ｮ逶帙ｊ邱壹ｒ豸医☆
    hide_yticks=False,        # y霆ｸ逶ｮ逶帙ｊ邱壹ｒ豸医☆
    spine_left=True,          # 霆ｸ繧呈ｶ医☆縺ｨ縺阪・False
    spine_right=True,
    spine_top=True,
    spine_bottom=True,
    yaxis_right=True,         # y霆ｸ繧貞承縺ｫ縺励◆縺代ｌ縺ｰ True
    xaxis_top=False,
)
configure_axes_with_env(ax, AXIS_OPTIONS)

# ---- 邵ｦ霆ｸ繝ｻ逶ｮ逶帷ｷ壹・濶ｲ繧貞､峨∴繧九が繝励す繝ｧ繝ｳ
uniform_color = os.getenv("PLOT_SPINE_COLOR", "black")  # 荳諡ｬ縺ｧ螟画峩縺吶ｋ蝣ｴ蜷・
spine_colors = {side: uniform_color for side in ("left", "right", "top", "bottom")}
# spine_colors = {"left": "red", "right": "blue", "top": "green", "bottom": "blue"} # 蜷・ｻｸ縺ｧ濶ｲ繧貞､峨∴繧句ｴ蜷・

for side, color in spine_colors.items():
    ax.spines[side].set_color(color)
ax.tick_params(axis="x", which="both", colors=spine_colors["bottom"])  # x霆ｸ逶ｮ逶帙ｊ邱壹・濶ｲ・捶霆ｸ縺ｨ蜷後§
ax.tick_params(axis="y", which="both", pad=2, colors=spine_colors["right"])   # y霆ｸ逶ｮ逶帙ｊ邱壹・濶ｲ・掣霆ｸ縺ｨ蜷後§

# ---- 繝ｩ繝吶Ν縺ｮ險ｭ螳・
ax.set_xlabel("Particle diameter (nm)", color=spine_colors["bottom"], labelpad=0)
ax.set_ylabel("Frequency (%)", color=spine_colors["right"], labelpad=2)
apply_axis_labels_from_env(ax)

# ---- 菫晏ｭ假ｼ亥・騾壼喧・・
preview_only = os.getenv("PLOT_PREVIEW_ONLY", "0") == "1"
skip_show = os.getenv("PLOT_SKIP_SHOW", "0") == "1"
apply_preview_legend(ax)

median = np.exp(mu)
mean = np.exp(mu + sigma**2 / 2)
print(f"Median (D50) = {median:.3f}")
print(f"Mean = {mean:.3f}")
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
        base_stem=df_name_wo_ext,
        transparent=False,
        tight=True,
    )
    print("Saved to:", out_path)
    show_and_close(fig, show=not skip_show, close=False)

# %%


