# plot_utils.py
from __future__ import annotations

import os
import re
import sys
import math
import json
from collections import Counter
from pathlib import Path
from typing import Optional, Tuple, Dict, Any

import matplotlib.pyplot as plt
import numpy as np
from matplotlib import colors as mpl_colors
from matplotlib import text as mpl_text


CM_TO_INCH = 1 / 2.54

# Paper-friendly color scales (0: light -> 9: dark)
# Start from slightly darker tones for better visibility on white backgrounds.
black = ["#E6E6E6", "#D5D5D5", "#C4C4C4", "#B3B3B3", "#A2A2A2", "#8F8F8F", "#7C7C7C", "#666666", "#4A4A4A", "#2A2A2A"]
blue = ["#D8EBFF", "#BFE0FF", "#A5D5FF", "#8BC9FF", "#70BEFF", "#56B2FF", "#3CA6F5", "#1F8FE0", "#0C74C2", "#0052A8"]
orange = ["#FFE3C2", "#FFD4A2", "#FFC582", "#FFB662", "#FFA742", "#FF9822", "#F28610", "#D77207", "#BC5E03", "#A14B00"]
green = ["#D8F5DF", "#BFEECB", "#A6E7B7", "#8DDEA2", "#74D68D", "#5BCC77", "#43C262", "#2BA84D", "#158E38", "#009F22"]
purple = ["#E8D9FF", "#DAC3FF", "#CCADFF", "#BE97FF", "#AF81F8", "#A06BEB", "#9155DD", "#7D3EDD", "#6725C3", "#5A1FA8"]
gray = ["#E0E0E0", "#D2D2D2", "#C4C4C4", "#B6B6B6", "#A8A8A8", "#9A9A9A", "#8A8A8A", "#787878", "#626262", "#4A4A4A"]
red = ["#FFD1CC", "#FFB9B1", "#FFA198", "#FF897F", "#FF7166", "#F7574A", "#E93E31", "#D4291E", "#BC170C", "#A10000"]

COLORS = {
    "black": black,
    "blue": blue,
    "orange": orange,
    "green": green,
    "purple": purple,
    "gray": gray,
    "red": red,
}


def configure_plot_fonts() -> None:
    import matplotlib as mpl
    from matplotlib import font_manager

    configured = [name.strip() for name in os.getenv("PLOT_FONT_FAMILY", "").split(",") if name.strip()]
    japanese_fallbacks = [
        "Yu Gothic",
        "Yu Gothic UI",
        "Meiryo",
        "MS Gothic",
        "Noto Sans CJK JP",
        "Noto Sans JP",
        "IPAexGothic",
        "IPAGothic",
        "Hiragino Sans",
        "TakaoGothic",
    ]
    candidates = configured or ["Arial", *japanese_fallbacks, "DejaVu Sans"]
    try:
        available = {font.name for font in font_manager.fontManager.ttflist}
    except Exception:
        available = set()

    sans_serif = [name for name in candidates if not available or name in available]
    if not sans_serif:
        sans_serif = candidates
    mpl.rcParams["font.family"] = "sans-serif"
    mpl.rcParams["font.sans-serif"] = sans_serif
    mpl.rcParams["mathtext.fontset"] = "stixsans"
    mpl.rcParams["axes.unicode_minus"] = True


def unicode_leading_minus(text: str) -> str:
    """Use U+2212 for a leading numeric minus without touching exponents/TeX."""
    return "−" + text[1:] if text.startswith("-") else text


def figure_with_fixed_axes_cm(
    ax_w_cm: float,
    ax_h_cm: float,
    *,
    left_cm: float = 1.2,
    right_cm: float = 0.3,
    bottom_cm: float = 1.0,
    top_cm: float = 0.3,
) -> tuple[plt.Figure, plt.Axes]:
    """
    繝励Ο繝・ヨ繧ｨ繝ｪ繧｢・・xes鬆伜沺・峨・蟷・・鬮倥＆繧・cm 縺ｧ蝗ｺ螳壹＠縺ｦ Figure/Axes 繧剃ｽ懊ｋ縲・
    figsize 縺ｯ菴咏區霎ｼ縺ｿ縺縺後、xes縺ｮ螳溘し繧､繧ｺ縺ｯ ax_w_cm ﾃ・ax_h_cm 縺ｫ蝗ｺ螳壹＆繧後ｋ縲・

    豕ｨ諢・
      - bbox_inches="tight" / tight_layout 縺ｯ 窶懃黄逅・し繧､繧ｺ蝗ｺ螳壺・繧貞ｴｩ縺励ｄ縺吶＞縲・
    """
    fig_w_cm = left_cm + ax_w_cm + right_cm
    fig_h_cm = bottom_cm + ax_h_cm + top_cm

    fig = plt.figure(figsize=(fig_w_cm * CM_TO_INCH, fig_h_cm * CM_TO_INCH))
    ax = fig.add_axes([
        left_cm / fig_w_cm,
        bottom_cm / fig_h_cm,
        ax_w_cm / fig_w_cm,
        ax_h_cm / fig_h_cm,
    ])
    apply_plot_background_from_env(fig, ax)
    return fig, ax


