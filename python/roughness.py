# %%
import os
import numpy as np
from matplotlib import colors as mpl_colors

from df_utils import load_df_xlwings_with_dialog_and_names
from plot_utils import (
    COLORS,
    apply_plot_background_from_env,
    apply_preview_legend,
    save_preview_png,
    apply_axis_overrides_from_env,
    apply_axis_labels_from_env,
    apply_column_map_from_env,
    apply_series_colors_from_env,
    autoscale_axis_limits_from_data,
    configure_axes_with_env,
    env_axes_size_cm,
    env_style_options,
    figure_with_fixed_axes_cm,
    plot_pair_column_indices,
    save_svg_interactive,
    series_legend_labels_from_pairs,
    show_and_close,
    apply_paper_style,
)


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


def parse_token_list(name: str) -> list[str]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return []
    return [c.strip() for c in raw.split(",") if c.strip()]


def parse_nonnegative_float_list(name: str) -> list[float]:
    values: list[float] = []
    for token in os.getenv(name, "").split(","):
        try:
            values.append(max(0.0, float(token.strip())))
        except ValueError:
            values.append(float("nan"))
    return values if any(np.isfinite(value) for value in values) else []



def parse_int_list(name: str) -> list[int]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return []
    values = []
    for token in raw.split(","):
        try:
            values.append(int(token.strip()))
        except Exception:
            values.append(-1)
    return values


def error_settings_from_env() -> tuple[list[str], list[int], list[int], list[int], float, float, float]:
    modes = [v.strip().lower() for v in os.getenv("PLOT_GENERIC_ERROR_MODES", "").split(",")]
    if modes == [""]:
        modes = []
    return (
        modes,
        parse_int_list("PLOT_GENERIC_ERROR_COLS"),
        parse_int_list("PLOT_GENERIC_ERROR_MIN_COLS"),
        parse_int_list("PLOT_GENERIC_ERROR_MAX_COLS"),
        max(0.0, env_float("PLOT_GENERIC_ERROR_LINEWIDTH", 0.8)),
        max(0.0, env_float("PLOT_GENERIC_ERROR_CAPSIZE", 3.0)),
        max(0.0, env_float("PLOT_GENERIC_ERROR_CAPTHICK", 0.8)),
    )


def value_at(values: list, index: int, default):
    return values[index] if 0 <= index < len(values) else default

def clamp_alpha(value: float, fallback: float) -> float:
    try:
        parsed = float(value)
    except Exception:
        parsed = fallback
    if not np.isfinite(parsed):
        parsed = fallback
    return max(0.0, min(1.0, parsed))

def color_with_alpha(color: str, alpha: float):
    if str(color).strip().lower() == "none":
        return "none"
    try:
        return mpl_colors.to_rgba(color, alpha=alpha)
    except Exception:
        return mpl_colors.to_rgba("#1F77B4", alpha=alpha)

def resolve_series_color(token: str, fallback: str) -> str:
    lowered = (token or "").strip().lower()
    if lowered in {"", "auto", "__auto__", "default", "none"}:
        return fallback
    return token


def resolve_scatter_color(raw_color: str, series_color: str, *, allow_none: bool = False) -> str:
    token = (raw_color or "").strip()
    lowered = token.lower()
    if lowered in {"", "auto", "__auto__", "default"}:
        return series_color
    if allow_none and lowered == "none":
        return "none"
    return token


# %%
sheet_number = int(os.getenv("PLOT_SHEET_NUMBER", "0"))
preset_xlsx_path = os.getenv("PLOT_XLSX_PATH")

df, sheet_name, column_names, book, dir_name, df_name = load_df_xlwings_with_dialog_and_names(
    sheet_index=sheet_number,
    xlsx_path=preset_xlsx_path,
)
print(sheet_name)

if len(column_names) < 2:
    raise ValueError("Roughness plot requires at least one x column and one y column.")

df_name_wo_ext = os.path.splitext(df_name)[0]

# %%
# Roughness専用の既定値
# - X: Polishing time (min)
# - Y: Surface roughness (nm)
# - Y軸: GUI指定（既定値はGUI側で設定）
# - 描画: line + scatter
ax_w_cm, ax_h_cm = env_axes_size_cm(4.0, 3.0)
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
lw = used["data_linewidth"]

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

ax.set_xlabel("Polishing time (min)", color=spine_colors["bottom"], labelpad=0)
ax.set_ylabel("Surface roughness (nm)", color=spine_colors["left"], labelpad=0)
apply_axis_labels_from_env(ax)

# 既定は 1列目をX、2列目以降をY系列にする。
default_colors = [
    COLORS["blue"][7],
    COLORS["black"][7],
    COLORS["red"][7],
    COLORS["green"][7],
    COLORS["orange"][7],
    COLORS["purple"][7],
    COLORS["gray"][7],
]
plot_pairs = []
for idx, y_idx in enumerate(range(1, len(column_names))):
    plot_pairs.append(
        (column_names[0], column_names[y_idx], 0, 0, default_colors[idx % len(default_colors)])
    )

