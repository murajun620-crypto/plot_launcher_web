"""Browser adapter for the existing General/Matplotlib plot script.

Only this adapter replaces the desktop file picker. The plotting code is copied
unchanged from src by scripts/build_web.py and runs with the Agg backend.
"""

from __future__ import annotations

import base64
from contextlib import contextmanager, redirect_stdout
from io import BytesIO, StringIO
import json
import math
import os
from pathlib import Path
import runpy
import sys
from types import ModuleType, SimpleNamespace

import matplotlib

matplotlib.use("Agg")
from matplotlib import font_manager, pyplot as plt
from matplotlib.colors import is_color_like
import numpy as np
import pandas as pd

import plot_utils
from annotation_model import AnnotationCollection
from annotation_manager import AnnotationManager


MAX_ROWS = 200_000
MAX_COLUMNS = 256
MAX_SERIES = 32


def number(value, label, *, minimum=None, maximum=None, optional=False):
    if value is None or value == "":
        if optional:
            return None
        raise ValueError(f"{label}を入力してください。")
    try:
        result = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{label}には数値を入力してください。") from None
    if not math.isfinite(result):
        raise ValueError(f"{label}には有限の数値を入力してください。")
    if (minimum is not None and result < minimum) or (maximum is not None and result > maximum):
        raise ValueError(f"{label}は{minimum}〜{maximum}の範囲で入力してください。")
    return result


def column_index(value, column_count, label):
    numeric = number(value, label)
    if not numeric.is_integer() or not 0 <= numeric < column_count:
        raise ValueError(f"{label}の列を選び直してください。")
    return int(numeric)


@contextmanager
def plot_environment(values, frame, sheet_name, filename):
    original_env = {key: value for key, value in os.environ.items() if key.startswith("PLOT_")}
    for key in original_env:
        del os.environ[key]
    os.environ.update(values)
    original_module = sys.modules.get("df_utils")
    adapter = ModuleType("df_utils")

    def load_table(**_kwargs):
        book = SimpleNamespace(fullname=f"/data/{filename}", name=filename)
        return frame, sheet_name, frame.columns.tolist(), book, "/data", filename

    adapter.load_df_xlwings_with_dialog_and_names = load_table
    sys.modules["df_utils"] = adapter
    original_fonts = plot_utils.configure_plot_fonts
    def browser_fonts():
        original_fonts()
        # Matplotlib expands a generic sans-serif name to just one face.
        # Explicit families allow per-glyph Japanese fallback in Agg/SVG/PDF.
        matplotlib.rcParams["font.family"] = matplotlib.rcParams["font.sans-serif"]
    plot_utils.configure_plot_fonts = browser_fonts
    try:
        browser_fonts()
        yield
    finally:
        plot_utils.configure_plot_fonts = original_fonts
        for key in list(os.environ):
            if key.startswith("PLOT_"):
                del os.environ[key]
        os.environ.update(original_env)
        if original_module is None:
            sys.modules.pop("df_utils", None)
        else:
            sys.modules["df_utils"] = original_module