def configure_axes_options(
    ax: plt.Axes,
    *,
    hide_xticklabels: bool = False,
    hide_yticklabels: bool = False,
    hide_xticks: bool = False,     # 竊・霑ｽ蜉
    hide_yticks: bool = False,     # 竊・霑ｽ蜉
    hide_minorticks: bool = False,

    spine_left: bool = True,
    spine_right: bool = True,
    spine_top: bool = True,
    spine_bottom: bool = True,

    yaxis_right: bool = False,
    xaxis_top: bool = False,
) -> None:
    """
    窶懊ｈ縺丈ｽｿ縺・・霆ｸ繧ｪ繝励す繝ｧ繝ｳ繧偵∪縺ｨ繧√※驕ｩ逕ｨ縺吶ｋ縲・

    繝・ヵ繧ｩ繝ｫ繝・
      - 譫邱壹・蜈ｨ驛ｨ陦ｨ遉ｺ
      - y霆ｸ縺ｯ蟾ｦ
      - x霆ｸ縺ｯ荳・
      - 逶ｮ逶帙ｊ邱壹・陦ｨ遉ｺ
    """

    # ----------------------------
    # 譫邱夲ｼ・pines・芽｡ｨ遉ｺ/髱櫁｡ｨ遉ｺ
    # ----------------------------
    ax.spines["left"].set_visible(spine_left)
    ax.spines["right"].set_visible(spine_right)
    ax.spines["top"].set_visible(spine_top)
    ax.spines["bottom"].set_visible(spine_bottom)

    # ----------------------------
    # y霆ｸ縺ｮ菴咲ｽｮ
    # ----------------------------
    if yaxis_right:
        ax.yaxis.tick_right()
        ax.yaxis.set_label_position("right")
        ax.tick_params(
            axis="y",
            labelright=not hide_yticklabels,
            labelleft=False,
        )
    else:
        ax.yaxis.tick_left()
        ax.yaxis.set_label_position("left")
        ax.tick_params(
            axis="y",
            labelleft=not hide_yticklabels,
            labelright=False,
        )

    # ----------------------------
    # x霆ｸ縺ｮ菴咲ｽｮ
    # ----------------------------
    if xaxis_top:
        ax.xaxis.tick_top()
        ax.xaxis.set_label_position("top")
        ax.tick_params(
            axis="x",
            labeltop=not hide_xticklabels,
            labelbottom=False,
        )
    else:
        ax.xaxis.tick_bottom()
        ax.xaxis.set_label_position("bottom")
        ax.tick_params(
            axis="x",
            labelbottom=not hide_xticklabels,
            labeltop=False,
        )

    # ----------------------------
    # 逶ｮ逶帙ｊ邱夲ｼ・ick邱夲ｼ峨・ON/OFF
    # ----------------------------
    if hide_xticks:
        ax.tick_params(axis="x", which="both", length=0)
    if hide_yticks:
        ax.tick_params(axis="y", which="both", length=0)
    if hide_minorticks:
        ax.minorticks_off()
    else:
        ax.minorticks_on()


def _env_float(name: str) -> float | None:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _env_bool(name: str) -> bool | None:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return None
    return value.strip().lower() in {"1", "true", "yes", "on"}


def parse_nonnegative_float_list(name: str) -> list[float]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return []
    values: list[float] = []
    for token in [part.strip() for part in raw.split(",")]:
        if not token:
            values.append(float("nan"))
            continue
        try:
            value = float(token)
        except ValueError:
            values.append(float("nan"))
            continue
        if math.isfinite(value):
            values.append(max(0.0, value))
        else:
            values.append(float("nan"))
    return values


def value_at(values: list, index: int, default):
    return values[index] if 0 <= index < len(values) else default


def line_width_for_series(line_widths: list[float], index: int, default_lw: float) -> float:
    try:
        value = float(value_at(line_widths, index, default_lw))
    except Exception:
        return default_lw
    if not math.isfinite(value):
        return default_lw
    return max(0.0, value)


def env_axes_size_cm(default_w: float, default_h: float) -> tuple[float, float]:
    w = _env_float("PLOT_AX_W_CM")
    h = _env_float("PLOT_AX_H_CM")
    return (w if w is not None else default_w, h if h is not None else default_h)


def env_style_options(defaults: dict[str, float]) -> dict[str, float]:
    out = dict(defaults)
    lw_scale = _env_float("PLOT_LINEWIDTH_SCALE")
    tick_scale = _env_float("PLOT_FONTSIZE_TICK_SCALE")
    tick_length = _env_float("PLOT_TICK_LENGTH")
    label_scale = _env_float("PLOT_FONTSIZE_LABEL_SCALE")
    data_scale = _env_float("PLOT_DATA_LINE_SCALE")
    data_lw = _env_float("PLOT_DATA_LINEWIDTH")
    if lw_scale is not None:
        out["linewidth_scale"] = lw_scale
    if tick_scale is not None:
        out["fontsize_tick_scale"] = tick_scale
    if tick_length is not None:
        out["tick_length"] = tick_length
    if label_scale is not None:
        out["fontsize_label_scale"] = label_scale
    if data_scale is not None:
        out["data_line_scale"] = data_scale
    if data_lw is not None:
        out["data_linewidth"] = data_lw
    return out


def configure_axes_with_env(ax: plt.Axes, defaults: dict[str, bool]) -> None:
    opt = dict(defaults)
    mapping = {
        "hide_xticklabels": "PLOT_HIDE_XTICKLABELS",
        "hide_yticklabels": "PLOT_HIDE_YTICKLABELS",
        "hide_xticks": "PLOT_HIDE_XTICKS",
        "hide_yticks": "PLOT_HIDE_YTICKS",
        "hide_minorticks": "PLOT_HIDE_MINORTICKS",
        "spine_left": "PLOT_SPINE_LEFT",
        "spine_right": "PLOT_SPINE_RIGHT",
        "spine_top": "PLOT_SPINE_TOP",
        "spine_bottom": "PLOT_SPINE_BOTTOM",
        "yaxis_right": "PLOT_YAXIS_RIGHT",
        "xaxis_top": "PLOT_XAXIS_TOP",
    }
    for key, env_name in mapping.items():
        v = _env_bool(env_name)
        if v is not None:
            opt[key] = v
    configure_axes_options(ax, **opt)


