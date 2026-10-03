# %%
import os
from pathlib import Path
import numpy as np
from df_utils import load_df_xlwings_with_dialog_and_names, load_xpsfit_csv_table


# %%
sheet_number = int(os.getenv("PLOT_SHEET_NUMBER", "0"))
preset_xlsx_path = os.getenv("PLOT_XLSX_PATH")

is_csv_input = bool(preset_xlsx_path) and Path(preset_xlsx_path).suffix.lower() == ".csv"
if is_csv_input:
    csv_path = Path(preset_xlsx_path).expanduser()
    df, column_names = load_xpsfit_csv_table(csv_path)
    sheet_name = "CSV"
    book = None
    dir_name = str(csv_path.parent)
    df_name = csv_path.name
else:
    df, sheet_name, column_names, book, dir_name, df_name = \
        load_df_xlwings_with_dialog_and_names(sheet_index=sheet_number, xlsx_path=preset_xlsx_path)

print(sheet_name)


# %%
from plot_utils import (
    apply_plot_background_from_env,
    figure_with_fixed_axes_cm,
    apply_axis_overrides_from_env,
    apply_axis_labels_from_env,
    configure_axes_with_env,
    env_axes_size_cm,
    env_style_options,
    save_svg_interactive,
    show_and_close,
    apply_preview_legend,
    save_preview_png,
    apply_paper_style,
    COLORS,
)


df_name_wo_ext = os.path.splitext(df_name)[0]


def _env_float(name: str) -> float | None:
    raw = os.getenv(name, "").strip()
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _env_bool(name: str) -> bool | None:
    raw = os.getenv(name, "").strip().lower()
    if not raw:
        return None
    return raw in {"1", "true", "yes", "on"}


def _parse_fill_map(raw: str, ncols: int) -> list[tuple[int, int, int]]:
    rules: list[tuple[int, int, int]] = []
    for tok in [t.strip() for t in raw.split(",") if t.strip()]:
        parts = [p.strip() for p in tok.split(":")]
        if len(parts) != 3:
            continue
        try:
            xi, y1i, y2i = int(parts[0]), int(parts[1]), int(parts[2])
        except ValueError:
            continue
        if min(xi, y1i, y2i) < 0 or max(xi, y1i, y2i) >= ncols:
            continue
        rules.append((xi, y1i, y2i))
    return rules


def _parse_xy_pair(raw: str, ncols: int) -> tuple[int, int] | None:
    token = raw.strip()
    if not token or ":" not in token:
        return None
    xs, ys = [x.strip() for x in token.split(":", 1)]
    try:
        xi = int(xs)
        yi = int(ys)
    except ValueError:
        return None
    if min(xi, yi) < 0 or max(xi, yi) >= ncols:
        return None
    return (xi, yi)

layout = ""
fill_alpha = 0.25
fill_palette = [
    COLORS["red"][5],
    COLORS["red"][7],
    COLORS["blue"][5],
    COLORS["blue"][7],
]
csv_peak_mode = False
csv_has_fit = False

if is_csv_input:
    if len(column_names) < 8:
        raise ValueError("XPS CSV mode requires at least 8 columns (A..H).")
    layout = "csv_xps_fit"
    x_scatter_col = column_names[0]  # A: abscissa
    y_scatter_col = column_names[1]  # B: ordinate
    x_fit_col = column_names[0]      # A: abscissa
    y_bg_col = column_names[3]       # D: background
    y_fit_col = column_names[6] if len(column_names) > 6 else ""  # G: synthesize
    csv_has_fit = bool(y_fit_col)
    fill_rules = [(0, i, 3) for i in range(7, len(column_names))]  # H..: peak columns
    csv_peak_mode = True
    fill_alpha = 0.3
    if len(fill_rules) == 0:
        print("[WARN] CSV mode: no peak columns found from H onward.")
elif len(column_names) >= 10:
    layout = "au_10col"
    x_scatter_col = column_names[0]
    y_scatter_col = column_names[1]
    x_fit_col = column_names[3]
    y_fit_col = column_names[4]
    y_bg_col = column_names[5]
    fill_rules = [(3, i, 5) for i in range(6, 10)]  # x, y_upper, y_lower