plot_pairs = apply_column_map_from_env(column_names, plot_pairs)
plot_pairs = apply_series_colors_from_env(plot_pairs)
series_legend_labels = series_legend_labels_from_pairs(plot_pairs, column_names)
plot_pair_indices = plot_pair_column_indices(plot_pairs, column_names)

line_colors = parse_color_list("PLOT_GENERIC_LINE_COLORS")
scatter_colors = parse_color_list("PLOT_GENERIC_SCATTER_COLORS")
markers = parse_token_list("PLOT_GENERIC_MARKERS")
linestyles = parse_token_list("PLOT_GENERIC_LINESTYLES")
scatter_sizes = parse_nonnegative_float_list("PLOT_GENERIC_SCATTER_SIZES")
line_widths = parse_nonnegative_float_list("PLOT_GENERIC_LINE_WIDTHS")
marker_edge_colors = parse_color_list("PLOT_GENERIC_MARKER_EDGE_COLORS")
marker_face_colors = parse_color_list("PLOT_GENERIC_MARKER_FACE_COLORS")
marker_alphas = parse_nonnegative_float_list("PLOT_GENERIC_MARKER_ALPHAS")
line_alphas = parse_nonnegative_float_list("PLOT_GENERIC_LINE_ALPHAS")
marker_edge_alphas = parse_nonnegative_float_list("PLOT_GENERIC_MARKER_EDGE_ALPHAS")
marker_face_alphas = parse_nonnegative_float_list("PLOT_GENERIC_MARKER_FACE_ALPHAS")
error_modes, error_cols, error_min_cols, error_max_cols, error_linewidth, error_capsize, error_capthick = error_settings_from_env()
yscale = os.getenv("PLOT_YSCALE", "log").strip().lower() or "log"
is_log_y = yscale == "log"

scatter_size = env_float("PLOT_GENERIC_SCATTER_SIZE", 18.0)
scatter_edge_color = os.getenv("PLOT_GENERIC_SCATTER_EDGE_COLOR", os.getenv("PLOT_MARKER_EDGE_COLOR", "__AUTO__")).strip()
scatter_edge_width = env_float("PLOT_GENERIC_SCATTER_EDGE_WIDTH", 0.6)
scatter_face_color = os.getenv("PLOT_GENERIC_SCATTER_FACE_COLOR", os.getenv("PLOT_MARKER_FACE_COLOR", "__AUTO__")).strip()
scatter_alpha_name = "PLOT_GENERIC_SCATTER_ALPHA" if os.getenv("PLOT_GENERIC_SCATTER_ALPHA") is not None else "PLOT_MARKER_ALPHA"
scatter_alpha = max(0.0, min(1.0, env_float(scatter_alpha_name, 0.8)))