def apply_series_colors_from_env(plot_pairs: list[tuple]) -> list[tuple]:
    raw = os.getenv("PLOT_SERIES_COLORS", "").strip()
    colors = [c.strip() for c in raw.split(",") if c.strip()] if raw else []

    raw_xoff = os.getenv("PLOT_SERIES_XOFFSETS", "").strip()
    raw_yoff = os.getenv("PLOT_SERIES_YOFFSETS", "").strip()
    xoffs: list[float] = []
    yoffs: list[float] = []
    if raw_xoff:
        for v in [x.strip() for x in raw_xoff.split(",") if x.strip()]:
            try:
                xoffs.append(float(v))
            except ValueError:
                pass
    if raw_yoff:
        for v in [y.strip() for y in raw_yoff.split(",") if y.strip()]:
            try:
                yoffs.append(float(v))
            except ValueError:
                pass

    yoff_start = _env_float("PLOT_SERIES_YOFFSET_START")
    yoff_step = _env_float("PLOT_SERIES_YOFFSET_STEP")

    if not colors and not xoffs and not yoffs:
        return plot_pairs

    out: list[tuple] = []
    for i, pair in enumerate(plot_pairs):
        if len(pair) >= 5:
            p = list(pair)
            if xoffs:
                p[2] = xoffs[i % len(xoffs)]
            base_yoff = float(p[3])
            if yoffs:
                base_yoff = yoffs[i % len(yoffs)]
            if (yoff_start is not None) or (yoff_step is not None):
                base_yoff += float(yoff_start or 0.0) + i * float(yoff_step or 0.0)
            p[3] = base_yoff
            if colors:
                c = colors[i % len(colors)]
                if c.lower() not in {"auto", "__auto__", "default", "none"}:
                    p[4] = c
            out.append(tuple(p))
        else:
            out.append(pair)
    return out


def apply_column_map_from_env(column_names: list, default_pairs: list[tuple]) -> list[tuple]:
    """
    Override plot pairs by env var PLOT_COLUMN_MAP.
    Format: "x:y,x:y,..." where x/y are 0-based column indices.
    Example: "0:1,0:2,4:5"
    """
    raw = os.getenv("PLOT_COLUMN_MAP", "").strip()
    if not raw:
        return default_pairs

    mappings: list[tuple[int, int]] = []
    for token in [t.strip() for t in raw.split(",") if t.strip()]:
        if ":" not in token:
            raise ValueError(f"Invalid PLOT_COLUMN_MAP token: '{token}'. Use x:y format.")
        xs, ys = [x.strip() for x in token.split(":", 1)]
        try:
            xi = int(xs)
            yi = int(ys)
        except ValueError as e:
            raise ValueError(f"Invalid PLOT_COLUMN_MAP token: '{token}'. x and y must be integers.") from e
        if xi < 0 or yi < 0 or xi >= len(column_names) or yi >= len(column_names):
            raise ValueError(
                f"PLOT_COLUMN_MAP index out of range: '{token}'. "
                f"column count={len(column_names)}"
            )
        mappings.append((xi, yi))

    default_offsets = []
    default_colors = []
    for p in default_pairs:
        if len(p) >= 4:
            default_offsets.append((p[2], p[3]))
        else:
            default_offsets.append((0, 0))
        if len(p) >= 5:
            default_colors.append(p[4])
        else:
            default_colors.append(COLORS["blue"][5])
    if not default_offsets:
        default_offsets = [(0, 0)]
    if not default_colors:
        default_colors = [COLORS["blue"][5]]

    out: list[tuple] = []
    for i, (xi, yi) in enumerate(mappings):
        xoff, yoff = default_offsets[i % len(default_offsets)]
        color = default_colors[i % len(default_colors)]
        out.append((column_names[xi], column_names[yi], xoff, yoff, color))
    return out


def strip_pandas_duplicate_suffix(label: object) -> str:
    text = str(label).strip()
    return re.sub(r"\.\d+$", "", text)


def excel_column_letter(index: int) -> str:
    if index < 0:
        return ""
    letters = ""
    n = index + 1
    while n:
        n, rem = divmod(n - 1, 26)
        letters = chr(65 + rem) + letters
    return letters


def _find_column_index_for_label(label: object, column_names: list, used_indexes: set[int]) -> int | None:
    label_text = str(label)
    for idx, name in enumerate(column_names):
        if idx not in used_indexes and str(name) == label_text:
            used_indexes.add(idx)
            return idx
    for idx, name in enumerate(column_names):
        if str(name) == label_text:
            return idx
    return None


def series_legend_labels_from_pairs(plot_pairs: list[tuple], column_names: list) -> list[str]:
    manual_labels: list[str] = []
    raw_manual_labels = os.getenv("PLOT_SERIES_LABELS_JSON", "").strip()
    if raw_manual_labels:
        try:
            decoded = json.loads(raw_manual_labels)
            if isinstance(decoded, list):
                manual_labels = [str(item).strip() for item in decoded]
        except Exception:
            manual_labels = []

    entries: list[tuple[str, int | None]] = []
    used_indexes: set[int] = set()
    for pair in plot_pairs:
        y_label = pair[1] if len(pair) > 1 else ""
        base_label = strip_pandas_duplicate_suffix(y_label) or "Series"
        y_index = _find_column_index_for_label(y_label, column_names, used_indexes)
        entries.append((base_label, y_index))

    counts = Counter(base for base, _ in entries)
    duplicate_numbers: dict[str, int] = {}
    labels: list[str] = []
    for base_label, y_index in entries:
        if counts[base_label] <= 1:
            labels.append(base_label)
            continue
        suffix = excel_column_letter(y_index) if y_index is not None else ""
        if not suffix:
            duplicate_numbers[base_label] = duplicate_numbers.get(base_label, 0) + 1
            suffix = str(duplicate_numbers[base_label])
        labels.append(f"{base_label} [{suffix}]")
    for i, manual_label in enumerate(manual_labels[: len(labels)]):
        if manual_label:
            labels[i] = manual_label
    return labels