class PlotEngine:
    def __init__(self, source_dir=None, font_path=None):
        self.source_dir = Path(source_dir or Path(__file__).parent)
        self.frame = None
        self.figure = None
        self.filename = ""
        self.sheet_name = ""
        self.font_family = "DejaVu Sans"
        self.font_families = {"DejaVu Sans"}
        if font_path:
            font_manager.fontManager.addfont(str(font_path))
            self.font_family = font_manager.FontProperties(fname=str(font_path)).get_name()
            self.font_families.add(self.font_family)
            for path in Path(font_path).parent.glob("LiberationSans-*.ttf"):
                font_manager.fontManager.addfont(str(path))
                self.font_families.add("Liberation Sans")
            if "Liberation Sans" in self.font_families:
                self.font_family = "Liberation Sans"
        matplotlib.rcParams.update({"svg.fonttype": "path", "pdf.fonttype": 42})

    def add_font(self, path):
        try:
            font_manager.fontManager.addfont(path)
            family = font_manager.FontProperties(fname=path).get_name()
        except Exception:
            raise ValueError("フォントを読み込めません。TTFまたはOTFファイルを選んでください。") from None
        self.font_families.add(family)
        return {"family": family}

    def load(self, path, filename, sheet_index=0, header_row=1):
        """Read saved files; Office and Tkinter are never imported."""
        header = number(header_row, "ヘッダー行", minimum=1, maximum=1000)
        if not header.is_integer():
            raise ValueError("ヘッダー行は整数で指定してください。")
        suffix = Path(filename).suffix.lower()
        if suffix == ".csv":
            sheets = ["CSV"]
            try:
                frame = pd.read_csv(path, encoding="utf-8-sig", header=int(header) - 1, nrows=MAX_ROWS + 1)
            except UnicodeDecodeError:
                frame = pd.read_csv(path, encoding="cp932", header=int(header) - 1, nrows=MAX_ROWS + 1)
            sheet_name = "CSV"
        elif suffix in {".xlsx", ".xlsm", ".xls"}:
            with pd.ExcelFile(path, engine="xlrd" if suffix == ".xls" else "openpyxl") as book:
                sheets = book.sheet_names
                index = column_index(sheet_index, len(sheets), "シート")
                sheet_name = sheets[index]
                frame = book.parse(sheet_name=sheet_name, header=int(header) - 1, nrows=MAX_ROWS + 1)
        else:
            raise ValueError("Excel（.xlsx / .xlsm / .xls）またはCSVを選んでください。")
        if len(frame) > MAX_ROWS or len(frame.columns) > MAX_COLUMNS:
            raise ValueError(f"Web版では{MAX_ROWS:,}行・{MAX_COLUMNS}列以内のファイルを使用してください。")
        # Empty Excel cover sheets still need their sheet selector in the UI.
        # Keep column indices unambiguous, including numeric and blank headers.
        names, seen = [], set()
        for index, name in enumerate(frame.columns):
            text = str(name).strip()[:200]
            if not text or text.startswith("Unnamed:"):
                text = f"列 {index + 1}"
            unique, duplicate = text, 2
            while unique in seen:
                unique = f"{text} [{duplicate}]"
                duplicate += 1
            names.append(unique)
            seen.add(unique)
        frame.columns = names
        columns = [
            {"index": index, "name": name, "numeric": int(pd.to_numeric(frame.iloc[:2000, index], errors="coerce").notna().sum())}
            for index, name in enumerate(names)
        ]
        rows = [[None if pd.isna(value) else str(value)[:140] for value in row] for row in frame.head(8).itertuples(index=False, name=None)]
        self.frame, self.filename, self.sheet_name = frame, filename, sheet_name
        return {"filename": filename, "sheets": sheets, "sheetIndex": sheets.index(sheet_name), "columns": columns, "rowCount": len(frame), "rows": rows}

    def _prepare(self, config):
        if self.frame is None:
            raise ValueError("先にExcel/CSVファイルを読み込んでください。")
        series = config.get("series", [])
        if not 1 <= len(series) <= MAX_SERIES:
            raise ValueError(f"系列を1〜{MAX_SERIES}個追加してください。")
        count = len(self.frame.columns)
        if count < 2:
            raise ValueError("X列とY列が必要です。シートとヘッダー行を確認してください。")
        axes = config.get("axes", {})
        width = number(axes.get("width", 4), "軸領域の幅", minimum=2, maximum=24)
        height = number(axes.get("height", 3), "軸領域の高さ", minimum=2, maximum=24)
        font_scale = number(axes.get("fontScale", 1), "文字サイズ", minimum=0.5, maximum=3)
        family = axes.get("fontFamily", self.font_family)
        japanese_family = axes.get("japaneseFontFamily", "Noto Sans JP")
        if family not in self.font_families:
            raise ValueError(f"フォント「{family}」を読み込んでください。設定JSONにはフォントファイルを含みません。")
        if japanese_family not in self.font_families:
            raise ValueError(f"日本語フォント「{japanese_family}」を読み込んでください。")
        values = {
            "PLOT_PREVIEW_ONLY": "1", "PLOT_SKIP_SHOW": "1", "PLOT_NO_PROMPT": "1",
            "PLOT_FONT_FAMILY": f"{family},{japanese_family},DejaVu Sans",
            "PLOT_AX_W_CM": str(width), "PLOT_AX_H_CM": str(height),
            "PLOT_FONTSIZE_LABEL_SCALE": str(font_scale * number(axes.get("labelFontScale", 1), "軸ラベル倍率", minimum=0.2, maximum=3)),
            "PLOT_FONTSIZE_TICK_SCALE": str(font_scale * number(axes.get("tickFontScale", 1), "目盛り文字倍率", minimum=0.2, maximum=3)),
            "PLOT_LEGEND_FONTSCALE": str(font_scale * number(axes.get("legendFontScale", 1), "凡例文字倍率", minimum=0.2, maximum=3)),
            "PLOT_LEGEND_SCALE": str(number(axes.get("legendScale", 1), "凡例サイズ倍率", minimum=0.2, maximum=3)),
            "PLOT_LINEWIDTH_SCALE": str(number(axes.get("spineScale", 1), "枠線倍率", minimum=0.1, maximum=5)),
            "PLOT_TICK_LENGTH": str(2.5 * number(axes.get("tickLength", 1), "目盛り長さ倍率", minimum=0, maximum=5)),
            "PLOT_SPINE_COLOR": str(axes.get("spineColor", "#000000")),
            "PLOT_PREVIEW_LEGEND": "1" if axes.get("legend", True) else "0",
            "PLOT_FIGURE_BACKGROUND_ALPHA": "0" if axes.get("transparent", True) else str(number(axes.get("backgroundAlpha", 1), "背景不透明度", minimum=0, maximum=1)),
            "PLOT_FIGURE_BACKGROUND_COLOR": str(axes.get("backgroundColor", "#ffffff")),
        }
        for key in ("PLOT_SPINE_COLOR", "PLOT_FIGURE_BACKGROUND_COLOR"):
            if not is_color_like(values[key]):
                raise ValueError("枠線・背景色を確認してください。")
        for key, env in {
            "hideXLabel": "HIDE_XLABEL", "hideYLabel": "HIDE_YLABEL",
            "hideXTickLabels": "HIDE_XTICKLABELS", "hideYTickLabels": "HIDE_YTICKLABELS",
            "hideXTicks": "HIDE_XTICKS", "hideYTicks": "HIDE_YTICKS", "hideMinorTicks": "HIDE_MINORTICKS",
            "spineLeft": "SPINE_LEFT", "spineRight": "SPINE_RIGHT", "spineTop": "SPINE_TOP", "spineBottom": "SPINE_BOTTOM",
            "yAxisRight": "YAXIS_RIGHT", "xAxisTop": "XAXIS_TOP",
        }.items():
            values[f"PLOT_{env}"] = "1" if axes.get(key, key.startswith("spine")) else "0"
        for key, env, default in (
            ("markerEdgeWidth", "GENERIC_SCATTER_EDGE_WIDTH", 0.6),
            ("errorLineWidth", "GENERIC_ERROR_LINEWIDTH", 0.8),
            ("errorCapSize", "GENERIC_ERROR_CAPSIZE", 3),
            ("errorCapThick", "GENERIC_ERROR_CAPTHICK", 0.8),
        ):
            values[f"PLOT_{env}"] = str(number(axes.get(key, default), "マーカー・誤差棒のサイズ", minimum=0, maximum=20))
        for axis in ("x", "y"):
            for key, env in (("LabelPad", "LABEL_PAD"), ("TickPad", "TICK_PAD")):
                values[f"PLOT_{axis.upper()}{env}"] = str(number(axes.get(f"{axis}{key}", 0), "軸の余白", minimum=-30, maximum=100))
            form = axes.get(f"{axis}LogFormat", "power")
            if form not in {"power", "decimal"}:
                raise ValueError("対数目盛りの表記を確認してください。")
            values[f"PLOT_{axis.upper()}LOG_FORMAT"] = form
        legend_x = number(axes.get("legendX", ""), "凡例X位置", optional=True)
        legend_y = number(axes.get("legendY", ""), "凡例Y位置", optional=True)
        if (legend_x is None) != (legend_y is None):
            raise ValueError("凡例のX・Y位置を両方指定してください。")
        values["PLOT_LEGEND_X"] = "" if legend_x is None else str(legend_x)
        values["PLOT_LEGEND_Y"] = "" if legend_y is None else str(legend_y)
        limits = {}
        for axis in ("x", "y"):
            scale = axes.get(f"{axis}Scale", "linear")
            if scale not in {"linear", "log"}:
                raise ValueError("軸の種類は線形または対数を選んでください。")
            values[f"PLOT_{axis.upper()}SCALE"] = scale
            for bound in ("Min", "Max"):
                value = number(axes.get(f"{axis}{bound}"), "軸範囲", optional=True)
                if scale == "log" and value is not None and value <= 0:
                    raise ValueError("対数軸の範囲には0より大きい値を入力してください。")
                limits[f"{axis}{bound}"] = value
                values[f"PLOT_{axis.upper()}{bound.upper()}"] = "" if value is None else str(value)
            lo, hi = limits[f"{axis}Min"], limits[f"{axis}Max"]
            if lo is not None and hi is not None and lo >= hi:
                raise ValueError("軸範囲の最小値は最大値より小さくしてください。")
            step = number(axes.get(f"{axis}Step"), "目盛り間隔", optional=True)
            if step is not None and step <= 0:
                raise ValueError("目盛り間隔は0より大きい値にしてください。")
            if scale == "log" and step is not None:
                raise ValueError("対数軸では目盛り間隔を空欄（自動）にしてください。")
            values[f"PLOT_{axis.upper()}TICK_STEP"] = "" if step is None else str(step)

        frame = self.frame
        draw_columns = {}
        keys = {key: [] for key in ("columns", "names", "colors", "modes", "widths", "markers", "sizes", "xoffsets", "yoffsets", "errors", "errorModes", "errorMins", "errorMaxs", "scatterColors", "edgeColors", "faceColors", "lineAlphas", "edgeAlphas", "faceAlphas")}
        diagnostics, warnings = [], []
        extents = {"x": [], "y": []}
        for index, item in enumerate(series):
            xi = column_index(item.get("x"), count, f"系列{index + 1}のX")
            yi = column_index(item.get("y"), count, f"系列{index + 1}のY")
            error = item.get("error", "")
            ei = -1 if error in (None, "", -1) else column_index(error, count, "誤差")
            error_mode = item.get("errorMode", "auto")
            if error_mode == "auto":
                error_mode = "none" if ei == -1 else "symmetric"
            if error_mode not in {"none", "symmetric", "minmax"}:
                raise ValueError("誤差の種類を確認してください。")
            if error_mode == "symmetric" and ei == -1:
                raise ValueError("誤差（±）の列を指定してください。")
            xoff = number(item.get("xOffset", 0), "Xオフセット")
            yoff = number(item.get("yOffset", 0), "Yオフセット")
            x = pd.to_numeric(frame.iloc[:, xi], errors="coerce").to_numpy(dtype=float) + xoff
            y = pd.to_numeric(frame.iloc[:, yi], errors="coerce").to_numpy(dtype=float) + yoff
            finite = np.isfinite(x) & np.isfinite(y)
            valid = finite.copy()
            if values["PLOT_XSCALE"] == "log":
                valid &= x > 0
            if values["PLOT_YSCALE"] == "log":
                valid &= y > 0
            name = str(item.get("name") or frame.columns[yi])[:200]
            if not valid.any():
                raise ValueError(f"「{name}」に描画できる数値の組がありません。列・軸・オフセットを確認してください。")
            if error_mode == "symmetric":
                error_values = pd.to_numeric(frame.iloc[:, ei], errors="coerce").to_numpy(dtype=float)
                if np.any(valid & np.isfinite(error_values) & (error_values < 0)):
                    raise ValueError(f"「{name}」の誤差には0以上の値を使用してください。")
                missing_errors = int((valid & ~np.isfinite(error_values)).sum())
                if missing_errors:
                    warnings.append(f"{name}: 空欄・非数値の誤差{missing_errors:,}点には誤差棒を描画しません")
            if error_mode == "minmax":
                mini = column_index(item.get("errorMin"), count, "誤差の最小値")
                maxi = column_index(item.get("errorMax"), count, "誤差の最大値")
                min_values = pd.to_numeric(frame.iloc[:, mini], errors="coerce").to_numpy(dtype=float) + yoff
                max_values = pd.to_numeric(frame.iloc[:, maxi], errors="coerce").to_numpy(dtype=float) + yoff
                if np.any(valid & np.isfinite(min_values) & (min_values > y)) or np.any(valid & np.isfinite(max_values) & (max_values < y)):
                    raise ValueError(f"「{name}」の誤差最小値 ≤ Y ≤ 誤差最大値にしてください。")
            excluded = int(len(frame) - valid.sum())
            if excluded:
                warnings.append(f"{name}: 空欄・非数値・対数軸の0以下の値を含む{excluded:,}点を除外")
            extents["x"].extend((float(x[valid].min()), float(x[valid].max())))
            extents["y"].extend((float(y[valid].min()), float(y[valid].max())))
            diagnostics.append({"name": name, "points": int(valid.sum())})
            color = str(item.get("color", plot_utils.COLORS["blue"][7]))
            if not is_color_like(color):
                raise ValueError("系列の色を選び直してください。")
            mode = item.get("mode", "line")
            marker = item.get("marker", "o")
            if mode not in {"line", "scatter", "line+scatter"} or marker not in {"o", "s", "^", "v", "D", "+", "x", "*", "p", "h"}:
                raise ValueError("描画方法とマーカーを選び直してください。")
            line_width = number(item.get("lineWidth", 1), "線幅", minimum=0, maximum=6)
            if mode == "line" and line_width == 0:
                raise ValueError("線のみの系列では線幅を0より大きくしてください。")
            linestyle = item.get("lineStyle", "-")
            if linestyle not in {"-", "--", "-.", ":"}:
                raise ValueError("線種を選び直してください。")
            keys.setdefault("styles", []).append(linestyle)
            # Project each series separately so log filtering and different
            # offsets on a shared input column cannot affect other series.
            draw_x = len(draw_columns)
            draw_columns[f"_x_{index}"] = np.where(valid, x, np.nan)
            draw_y = len(draw_columns)
            draw_columns[f"_y_{index}"] = np.where(valid, y, np.nan)
            draw_error = -1
            if error_mode == "symmetric":
                draw_error = len(draw_columns)
                draw_columns[f"_error_{index}"] = np.where(valid, error_values, np.nan)
            draw_min = draw_max = -1
            if error_mode == "minmax":
                draw_min = len(draw_columns)
                draw_columns[f"_min_{index}"] = np.where(valid, min_values, np.nan)
                draw_max = len(draw_columns)
                draw_columns[f"_max_{index}"] = np.where(valid, max_values, np.nan)
            keys["columns"].append(f"{draw_x}:{draw_y}")
            keys["names"].append(f"Series {index + 1}" if name.startswith("_") else name)
            keys["colors"].append(color)
            keys["modes"].append(mode)
            keys["widths"].append(str(line_width))
            keys["markers"].append(marker)
            keys["sizes"].append(str(number(item.get("markerSize", 18), "マーカーサイズ", minimum=1, maximum=200)))
            keys["xoffsets"].append("0")
            keys["yoffsets"].append("0")
            keys["errors"].append(str(draw_error))
            keys["errorModes"].append(error_mode)
            keys["errorMins"].append(str(draw_min))
            keys["errorMaxs"].append(str(draw_max))
            for key, target in (("scatterColor", "scatterColors"), ("markerEdgeColor", "edgeColors"), ("markerFaceColor", "faceColors")):
                token = str(item.get(key, "auto"))
                if token.lower() not in {"auto", "none"} and not is_color_like(token):
                    raise ValueError("線・マーカーの色を確認してください。")
                keys[target].append(token)
            for key, target, default in (("lineAlpha", "lineAlphas", 1), ("markerEdgeAlpha", "edgeAlphas", .8), ("markerFaceAlpha", "faceAlphas", .8)):
                keys[target].append(str(number(item.get(key, default), "系列の不透明度", minimum=0, maximum=1)))
            if index == 0:
                for axis, ci in (("X", xi), ("Y", yi)):
                    label = str(frame.columns[ci])
                    text, unit = label.rsplit("/", 1) if "/" in label else (label, "")
                    manual_text = str(axes.get(f"{axis.lower()}Label", "")).strip()
                    manual_unit = str(axes.get(f"{axis.lower()}Unit", "auto")).strip()
                    values[f"PLOT_{axis}LABEL_TEXT"] = manual_text or text.strip()
                    values[f"PLOT_{axis}UNIT"] = unit.strip() if manual_unit.lower() == "auto" else manual_unit
        for axis in ("x", "y"):
            step = values[f"PLOT_{axis.upper()}TICK_STEP"]
            lo = limits[f"{axis}Min"] if limits[f"{axis}Min"] is not None else min(extents[axis])
            hi = limits[f"{axis}Max"] if limits[f"{axis}Max"] is not None else max(extents[axis])
            if lo >= hi and (limits[f"{axis}Min"] is not None or limits[f"{axis}Max"] is not None):
                raise ValueError("指定した軸範囲にデータが入りません。範囲を確認してください。")
            if step and abs(hi - lo) / float(step) > 200:
                raise ValueError("目盛りが多すぎます。目盛り間隔を広げてください。")
        mappings = {
            "columns": "PLOT_COLUMN_MAP", "colors": "PLOT_SERIES_COLORS",
            "modes": "PLOT_GENERIC_DRAW_MODES", "widths": "PLOT_GENERIC_LINE_WIDTHS",
            "markers": "PLOT_GENERIC_MARKERS", "sizes": "PLOT_GENERIC_SCATTER_SIZES",
            "styles": "PLOT_GENERIC_LINESTYLES", "xoffsets": "PLOT_SERIES_XOFFSETS",
            "yoffsets": "PLOT_SERIES_YOFFSETS", "errors": "PLOT_GENERIC_ERROR_COLS",
            "errorModes": "PLOT_GENERIC_ERROR_MODES", "errorMins": "PLOT_GENERIC_ERROR_MIN_COLS", "errorMaxs": "PLOT_GENERIC_ERROR_MAX_COLS",
            "scatterColors": "PLOT_GENERIC_SCATTER_COLORS", "edgeColors": "PLOT_GENERIC_MARKER_EDGE_COLORS", "faceColors": "PLOT_GENERIC_MARKER_FACE_COLORS",
            "lineAlphas": "PLOT_GENERIC_LINE_ALPHAS", "edgeAlphas": "PLOT_GENERIC_MARKER_EDGE_ALPHAS", "faceAlphas": "PLOT_GENERIC_MARKER_FACE_ALPHAS",
        }
        values.update({target: ",".join(keys[key]) for key, target in mappings.items()})
        values["PLOT_SERIES_LABELS_JSON"] = json.dumps(keys["names"], ensure_ascii=False)
        return pd.DataFrame(draw_columns), values, diagnostics, warnings

    def render(self, config):
        frame, values, diagnostics, warnings = self._prepare(config)
        previous_figures = set(plt.get_fignums())
        figure = None
        try:
            with plot_environment(values, frame, self.sheet_name, self.filename), redirect_stdout(StringIO()):
                namespace = runpy.run_path(str(self.source_dir / "generic_xy_base.py"), run_name="__main__")
                figure, axes = namespace["fig"], namespace["ax"]
                position = config.get("axes", {}).get("legendPosition", "best")
                if position not in {"best", "upper right", "upper left", "lower right", "lower left"}:
                    raise ValueError("凡例の位置を選び直してください。")
                legend = axes.get_legend()
                if legend:
                    # Preserve apply_preview_legend()'s spacing and handle sizes.
                    if values["PLOT_LEGEND_X"] == "":
                        legend.set_loc(position)
                    for text, series in zip(legend.get_texts(), diagnostics):
                        text.set_text(series["name"])
                if config.get("axes", {}).get("grid", False):
                    axes.grid(True, alpha=0.15, linewidth=0.5)
                else:
                    axes.grid(False)
                plot_utils.ensure_axis_limits_include_data(axes)
                annotations = config.get("annotations", [])
                if not isinstance(annotations, list) or len(annotations) > 200:
                    raise ValueError("注釈は200個以内にしてください。")
                collection = AnnotationCollection()
                annotation_warnings = collection.load_list(annotations)
                if annotation_warnings:
                    raise ValueError("注釈の設定を確認してください。")
                for annotation in collection.items:
                    if annotation.type == "text":
                        if annotation.font_family == "Arial" and "Arial" not in self.font_families:
                            annotation.font_family = config.get("axes", {}).get("fontFamily", self.font_family)
                        annotation.font_family = [annotation.font_family, config.get("axes", {}).get("japaneseFontFamily", "Noto Sans JP"), "DejaVu Sans"]
                manager = AnnotationManager(collection, logger=warnings.append)
                manager.attach(figure, axes)
                figure.canvas.draw()
                # Hide off-screen log ticks before calculating the export box.
                for axis, limits in ((axes.xaxis, axes.get_xlim()), (axes.yaxis, axes.get_ylim())):
                    low, high = sorted(limits)
                    for tick in axis.get_major_ticks():
                        if not low <= tick.get_loc() <= high:
                            tick.label1.set_visible(False)
                            tick.label2.set_visible(False)
                figure.canvas.draw()
                plot_utils.expand_figure_to_include_artists(figure)
                image = BytesIO()
                figure.savefig(image, format="svg", bbox_inches="tight", pad_inches=0.05, transparent=values["PLOT_FIGURE_BACKGROUND_ALPHA"] == "0")
                renderer = figure.canvas.get_renderer()
                box = figure.get_tightbbox(renderer).padded(0.05)
                # Normalized SVG coordinates, Y increasing downwards, for WYSIWYG dragging.
                def svg_box(artist_box):
                    b = artist_box.transformed(figure.dpi_scale_trans.inverted())
                    return [(b.x0 - box.x0) / box.width, (box.y1 - b.y1) / box.height, b.width / box.width, b.height / box.height]
                geometry = {"axes": svg_box(axes.get_window_extent(renderer)), "legend": svg_box(legend.get_window_extent(renderer)) if legend else None, "annotations": []}
                for annotation in collection.items:
                    artist = manager.artist_by_id.get(annotation.id)
                    if isinstance(artist, list):
                        artist = artist[0]
                    if artist is not None and annotation.visible:
                        geometry["annotations"].append({"id": annotation.id, "box": svg_box(artist.get_window_extent(renderer))})
            if self.figure is not None:
                plt.close(self.figure)
            self.figure = figure
            self.transparent = values["PLOT_FIGURE_BACKGROUND_ALPHA"] == "0"
            self.annotation_manager = manager
            return {"svg": image.getvalue().decode("utf-8"), "series": diagnostics, "warnings": warnings, "xRange": list(axes.get_xlim()), "yRange": list(axes.get_ylim()), "geometry": geometry, "fontFamily": family if (family := config.get("axes", {}).get("fontFamily")) else self.font_family}
        except Exception:
            for figure_number in set(plt.get_fignums()) - previous_figures:
                plt.close(figure_number)
            raise

    def export(self, config, format_name, dpi=1200):
        if format_name not in {"svg", "png", "pdf"}:
            raise ValueError("SVG・PNG・PDFのいずれかを選んでください。")
        self.render(config)
        resolution = number(dpi, "PNG解像度", minimum=150, maximum=1200)
        width, height = self.figure.get_size_inches()
        if format_name == "png" and width * height * resolution**2 > 25_000_000:
            raise ValueError("画像が大きすぎます。軸領域のサイズまたはPNG解像度を小さくしてください。")
        image = BytesIO()
        self.figure.savefig(image, format=format_name, dpi=resolution, bbox_inches="tight", pad_inches=0.03, transparent=self.transparent)
        return {"format": format_name, "base64": base64.b64encode(image.getvalue()).decode("ascii")}

    def dispatch(self, operation, payload):
        args = json.loads(payload)
        if operation == "load":
            result = self.load(**args)
        elif operation == "render":
            result = self.render(args["config"])
        elif operation == "export":
            result = self.export(args["config"], args["format"], args.get("dpi", 1200))
        elif operation == "font":
            result = self.add_font(args["path"])
        else:
            raise ValueError("未対応の操作です。")
        return json.dumps(result, ensure_ascii=False, allow_nan=False)