legend_handles = []
legend_labels = []
for i, (xcol, ycol, xoff, yoff, color) in enumerate(plot_pairs):
    x_idx, y_idx = plot_pair_indices[i]
    xdata = df.iloc[:, x_idx] + xoff
    ydata = df.iloc[:, y_idx] + yoff

    x_arr = np.asarray(xdata, dtype=float)
    y_arr = np.asarray(ydata, dtype=float)
    mask = np.isfinite(x_arr) & np.isfinite(y_arr)
    if is_log_y:
        mask &= y_arr > 0
    x_plot = x_arr[mask]
    y_plot = y_arr[mask]

    series_line_color = color
    series_scatter_color = color
    if line_colors:
        series_line_color = resolve_series_color(line_colors[i % len(line_colors)], color)
    if scatter_colors:
        series_scatter_color = resolve_series_color(scatter_colors[i % len(scatter_colors)], color)

    series_line_width = value_at(line_widths, i, lw)
    if not np.isfinite(series_line_width):
        series_line_width = lw
    series_line_alpha = clamp_alpha(value_at(line_alphas, i, 1.0), 1.0)
    series_linestyle = value_at(linestyles, i, "-")
    if series_linestyle not in {"-", "--", "-.", ":"}:
        series_linestyle = "-"
    (line_handle,) = ax.plot(
        x_plot,
        y_plot,
        linewidth=series_line_width,
        linestyle=series_linestyle,
        color=series_line_color,
        alpha=series_line_alpha,
        zorder=2,
        label=series_legend_labels[i],
    )
    face = resolve_scatter_color(value_at(marker_face_colors, i, scatter_face_color), series_scatter_color, allow_none=True)
    edge = resolve_scatter_color(value_at(marker_edge_colors, i, scatter_edge_color), series_scatter_color, allow_none=True)
    series_marker_alpha = value_at(marker_alphas, i, scatter_alpha)
    series_marker_alpha = clamp_alpha(series_marker_alpha, scatter_alpha)
    series_marker_edge_alpha = clamp_alpha(value_at(marker_edge_alphas, i, series_marker_alpha), series_marker_alpha)
    series_marker_face_alpha = clamp_alpha(value_at(marker_face_alphas, i, series_marker_alpha), series_marker_alpha)
    edge = color_with_alpha(edge, series_marker_edge_alpha)
    face = color_with_alpha(face, series_marker_face_alpha)
    series_scatter_size = value_at(scatter_sizes, i, scatter_size)
    if not np.isfinite(series_scatter_size):
        series_scatter_size = scatter_size
    series_marker = value_at(markers, i, "o") or "o"
    if series_marker not in {"o", "s", "^", "v", "D", "+", "x", "*", "p", "h"}:
        series_marker = "o"
    ax.scatter(
        x_plot,
        y_plot,
        marker=series_marker,
        s=series_scatter_size,
        facecolors=face,
        edgecolors=edge,
        linewidths=scatter_edge_width,
        zorder=3,
        label="_nolegend_",
    )


    error_mode = value_at(error_modes, i, "none")
    if error_mode in {"symmetric", "minmax"}:
        err_mask = mask.copy()
        lower = upper = None
        if error_mode == "symmetric":
            col_idx = value_at(error_cols, i, -1)
            if 0 <= col_idx < len(column_names):
                err = np.asarray(df.iloc[:, col_idx], dtype=float)
                lower = err
                upper = err
                err_mask &= np.isfinite(err) & (err >= 0)
                if is_log_y:
                    err_mask &= (y_arr - err) > 0
            else:
                err_mask[:] = False
        else:
            min_idx = value_at(error_min_cols, i, -1)
            max_idx = value_at(error_max_cols, i, -1)
            if 0 <= min_idx < len(column_names) and 0 <= max_idx < len(column_names):
                raw_y = np.asarray(df.iloc[:, y_idx], dtype=float)
                min_values = np.asarray(df.iloc[:, min_idx], dtype=float)
                max_values = np.asarray(df.iloc[:, max_idx], dtype=float)
                lower = raw_y - min_values
                upper = max_values - raw_y
                err_mask &= (np.isfinite(lower) & np.isfinite(upper) &
                             (lower >= 0) & (upper >= 0))
                if is_log_y:
                    err_mask &= (y_arr - lower) > 0
            else:
                err_mask[:] = False
        if lower is not None and np.any(err_mask):
            ax.errorbar(
                x_arr[err_mask], y_arr[err_mask],
                yerr=np.vstack((lower[err_mask], upper[err_mask])),
                fmt="none", ecolor=series_scatter_color,
                elinewidth=error_linewidth, capsize=error_capsize,
                capthick=error_capthick, zorder=1,
                label="_nolegend_",
            )

    legend_label = series_legend_labels[i]
    if legend_label:
        legend_handles.append(line_handle)
        legend_labels.append(legend_label)

# 軸範囲をデータから設定してから、GUIの範囲・目盛指定を反映する。
autoscale_axis_limits_from_data(ax)
apply_axis_overrides_from_env(ax)

# apply_axis_overrides_from_env() applies the GUI-selected scale.
# Only log scale needs a positive lower-limit safeguard.
if is_log_y:
    ymin, ymax = ax.get_ylim()
    if ymin <= 0:
        positive_values = []
        for pair_index, (_, _ycol, _, yoff, _) in enumerate(plot_pairs):
            _x_idx, y_idx = plot_pair_indices[pair_index]
            vals = np.asarray(df.iloc[:, y_idx] + yoff, dtype=float)
            vals = vals[np.isfinite(vals) & (vals > 0)]
            if vals.size:
                positive_values.append(vals.min())
        if positive_values:
            ax.set_ylim(min(positive_values) * 0.8, ymax)

hide_minorticks_env = os.getenv("PLOT_HIDE_MINORTICKS", "").strip().lower() in {"1", "true", "yes", "on"}
if not hide_minorticks_env:
    ax.minorticks_on()
    ax.tick_params(
        axis="both",
        which="minor",
        direction="in",
        width=used["spine_linewidth"],
        length=used["minor_tick_length"],
    )

preview_only = os.getenv("PLOT_PREVIEW_ONLY", "0") == "1"
skip_show = os.getenv("PLOT_SKIP_SHOW", "0") == "1"
apply_preview_legend(ax, handles=legend_handles, labels=legend_labels, fontsize=7)

if preview_only:
    preview_path = os.getenv("PLOT_PREVIEW_PATH", "").strip()
    if preview_path:
        # Exclude ticks outside visible limits from the preview tight bbox.
        for axis, limits in ((ax.xaxis, ax.get_xlim()), (ax.yaxis, ax.get_ylim())):
            lo, hi = sorted(limits)
            for tick_value, tick_label in zip(axis.get_ticklocs(), axis.get_ticklabels()):
                if not lo <= tick_value <= hi:
                    tick_label.set_visible(False)
        save_preview_png(fig, preview_path)
    print("[PREVIEW] Save skipped.")
    show_and_close(fig, show=not skip_show, close=False)
else:
    out_path = save_svg_interactive(
        fig,
        out_dir=dir_name,
        base_stem=df_name_wo_ext,
        sheet_name=sheet_name,
        tight=True,
    )
    print("Saved to:", out_path)
    show_and_close(fig, show=not skip_show, close=False)

# %%