def plot_pair_column_indices(plot_pairs: list[tuple], column_names: list) -> list[tuple[int, int]]:
    used_x: set[int] = set()
    used_y: set[int] = set()

    def matching_indexes(name: object) -> list[int]:
        return [idx for idx, col in enumerate(column_names) if str(col) == str(name)]

    def choose_y(name: object) -> int:
        matches = matching_indexes(name)
        for idx in matches:
            if idx not in used_y:
                used_y.add(idx)
                return idx
        if matches:
            return matches[0]
        return 0

    def choose_x(name: object, y_idx: int) -> int:
        matches = matching_indexes(name)
        unused = [idx for idx in matches if idx not in used_x]
        before_y = [idx for idx in unused if idx < y_idx]
        if before_y:
            idx = before_y[-1]
            used_x.add(idx)
            return idx
        if unused:
            idx = unused[0]
            used_x.add(idx)
            return idx
        before_y = [idx for idx in matches if idx < y_idx]
        if before_y:
            return before_y[-1]
        if matches:
            return matches[0]
        return 0

    indexes: list[tuple[int, int]] = []
    for pair in plot_pairs:
        y_idx = choose_y(pair[1] if len(pair) > 1 else "")
        x_idx = choose_x(pair[0] if pair else "", y_idx)
        indexes.append((x_idx, y_idx))
    return indexes


def apply_axis_overrides_from_env(ax: plt.Axes) -> None:
    xmin = _env_float("PLOT_XMIN")
    xmax = _env_float("PLOT_XMAX")
    ymin = _env_float("PLOT_YMIN")
    ymax = _env_float("PLOT_YMAX")
    xtick_step = _env_float("PLOT_XTICK_STEP")
    ytick_step = _env_float("PLOT_YTICK_STEP")
    xscale = os.getenv("PLOT_XSCALE", "").strip().lower()
    yscale = os.getenv("PLOT_YSCALE", "").strip().lower()

    if xscale in {"linear", "log"}:
        ax.set_xscale(xscale)
    if yscale in {"linear", "log"}:
        ax.set_yscale(yscale)

    from matplotlib.ticker import FixedFormatter, FuncFormatter, LogFormatterMathtext, NullFormatter

    def zero_as_integer(value: float, _position, formatter) -> str:
        if not math.isfinite(value):
            return ""
        if abs(value) <= 1.0e-12:
            return "0"
        try:
            if hasattr(formatter, "format_data_short"):
                text = formatter.format_data_short(value)
            else:
                text = formatter(value, _position)
        except Exception:
            text = f"{value:.12g}"
        text = str(text).strip()
        if ("e" not in text.lower()) and ("." in text):
            text = text.rstrip("0").rstrip(".")
        if text in {"-0", "-0.0", "-0.00", "−0", "−0.0", "−0.00"}:
            return "0"
        return unicode_leading_minus(text)

    def decimal_log_label(value: float, _position=None) -> str:
        if not math.isfinite(value) or value <= 0:
            return ""
        return unicode_leading_minus(f"{value:.12f}".rstrip("0").rstrip("."))

    if xmin is not None or xmax is not None:
        current_xmin, current_xmax = ax.get_xlim()
        ax.set_xlim(
            xmin if xmin is not None else current_xmin,
            xmax if xmax is not None else current_xmax,
        )
    if ymin is not None or ymax is not None:
        current_ymin, current_ymax = ax.get_ylim()
        ax.set_ylim(
            ymin if ymin is not None else current_ymin,
            ymax if ymax is not None else current_ymax,
        )

    # Optional major tick step control (e.g. 0..10 with step 2 -> 0,2,4,6,8,10)
    if xtick_step is not None and xtick_step > 0 and xscale != "log":
        from matplotlib.ticker import MultipleLocator

        ax.xaxis.set_major_locator(MultipleLocator(xtick_step))
    if ytick_step is not None and ytick_step > 0 and yscale != "log":
        from matplotlib.ticker import MultipleLocator

        ax.yaxis.set_major_locator(MultipleLocator(ytick_step))

    for axis, scale, format_name in (
        (ax.xaxis, ax.get_xscale(), os.getenv("PLOT_XLOG_FORMAT", "power").strip().lower()),
        (ax.yaxis, ax.get_yscale(), os.getenv("PLOT_YLOG_FORMAT", "power").strip().lower()),
    ):
        if scale == "log":
            if format_name == "decimal":
                axis.set_major_formatter(FuncFormatter(decimal_log_label))
            else:
                axis.set_major_formatter(LogFormatterMathtext(base=10, labelOnlyBase=True))
            axis.set_minor_formatter(NullFormatter())
            continue
        base_formatter = axis.get_major_formatter()
        if isinstance(base_formatter, FixedFormatter):
            continue
        axis.set_major_formatter(
            FuncFormatter(lambda value, pos, formatter=base_formatter: zero_as_integer(value, pos, formatter))
        )