elif len(column_names) >= 8:
    layout = "ag_8col"
    x_scatter_col = column_names[0]
    y_scatter_col = column_names[1]
    x_fit_col = column_names[0]
    y_fit_col = column_names[7]
    y_bg_col = column_names[2]
    fill_rules = [(0, 3, 2), (0, 4, 2)]  # x, y_upper, y_lower
    # Match the provided Ag reference SVG (red/blue, alpha=0.3)
    fill_alpha = 0.3
    fill_palette = [COLORS["red"][5], COLORS["blue"][5]]
else:
    raise ValueError(
        "XPS_fit_base.py requires CSV(A..H+) or >=10 columns (Au-like) "
        "or >=8 columns (Ag-like)."
    )

print(f"[INFO] Detected layout: {layout}")
print(f"[INFO] x_scatter={x_scatter_col}, y_scatter={y_scatter_col}")
if y_fit_col:
    print(f"[INFO] x_fit={x_fit_col}, y_fit={y_fit_col}, y_bg={y_bg_col}")
else:
    print(f"[INFO] x_fit={x_fit_col}, y_fit=<none>, y_bg={y_bg_col}")
print(f"[INFO] default_fill_rules={fill_rules}")

if not is_csv_input:
    custom_fill_rules = _parse_fill_map(os.getenv("PLOT_XPSFIT_FILL_MAP", ""), len(column_names))
    if custom_fill_rules:
        fill_rules = custom_fill_rules
        print(f"[INFO] custom_fill_rules={fill_rules}")

    custom_scatter_map = _parse_xy_pair(os.getenv("PLOT_XPSFIT_SCATTER_MAP", ""), len(column_names))
    if custom_scatter_map:
        x_scatter_col = column_names[custom_scatter_map[0]]
        y_scatter_col = column_names[custom_scatter_map[1]]
        print(f"[INFO] custom_scatter_map={custom_scatter_map}")

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

x_scatter = df[x_scatter_col].to_numpy(dtype=float)
y_scatter = df[y_scatter_col].to_numpy(dtype=float)
x_fit = df[x_fit_col].to_numpy(dtype=float)
y_fit = df[y_fit_col].to_numpy(dtype=float) if y_fit_col else np.array([])
y_bg = df[y_bg_col].to_numpy(dtype=float)

finite_x = x_fit[np.isfinite(x_fit)]
if finite_x.size > 0:
    ax.set_xlim(float(np.max(finite_x)), float(np.min(finite_x)))

y_max_candidates = []
if y_scatter.size:
    y_max_candidates.append(float(np.nanmax(y_scatter)))
if y_fit.size:
    y_max_candidates.append(float(np.nanmax(y_fit)))
if y_bg.size:
    y_max_candidates.append(float(np.nanmax(y_bg)))
for _, y1i, _ in fill_rules:
    y_comp = df[column_names[y1i]].to_numpy(dtype=float)
    if y_comp.size:
        if csv_peak_mode:
            y_upper = y_comp + y_bg
            y_max_candidates.append(float(np.nanmax(y_upper)))
        else:
            y_max_candidates.append(float(np.nanmax(y_comp)))
for _, _, y2i in fill_rules:
    y_base = df[column_names[y2i]].to_numpy(dtype=float)
    if y_base.size:
        y_max_candidates.append(float(np.nanmax(y_base)))

y_max = max([v for v in y_max_candidates if np.isfinite(v)] + [1.0])
ax.set_ylim(-0.1 * y_max, 1.1 * y_max)
apply_axis_overrides_from_env(ax)
if not ax.xaxis_inverted():
    ax.invert_xaxis()

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

ax.set_xlabel("Binding energy (eV)", color=spine_colors["bottom"], labelpad=0)
ax.set_ylabel("Intensity (arb. units)", color=spine_colors["left"], labelpad=0)
apply_axis_labels_from_env(ax)

if layout == "au_10col":
    show_bg_default = True
else:
    show_bg_default = False