def apply_axis_labels_from_env(ax: plt.Axes) -> None:
    x_full = os.getenv("PLOT_XLABEL_FULL", "").strip()
    y_full = os.getenv("PLOT_YLABEL_FULL", "").strip()
    x_text = os.getenv("PLOT_XLABEL_TEXT", "").strip()
    y_text = os.getenv("PLOT_YLABEL_TEXT", "").strip()
    x_unit = os.getenv("PLOT_XUNIT", "").strip()
    y_unit = os.getenv("PLOT_YUNIT", "").strip()
    hide_xlabel = _env_bool("PLOT_HIDE_XLABEL")
    hide_ylabel = _env_bool("PLOT_HIDE_YLABEL")

    def normalize_unit(unit: str) -> str:
        u = unit.strip()
        key = u.lower().replace("μ", "u").replace("µ", "u").replace(" ", "")
        if key == "um":
            return "μm"
        if key in {"cm^-1", "cm⁻¹", "cm-1"}:
            return "cm$^{-1}$"
        if key in {"ma/cm^2", "ma/cm²", "ma/cm2"}:
            return "mA/cm$^2$"
        if key in {"ua/cm^2", "ua/cm²", "ua/cm2"}:
            return "μA/cm$^2$"
        return u

    x_unit = normalize_unit(x_unit)
    y_unit = normalize_unit(y_unit)

    def merge_label(current: str, text: str, unit: str) -> str:
        if text and unit:
            return f"{text} ({unit})"
        if text:
            return text
        if unit:
            if re.search(r"\([^)]*\)\s*$", current):
                return re.sub(r"\([^)]*\)\s*$", f"({unit})", current).strip()
            return f"{current} ({unit})".strip()
        return current

    if x_full:
        ax.xaxis.label.set_text(x_full)
    else:
        ax.xaxis.label.set_text(merge_label(ax.get_xlabel(), x_text, x_unit))

    if y_full:
        ax.yaxis.label.set_text(y_full)
    else:
        ax.yaxis.label.set_text(merge_label(ax.get_ylabel(), y_text, y_unit))

    if hide_xlabel:
        ax.xaxis.label.set_text("")
    if hide_ylabel:
        ax.yaxis.label.set_text("")

    # Optional spacing controls from launcher
    x_label_pad = _env_float("PLOT_XLABEL_PAD")
    y_label_pad = _env_float("PLOT_YLABEL_PAD")
    x_tick_pad = _env_float("PLOT_XTICK_PAD")
    y_tick_pad = _env_float("PLOT_YTICK_PAD")

    if x_label_pad is not None:
        ax.xaxis.labelpad = x_label_pad
    if y_label_pad is not None:
        ax.yaxis.labelpad = y_label_pad
    if x_tick_pad is not None:
        base_x_tick_pad = 2.0
        ax.tick_params(axis="x", which="both", pad=base_x_tick_pad + x_tick_pad)
    if y_tick_pad is not None:
        base_y_tick_pad = 2.0
        ax.tick_params(axis="y", which="both", pad=base_y_tick_pad + y_tick_pad)

def annotate_ylim_max(
    ax: plt.Axes,
    *,
    fmt: str = "ymax={:.0f}",
    xy_axes: tuple[float, float] = (0.99, 0.99),
    ha: str = "right",
    va: str = "top",
    fontsize: int = 10,
) -> float:
    """
    迴ｾ蝨ｨ縺ｮylim縺ｮ譛螟ｧ蛟､繧貞峙荳ｭ縺ｫ陦ｨ遉ｺ・医せ繝壹け繝医Ν縺ｧ逶ｮ逶帶焚蟄励ｒ豸医☆縺ｨ縺咲畑・峨・
    謌ｻ繧雁､縺ｨ縺励※ ymax 繧定ｿ斐☆・・rint遲峨↓繧ゆｽｿ縺医ｋ・峨・
    """
    ymin, ymax = ax.get_ylim()
    ax.text(
        xy_axes[0], xy_axes[1],
        fmt.format(ymax),
        transform=ax.transAxes,
        ha=ha, va=va,
        fontsize=fontsize,
    )
    return ymax

BASE_SPINE_LINEWIDTH = 0.8   # 竊・縺薙％繧貞､峨∴繧九→蜈ｨ菴薙′螟峨ｏ繧・
def apply_paper_style(
    ax,
    *,
    ax_w_cm: float,
    ref_w_cm: float = 5.0,
    linewidth_scale: float = 1.0,
    fontsize_tick_scale: float = 1.0,
    tick_length: float = 4.0,
    fontsize_label_scale: float = 1.0,
    data_line_scale: float = 1.0,
    data_linewidth: float | None = None,
):
    configure_plot_fonts()

    # ---- 蝗ｺ螳壼､・医ヨ繝・・繧ｸ繝｣繝ｼ繝翫Ν莉墓ｧ假ｼ・
    tick_font = 7.0 * fontsize_tick_scale
    label_font = 8.0 * fontsize_label_scale
    spine_lw = 0.8 * linewidth_scale
    major_tick_length = max(0.0, float(tick_length))
    minor_tick_length = max(0.0, major_tick_length / 2.0)
    data_lw = float(data_linewidth) if data_linewidth is not None else 1.0 * data_line_scale

    ax.minorticks_on()

    ax.tick_params(axis="both", which="major",
                   direction="in",
                   width=spine_lw,
                   length=major_tick_length,
                   labelsize=tick_font)

    ax.tick_params(axis="both", which="minor",
                   direction="in",
                   width=spine_lw,
                   length=minor_tick_length)

    for spine in ax.spines.values():
        spine.set_linewidth(spine_lw)

    ax.xaxis.label.set_size(label_font)
    ax.yaxis.label.set_size(label_font)

    return {
        "spine_linewidth": spine_lw,
        "data_linewidth": data_lw,
        "tick_fontsize": tick_font,
        "major_tick_length": major_tick_length,
        "minor_tick_length": minor_tick_length,
        "label_fontsize": label_font,
        "scale": 1.0,
    }

def safe_stem(s: str) -> str:
    return "".join(c if c not in r'\/:*?"<>|' else "_" for c in str(s))


from datetime import datetime
from pathlib import Path


def _finite_array(values) -> np.ndarray:
    try:
        arr = np.asarray(values, dtype=float)
    except Exception:
        return np.array([], dtype=float)
    if arr.size == 0:
        return np.array([], dtype=float)
    arr = np.ravel(arr)
    return arr[np.isfinite(arr)]


def _axis_data_bounds(ax: plt.Axes) -> tuple[tuple[float, float] | None, tuple[float, float] | None]:
    x_parts: list[np.ndarray] = []
    y_parts: list[np.ndarray] = []

    for line in ax.lines:
        xvals = _finite_array(line.get_xdata(orig=False))
        yvals = _finite_array(line.get_ydata(orig=False))
        if xvals.size:
            x_parts.append(xvals)
        if yvals.size:
            y_parts.append(yvals)

    for collection in ax.collections:
        # Filled regions and error lines have a dummy (0, 0) offset in
        # display coordinates. Only data-coordinate offsets are observations.
        if not collection.get_offset_transform().contains_branch(ax.transData):
            continue
        try:
            offsets = np.asarray(collection.get_offsets(), dtype=float)
        except Exception:
            offsets = np.empty((0, 2), dtype=float)
        if offsets.ndim == 2 and offsets.shape[1] >= 2:
            finite = offsets[np.isfinite(offsets).all(axis=1)]
            if finite.size:
                x_parts.append(finite[:, 0])
                y_parts.append(finite[:, 1])

    for patch in ax.patches:
        x0 = getattr(patch, "get_x", lambda: None)()
        y0 = getattr(patch, "get_y", lambda: None)()
        width = getattr(patch, "get_width", lambda: None)()
        height = getattr(patch, "get_height", lambda: None)()
        try:
            xvals = _finite_array([x0, x0 + width])
        except Exception:
            xvals = np.array([], dtype=float)
        try:
            yvals = _finite_array([y0, y0 + height])
        except Exception:
            yvals = np.array([], dtype=float)
        if xvals.size:
            x_parts.append(xvals)
        if yvals.size:
            y_parts.append(yvals)

    x_bounds = None
    y_bounds = None
    if x_parts:
        all_x = np.concatenate(x_parts)
        if all_x.size:
            x_bounds = (float(np.min(all_x)), float(np.max(all_x)))
    if y_parts:
        all_y = np.concatenate(y_parts)
        if all_y.size:
            y_bounds = (float(np.min(all_y)), float(np.max(all_y)))
    return x_bounds, y_bounds


def _padded_bounds(bounds: tuple[float, float], pad_ratio: float = 0.05) -> tuple[float, float]:
    lo, hi = bounds
    if not (math.isfinite(lo) and math.isfinite(hi)):
        return bounds
    span = hi - lo
    pad = span * pad_ratio if span > 0 else max(abs(lo), abs(hi), 1.0) * pad_ratio
    return lo - pad, hi + pad


def _is_3d_axes(ax: plt.Axes) -> bool:
    return callable(getattr(ax, "get_zlim", None))


def autoscale_axis_limits_from_data(
    ax: plt.Axes,
    *,
    scalex: bool = True,
    scaley: bool = True,
    invert_x: bool = False,
    invert_y: bool = False,
    xpad_ratio: float = 0.05,
    ypad_ratio: float = 0.05,
) -> None:
    x_bounds, y_bounds = _axis_data_bounds(ax)

    if scalex and x_bounds is not None:
        lo, hi = _padded_bounds(x_bounds, xpad_ratio)
        ax.set_xlim((hi, lo) if invert_x else (lo, hi))
    if scaley and y_bounds is not None:
        lo, hi = _padded_bounds(y_bounds, ypad_ratio)
        ax.set_ylim((hi, lo) if invert_y else (lo, hi))


def ensure_axis_limits_include_data(ax: plt.Axes) -> None:
    x_bounds, y_bounds = _axis_data_bounds(ax)

    x_min_locked = _env_float("PLOT_XMIN") is not None
    x_max_locked = _env_float("PLOT_XMAX") is not None
    y_min_locked = _env_float("PLOT_YMIN") is not None
    y_max_locked = _env_float("PLOT_YMAX") is not None

    def expand(
        current: tuple[float, float],
        bounds: tuple[float, float] | None,
        *,
        lower_locked: bool,
        upper_locked: bool,
    ) -> tuple[float, float]:
        if bounds is None:
            return current
        cur0, cur1 = current
        cur_lo, cur_hi = min(cur0, cur1), max(cur0, cur1)
        data_lo, data_hi = bounds
        if not (math.isfinite(data_lo) and math.isfinite(data_hi)):
            return current
        if data_lo >= cur_lo and data_hi <= cur_hi:
            return current
        span = data_hi - data_lo
        pad = span * 0.05 if span > 0 else max(abs(data_lo), abs(data_hi), 1.0) * 0.05
        new_lo = cur_lo if lower_locked else min(cur_lo, data_lo - pad)
        new_hi = cur_hi if upper_locked else max(cur_hi, data_hi + pad)
        if cur0 <= cur1:
            return new_lo, new_hi
        return new_hi, new_lo

    new_xlim = expand(ax.get_xlim(), x_bounds, lower_locked=x_min_locked, upper_locked=x_max_locked)
    new_ylim = expand(ax.get_ylim(), y_bounds, lower_locked=y_min_locked, upper_locked=y_max_locked)
    if new_xlim != ax.get_xlim():
        ax.set_xlim(new_xlim)
    if new_ylim != ax.get_ylim():
        ax.set_ylim(new_ylim)

def save_svg_interactive(
    fig,
    *,
    out_dir,
    base_stem,
    sheet_name=None,
    transparent=False,
    tight=False,
):
    """
    菫晏ｭ伜燕縺ｫ荳頑嶌縺阪☆繧九°遒ｺ隱阪☆繧九・
    y 竊・荳頑嶌縺・
    縺昴ｌ莉･螟・竊・繧ｿ繧､繝繧ｹ繧ｿ繝ｳ繝嶺ｻ倥″菫晏ｭ・
    """

    custom_save_path = os.getenv("PLOT_SAVE_PATH", "").strip()
    if custom_save_path:
        final_path = Path(custom_save_path)
        save_format = final_path.suffix.lower().lstrip(".") or "svg"
        final_path.parent.mkdir(parents=True, exist_ok=True)
    else:
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)

        stem = f"{safe_stem(base_stem)}"
        save_format = "svg"
        out_path = out_dir / f"{stem}.{save_format}"

        if out_path.exists():
            mode = os.getenv("PLOT_OVERWRITE_MODE", "").strip().lower()
            if mode == "overwrite":
                final_path = out_path
            elif mode == "timestamp":
                ts = datetime.now().strftime("%Y%m%d_%H%M")
                final_path = out_dir / f"{stem}_{ts}.{save_format}"
            else:
                non_interactive = (not sys.stdin.isatty()) or (os.getenv("PLOT_NO_PROMPT") == "1")
                if non_interactive:
                    ts = datetime.now().strftime("%Y%m%d_%H%M")
                    final_path = out_dir / f"{stem}_{ts}.{save_format}"
                else:
                    ans = input(f"{out_path.name} を上書きしますか? (yes=0/No=else): ").strip().lower()
                    if ans == "0":
                        final_path = out_path
                    else:
                        ts = datetime.now().strftime("%Y%m%d_%H%M")
                        final_path = out_dir / f"{stem}_{ts}.{save_format}"
        else:
            final_path = out_path

    if fig.axes and not _is_3d_axes(fig.axes[0]):
        ensure_axis_limits_include_data(fig.axes[0])
        expand_figure_to_include_artists(fig)

    save_kw = dict(format=save_format, transparent=transparent)
    if save_format == "png":
        save_kw["dpi"] = 1200
    if tight:
        save_kw["bbox_inches"] = "tight"
        save_kw["pad_inches"] = 0.03

    fig.savefig(final_path, **save_kw)

    extra_formats = os.getenv("PLOT_EXTRA_FORMATS", "").strip()
    if extra_formats:
        for fmt in [x.strip().lower() for x in extra_formats.split(",") if x.strip()]:
            if fmt == "svg":
                continue
            extra_path = final_path.with_suffix(f".{fmt}")
            extra_kw = dict(format=fmt, transparent=transparent)
            if fmt == "png":
                extra_kw["dpi"] = 1200
            if tight:
                extra_kw["bbox_inches"] = "tight"
                extra_kw["pad_inches"] = 0.03
            fig.savefig(extra_path, **extra_kw)
    return final_path