show_bg_line = _env_bool("PLOT_XPSFIT_SHOW_BG_LINE")
if show_bg_line is None:
    show_bg_line = show_bg_default

bg_line_color = os.getenv("PLOT_XPSFIT_BG_LINE_COLOR", "").strip() or COLORS["gray"][6]
bg_lw_env = _env_float("PLOT_XPSFIT_BG_LINE_WIDTH")
if bg_lw_env is not None:
    if bg_lw_env <= 0:
        show_bg_line = False
    bg_lw = bg_lw_env
else:
    bg_lw = lw * 0.9
if show_bg_line:
    ax.plot(x_fit, y_bg, color=bg_line_color, linewidth=bg_lw)

raw_fill_colors = [s.strip() for s in os.getenv("PLOT_XPSFIT_FILL_COLORS", "").split(",") if s.strip()]
raw_fill_alphas = [s.strip() for s in os.getenv("PLOT_XPSFIT_FILL_ALPHAS", "").split(",") if s.strip()]

for i, (xi, y1i, y2i) in enumerate(fill_rules):
    x_fill = df[column_names[xi]].to_numpy(dtype=float)
    y_comp = df[column_names[y1i]].to_numpy(dtype=float)
    y_base = df[column_names[y2i]].to_numpy(dtype=float)
    if csv_peak_mode:
        y_upper = y_comp + y_bg
        y_lower = y_bg
    else:
        y_upper = y_comp
        y_lower = y_base
    fill_color = fill_palette[i % len(fill_palette)]
    if raw_fill_colors:
        c = raw_fill_colors[i % len(raw_fill_colors)]
        if c.lower() not in {"auto", "__auto__", "default"}:
            fill_color = c
    alpha = fill_alpha
    if raw_fill_alphas:
        try:
            alpha = float(raw_fill_alphas[i % len(raw_fill_alphas)])
        except ValueError:
            pass
    alpha = max(0.0, min(1.0, alpha))
    ax.fill_between(
        x_fill,
        y_upper,
        y_lower,
        linewidth=0.0,
        color=fill_color,
        alpha=alpha,
    )

# fit line defaults:
# - au_10col/csv_xps_fit: on
# - others: off
if layout in {"au_10col", "csv_xps_fit"}:
    show_fit_default = True
else:
    show_fit_default = False
show_fit_line = _env_bool("PLOT_XPSFIT_SHOW_FIT_LINE")
if show_fit_line is None:
    show_fit_line = show_fit_default
if is_csv_input and not csv_has_fit:
    show_fit_line = False
    print("[WARN] CSV mode: synthesize column (G) is missing; fit line disabled.")
fit_line_color = os.getenv("PLOT_XPSFIT_FIT_LINE_COLOR", "").strip() or COLORS["black"][9]
fit_lw_env = _env_float("PLOT_XPSFIT_FIT_LINE_WIDTH")
if fit_lw_env is not None:
    if fit_lw_env <= 0:
        show_fit_line = False
    fit_lw = fit_lw_env
else:
    fit_lw = lw * 1.2
if show_fit_line:
    ax.plot(x_fit, y_fit, color=fit_line_color, linewidth=fit_lw)

# scatter: x=0, y=1
scatter_size = _env_float("PLOT_XPSFIT_SCATTER_SIZE")
scatter_edge_width = _env_float("PLOT_XPSFIT_SCATTER_EDGE_WIDTH")
scatter_alpha = _env_float("PLOT_XPSFIT_SCATTER_ALPHA")
scatter_edge_color = os.getenv("PLOT_XPSFIT_SCATTER_EDGE_COLOR", "").strip() or "k"
scatter_face_color = os.getenv("PLOT_XPSFIT_SCATTER_FACE_COLOR", "").strip() or "white"
ax.scatter(
    x_scatter,
    y_scatter,
    s=10 if scatter_size is None else scatter_size,
    linewidth=0.5 if scatter_edge_width is None else scatter_edge_width,
    edgecolor=scatter_edge_color,
    color=scatter_face_color,
    alpha=0.6 if scatter_alpha is None else max(0.0, min(1.0, scatter_alpha)),
)

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