def show_and_close(fig: plt.Figure, *, show: bool = True, close: bool = False) -> None:
    try:
        if fig.axes and not _is_3d_axes(fig.axes[0]):
            ax = fig.axes[0]
            ensure_axis_limits_include_data(ax)
            xmin, xmax = ax.get_xlim()
            ymin, ymax = ax.get_ylim()

            def infer_major_step(ticks: list[float], lo: float, hi: float) -> str:
                finite = [float(t) for t in ticks if math.isfinite(t)]
                if not finite:
                    return ""
                lower = min(lo, hi)
                upper = max(lo, hi)
                visible = [t for t in finite if lower - 1e-9 <= t <= upper + 1e-9]
                if len(visible) < 2:
                    return ""
                diffs = [round(visible[i + 1] - visible[i], 12) for i in range(len(visible) - 1)]
                diffs = [d for d in diffs if d > 0]
                if not diffs:
                    return ""
                first = diffs[0]
                if any(abs(d - first) > max(1e-9, abs(first) * 1e-6) for d in diffs[1:]):
                    return ""
                return f"{first:g}"

            xtick_step = infer_major_step(list(ax.get_xticks()), xmin, xmax)
            ytick_step = infer_major_step(list(ax.get_yticks()), ymin, ymax)
            print(
                "__PLOT_AXIS_STATE__ "
                f"xmin={xmin:g} xmax={xmax:g} "
                f"ymin={ymin:g} ymax={ymax:g} "
                f"xtick={xtick_step} ytick={ytick_step}"
            )
    except Exception:
        pass
    if show:
        plt.show()
    if close:
        plt.close(fig)


def expand_figure_to_include_artists(fig: plt.Figure, *, pad_inches: float = 0.05, max_passes: int = 2) -> None:
    if not fig.axes or any(_is_3d_axes(ax) for ax in fig.axes):
        return
    for _ in range(max_passes):
        try:
            fig.canvas.draw()
            renderer = fig.canvas.get_renderer()
            # Text annotations are regular Axes children, but annotations with
            # clip_on=False are not consistently included by Figure's default
            # tight-bbox artist list (notably the panel label above the axes).
            # Include visible text explicitly so a large label can never be
            # cropped by the preview/export boundary.
            extra_artists = []
            for axis in fig.axes:
                for artist in axis.get_children():
                    if isinstance(artist, mpl_text.Text) and artist.get_visible():
                        extra_artists.append(artist)
            tight = fig.get_tightbbox(renderer, bbox_extra_artists=extra_artists or None)
        except Exception:
            return
        if tight is None:
            return
        fig_w, fig_h = fig.get_size_inches()
        extra_left = max(0.0, -float(tight.x0) + pad_inches)
        extra_bottom = max(0.0, -float(tight.y0) + pad_inches)
        extra_right = max(0.0, float(tight.x1) - fig_w + pad_inches)
        extra_top = max(0.0, float(tight.y1) - fig_h + pad_inches)
        if max(extra_left, extra_bottom, extra_right, extra_top) < 1e-3:
            return

        old_positions = [(ax, ax.get_position().frozen()) for ax in fig.axes]
        new_w = fig_w + extra_left + extra_right
        new_h = fig_h + extra_bottom + extra_top
        fig.set_size_inches(new_w, new_h, forward=True)
        for ax, pos in old_positions:
            ax.set_position([
                (pos.x0 * fig_w + extra_left) / new_w,
                (pos.y0 * fig_h + extra_bottom) / new_h,
                (pos.width * fig_w) / new_w,
                (pos.height * fig_h) / new_h,
            ])


def apply_preview_legend(
    ax: plt.Axes,
    *,
    handles: list | None = None,
    labels: list[str] | None = None,
    fontsize: float = 7.0,
) -> None:
    show_legend = os.getenv("PLOT_PREVIEW_LEGEND", "1").strip().lower() in {"1", "true", "yes", "on"}
    if not show_legend:
        return
    raw_legend_x = os.getenv("PLOT_LEGEND_X", "").strip()
    raw_legend_y = os.getenv("PLOT_LEGEND_Y", "").strip()
    auto_position = (raw_legend_x == "") or (raw_legend_y == "")
    try:
        legend_x = float(raw_legend_x) if raw_legend_x else 0.82
    except Exception:
        legend_x = 0.82
    try:
        legend_y = float(raw_legend_y) if raw_legend_y else 0.90
    except Exception:
        legend_y = 0.90
    try:
        legend_scale = float(os.getenv("PLOT_LEGEND_SCALE", "1.0").strip() or "1.0")
    except Exception:
        legend_scale = 1.0
    try:
        legend_font_scale = float(os.getenv("PLOT_LEGEND_FONTSCALE", "1.0").strip() or "1.0")
    except Exception:
        legend_font_scale = 1.0
    legend_scale = max(0.2, min(3.0, legend_scale))
    legend_font_scale = max(0.2, min(3.0, legend_font_scale))
    relative_scale = legend_scale / legend_font_scale

    final_handles = list(handles) if handles else []
    final_labels = list(labels) if labels else []

    if not final_handles:
        auto_h, auto_l = ax.get_legend_handles_labels()
        for h, l in zip(auto_h, auto_l):
            if str(l).strip() and not str(l).startswith("_"):
                final_handles.append(h)
                final_labels.append(str(l))

    if not final_handles:
        lines = [ln for ln in ax.get_lines() if ln.get_visible()]
        for i, ln in enumerate(lines):
            final_handles.append(ln)
            label = str(ln.get_label()).strip()
            final_labels.append(label if label and not label.startswith("_") else f"Series {i + 1}")

    if not final_handles:
        # Bar plots: use first patch from each visible container.
        for i, c in enumerate(ax.containers):
            try:
                if len(c) == 0:
                    continue
                p = c[0]
                if hasattr(p, "get_visible") and not p.get_visible():
                    continue
                final_handles.append(p)
                label = str(c.get_label()).strip()
                final_labels.append(label if label and not label.startswith("_") else f"Series {i + 1}")
            except Exception:
                continue

    if not final_handles:
        # Scatter-only plots fallback.
        cols = [c for c in ax.collections if getattr(c, "get_visible", lambda: True)()]
        for i, c in enumerate(cols):
            final_handles.append(c)
            label = str(c.get_label()).strip()
            final_labels.append(label if label and not label.startswith("_") else f"Series {i + 1}")

    if not final_handles:
        return

    legend_kwargs = dict(
        borderaxespad=0.0,
        frameon=False,
        fontsize=fontsize * legend_font_scale,
        markerscale=legend_scale,
        handlelength=2.0 * relative_scale,
        handletextpad=0.6 * relative_scale,
        labelspacing=0.3 * relative_scale,
        borderpad=0.2 * relative_scale,
        handleheight=0.7 * relative_scale,
    )
    if auto_position:
        legend = ax.legend(
            final_handles,
            final_labels,
            loc="best",
            **legend_kwargs,
        )
    else:
        legend = ax.legend(
            final_handles,
            final_labels,
            loc="center",
            bbox_to_anchor=(legend_x, legend_y),
            bbox_transform=ax.transAxes,
            **legend_kwargs,
        )
    if legend is not None:
        frame = legend.get_frame()
        frame.set_facecolor("none")
        frame.set_edgecolor("none")
        frame.set_linewidth(0.0)
        try:
            fig = ax.figure
            fig.canvas.draw()
            bbox = legend.get_window_extent(fig.canvas.get_renderer())
            center_disp = ((bbox.x0 + bbox.x1) / 2.0, (bbox.y0 + bbox.y1) / 2.0)
            center_axes = ax.transAxes.inverted().transform(center_disp)
            print(f"__PLOT_LEGEND_STATE__ x={center_axes[0]:.4f} y={center_axes[1]:.4f}")
        except Exception:
            pass


def _preview_bbox_extra_artists(fig: plt.Figure) -> list:
    artists: list = []
    for ax in fig.axes:
        if _is_3d_axes(ax):
            continue
        candidates = [ax.xaxis.label, ax.yaxis.label, ax.title, ax.xaxis.get_offset_text(), ax.yaxis.get_offset_text()]
        candidates.extend(ax.get_xticklabels())
        candidates.extend(ax.get_yticklabels())
        legend = ax.get_legend()
        if legend is not None:
            candidates.append(legend)
        for artist in candidates:
            if artist is None:
                continue
            try:
                visible = artist.get_visible()
            except Exception:
                visible = True
            if not visible:
                continue
            artists.append(artist)
    return artists


def save_preview_png(fig: plt.Figure, preview_path: str) -> None:
    dpi_text = os.getenv("PLOT_PREVIEW_DPI", "").strip()
    try:
        dpi = int(dpi_text) if dpi_text else 600
    except Exception:
        dpi = 600
    dpi = max(150, min(1200, dpi))
    if fig.axes and not _is_3d_axes(fig.axes[0]):
        ensure_axis_limits_include_data(fig.axes[0])
        expand_figure_to_include_artists(fig)
    try:
        fig.canvas.draw()
    except Exception:
        pass
    fig.savefig(
        preview_path,
        format="png",
        transparent=float(os.getenv("PLOT_FIGURE_BACKGROUND_ALPHA", "0.0") or "0.0") <= 0.0,
        dpi=dpi,
        bbox_inches="tight",
        pad_inches=0.05,
    )


def apply_plot_background_from_env(fig: plt.Figure, axes=None) -> None:
    raw = os.getenv("PLOT_FIGURE_BACKGROUND_COLOR", "white").strip() or "white"
    try:
        color = mpl_colors.to_hex(raw, keep_alpha=False)
    except Exception:
        return
    try:
        alpha = float(os.getenv("PLOT_FIGURE_BACKGROUND_ALPHA", "0.0").strip() or "0.0")
    except Exception:
        alpha = 1.0
    alpha = max(0.0, min(1.0, alpha))
    rgba = mpl_colors.to_rgba(color, alpha=alpha)
    try:
        fig.patch.set_facecolor(rgba)
        fig.patch.set_alpha(alpha)
    except Exception:
        pass
    axes_list = []
    if axes is None:
        axes_list = list(getattr(fig, "axes", []) or [])
    elif isinstance(axes, (list, tuple)):
        axes_list = [ax for ax in axes if ax is not None]
    else:
        axes_list = [axes]
    for ax in axes_list:
        try:
            ax.set_facecolor(rgba)
            ax.patch.set_alpha(alpha)
        except Exception:
            pass

