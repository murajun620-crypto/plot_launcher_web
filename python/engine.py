"""Browser adapter for the existing General/Matplotlib plot script.

Only this adapter replaces the desktop file picker. The plotting code is copied
unchanged from src by scripts/build_web.py and runs with the Agg backend.
"""

from __future__ import annotations

import base64
import ast
from contextlib import contextmanager, redirect_stdout
from io import BytesIO, StringIO
import json
import math
import os
from pathlib import Path
import runpy
import sys
import zipfile
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape
from types import ModuleType, SimpleNamespace

import matplotlib

matplotlib.use("Agg")
from matplotlib import font_manager, pyplot as plt
from matplotlib.colors import is_color_like
from matplotlib.backends.backend_svg import RendererSVG
from matplotlib.lines import Line2D
from matplotlib.collections import PathCollection, PolyCollection, LineCollection
from matplotlib.patches import Rectangle
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
    adapter.load_xpsfit_csv_table = lambda _path: (frame, frame.columns.tolist())
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
        catalog_path = self.source_dir.parent / "presets.json"
        if catalog_path.exists():
            catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        else:
            tree = ast.parse((self.source_dir / "launcher_constants.py").read_text(encoding="utf-8-sig"))
            constants = {node.targets[0].id: ast.literal_eval(node.value) for node in tree.body if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name) and node.targets[0].id in {"SCRIPT_MAP", "AXIS_LABEL_DEFAULTS"}}
            catalog = [{"id": key, "script": script, "labels": constants["AXIS_LABEL_DEFAULTS"][key]} for key, script in constants["SCRIPT_MAP"].items()]
        self.presets = {preset["id"]: preset for preset in catalog}
        try:
            from desktop_defaults import infer_plot_type_from_filename, gradient_colors_from_name
        except ImportError:
            import re, unicodedata
            source = (self.source_dir / "plot_settings.py").read_text(encoding="utf-8-sig")
            scope = {"Path": Path, "re": re, "unicodedata": unicodedata, "SCRIPT_MAP": self.presets, "mpl_cm": SimpleNamespace(get_cmap=matplotlib.colormaps.get_cmap), "mpl_colors": matplotlib.colors}
            for node in ast.parse(source).body:
                if isinstance(node, ast.FunctionDef) and node.name in {"_filename_match_parts", "infer_plot_type_from_filename", "gradient_colors_from_name"}:
                    exec(compile(ast.Module(body=[node], type_ignores=[]), "desktop_defaults", "exec"), scope)
            infer_plot_type_from_filename, gradient_colors_from_name = scope["infer_plot_type_from_filename"], scope["gradient_colors_from_name"]
        self.infer_plot_type = infer_plot_type_from_filename
        self.gradient_colors = gradient_colors_from_name
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
            # XPS exports can start with instrument metadata, before the table.
            import csv
            with open(path, encoding="utf-8-sig", errors="replace", newline="") as stream:
                xps_header = next((i + 1 for i, row in enumerate(csv.reader(stream)) if len(row) >= 2 and row[0].strip().lower() == "abscissa" and row[1].strip().lower() == "ordinate"), None)
            if xps_header and header_row == 1:
                header = xps_header
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
        self.xps_csv = suffix == ".csv" and bool(xps_header)
        return {"filename": filename, "sheets": sheets, "sheetIndex": sheets.index(sheet_name), "columns": columns, "rowCount": len(frame), "rows": rows, "headerRow": int(header), "xpsCSV": self.xps_csv, "plotType": "XPS Fit" if self.xps_csv else self.infer_plot_type(filename)}

    def _prepare(self, config):
        preset = config.get("plotType", "General")
        if preset not in self.presets:
            raise ValueError("プロット種別を選び直してください。")
        if self.frame is None:
            raise ValueError("先にExcel/CSVファイルを読み込んでください。")
        series = config.get("series", [])
        options = config.get("options", {})
        if not isinstance(options, dict):
            raise ValueError("専用プロットの設定を確認してください。")
        if preset in {"XPS Fit", "Particle Histogram"} and series:
            first = series[0]
            diameter = options.get("diameterColumn", min(2, len(self.frame.columns) - 1)) if self.frame is not None else 0
            series = [{"x": first.get("x", 0) if preset == "XPS Fit" else diameter, "y": first.get("y", 1) if preset == "XPS Fit" else diameter, "name": first.get("name", "Raw"), "visible": first.get("visible", True)}]
        if not 1 <= len(series) <= MAX_SERIES:
            raise ValueError(f"系列を1〜{MAX_SERIES}個追加してください。")
        count = len(self.frame.columns)
        if count < 2:
            raise ValueError("X列とY列が必要です。シートとヘッダー行を確認してください。")
        axes = config.get("axes", {})
        width = number(axes.get("width", 4), "軸領域の幅", minimum=0.5, maximum=24)
        height = number(axes.get("height", 3), "軸領域の高さ", minimum=0.5, maximum=24)
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
            "PLOT_DATA_LINE_SCALE": str(number(axes.get("dataLineScale", 1), "データ線倍率", minimum=0, maximum=6)),
            "PLOT_TICK_LENGTH": str(2.5 * number(axes.get("tickLength", 1), "目盛り長さ倍率", minimum=0, maximum=5)),
            "PLOT_SPINE_COLOR": str(axes.get("spineColor", "#000000")),
            "PLOT_PREVIEW_LEGEND": "1" if axes.get("legend", True) else "0",
            "PLOT_FIGURE_BACKGROUND_ALPHA": "0" if axes.get("transparent", True) else str(number(axes.get("backgroundAlpha", 1), "背景不透明度", minimum=0, maximum=1)),
            "PLOT_FIGURE_BACKGROUND_COLOR": str(axes.get("backgroundColor", "#ffffff")),
            "PLOT_AXES_BACKGROUND_COLOR": str(axes.get("plotBackgroundColor", "#ffffff")),
            "PLOT_AXES_BACKGROUND_ALPHA": str(number(axes.get("plotBackgroundAlpha", 1), "枠内背景不透明度", minimum=0, maximum=1)) if axes.get("plotBackgroundEnabled", False) else "0",
        }
        for key in ("PLOT_SPINE_COLOR", "PLOT_FIGURE_BACKGROUND_COLOR", "PLOT_AXES_BACKGROUND_COLOR"):
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
                values[f"PLOT_{axis.upper()}{env}"] = str(number(axes.get(f"{axis}{key}", 0), "軸の余白", minimum=-100, maximum=100))
            # Without tick numbers the native label falls against the spine.
            # Keep a 6 pt base gap (at the standard 8 pt label size); the UI
            # padding remains an extra offset and manual coordinates win later.
            if axis == "y" and preset in {"EDX", "XPS Survey", "XPS Core", "XPS Fit", "XAFS", "Raman Spectrum"} and axes.get("hideYTickLabels", False):
                base_gap = 6 * font_scale * number(axes.get("labelFontScale", 1), "軸ラベル倍率", minimum=0.2, maximum=3)
                values["PLOT_YLABEL_PAD"] = str(float(values["PLOT_YLABEL_PAD"]) + base_gap)
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
            if not isinstance(item.get("visible", True), bool):
                raise ValueError("系列の描画オン・オフを確認してください。")
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
            categorical = preset == "bar_graph_general" and not np.isfinite(x).all()
            if categorical:
                x = np.arange(len(frame), dtype=float)
            if preset == "Particle Histogram":
                x = np.arange(len(frame), dtype=float)
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
            diagnostics.append({"name": name, "points": int(valid.sum()), "visible": item.get("visible", True)})
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
            if categorical:
                draw_columns[f"_x_{index}"] = frame.iloc[:, xi].astype(str).to_numpy()
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
        for key, env, default, lo, hi in (
            ("barWidth", "BAR_WIDTH", .8, .01, 100), ("barAlpha", "BAR_ALPHA", .9, 0, 1),
            ("barEdgeWidth", "BAR_EDGE_WIDTH", .4, 0, 20),
            ("depthStep", "R3D_DEPTH_STEP", 1, .01, 10000),
            ("scatterSize", "XPSFIT_SCATTER_SIZE", 18, 0, 500),
            ("scatterEdgeWidth", "XPSFIT_SCATTER_EDGE_WIDTH", .6, 0, 20),
            ("scatterAlpha", "XPSFIT_SCATTER_ALPHA", .8, 0, 1),
            ("fitLineWidth", "XPSFIT_FIT_LINE_WIDTH", 0, 0, 20),
            ("bgLineWidth", "XPSFIT_BG_LINE_WIDTH", 0, 0, 20),
        ):
            values[f"PLOT_{env}"] = str(number(options.get(key, default), key, minimum=lo, maximum=hi))
        for key, env, default in (("barEdgeColor", "BAR_EDGE_COLOR", "auto"), ("scatterEdgeColor", "XPSFIT_SCATTER_EDGE_COLOR", "#2A2A2A"), ("scatterFaceColor", "XPSFIT_SCATTER_FACE_COLOR", "#ffffff"), ("fitLineColor", "XPSFIT_FIT_LINE_COLOR", "#2A2A2A"), ("bgLineColor", "XPSFIT_BG_LINE_COLOR", "#8A8A8A")):
            value = str(options.get(key, default))
            if value not in {"auto", "none"} and not is_color_like(value):
                raise ValueError("専用設定の色を確認してください。")
            values[f"PLOT_{env}"] = value
        values["PLOT_R3D_NORMALIZE"] = "1" if options.get("normalize", True) else "0"
        if preset == "Particle Histogram":
            diameter = column_index(options.get("diameterColumn", series[0]["y"]), count, "粒径")
            data = pd.to_numeric(self.frame.iloc[:, diameter], errors="coerce").replace([np.inf, -np.inf], np.nan)
            if not (np.isfinite(data) & (data > 0)).any():
                raise ValueError("粒径には正の数値が必要です。")
            if data.max() / 20 > 10000:
                raise ValueError("粒径の単位・列を確認してください。Web版では幅20 nmのビンを1万個以内にしてください。")
            diagnostics = [{"name": str(self.frame.columns[diameter]), "points": int((np.isfinite(data) & (data > 0)).sum()), "visible": series[0].get("visible", True)}]
            return pd.DataFrame({"_index": np.arange(len(data)), "_unused": data, str(self.frame.columns[diameter]): data}), values, diagnostics, warnings
        if preset == "XPS Fit":
            if count < 8:
                raise ValueError("XPS Fitは8列以上の表が必要です（CSV: A=abscissa、B=ordinate、D=background、G=fit、H以降=peak）。")
            fills = options.get("fills", [])
            rules, colors, alphas = [], [], []
            for fill in fills:
                rules.append(":".join(str(column_index(fill.get(key), count, "XPS成分")) for key in ("x", "upper", "lower")))
                color = str(fill.get("color", "#F7574A"))
                if not is_color_like(color):
                    raise ValueError("XPS成分の色を確認してください。")
                colors.append(color)
                alphas.append(str(number(fill.get("alpha", .3), "XPS成分の不透明度", minimum=0, maximum=1)))
            values["PLOT_XPSFIT_FILL_MAP"] = ",".join(rules)
            values["PLOT_XPSFIT_FILL_COLORS"] = ",".join(colors)
            values["PLOT_XPSFIT_FILL_ALPHAS"] = ",".join(alphas)
            values["PLOT_XPSFIT_SCATTER_MAP"] = f'{series[0]["x"]}:{series[0]["y"]}'
            if getattr(self, "xps_csv", False):
                values["PLOT_XLSX_PATH"] = "/data/xps.csv"
            return self.frame.apply(pd.to_numeric, errors="coerce"), values, diagnostics, warnings
        if preset == "Raman 3D":
            # Native waterfall consumes first X plus all subsequent Y columns.
            first_x = np.asarray(draw_columns["_x_0"])
            for index in range(1, len(series)):
                if not np.array_equal(first_x, np.asarray(draw_columns[f"_x_{index}"]), equal_nan=True):
                    raise ValueError("Raman 3Dでは各系列に同じX列・Xオフセットを指定してください。")
            return pd.DataFrame({"_x": first_x, **{f"_y_{i}": draw_columns[f"_y_{i}"] for i in range(len(series))}}), values, diagnostics, warnings
        return pd.DataFrame(draw_columns), values, diagnostics, warnings

    def _series_artists(self, axes, namespace, preset, config):
        """Keep series indices and limits stable when temporarily hiding data."""
        extra = []
        if preset in {"General", "Roughness"}:
            handles = namespace["legend_handles"]
            children = [artist for artist in axes.get_children() if isinstance(artist, (Line2D, PathCollection, LineCollection, PolyCollection))]
            starts = [children.index(handle) for handle in handles]
            groups = [children[start:(starts[i + 1] if i + 1 < len(starts) else len(children))] for i, start in enumerate(starts)]
        elif preset == "bar_graph_general":
            groups = [list(container.patches) for container in axes.containers if hasattr(container, "patches")]
        elif preset == "Particle Histogram":
            groups = [list(axes.patches) + list(axes.lines)]
            options = config.get("options", {})
            for patch in axes.patches:
                if "histogramColor" in options:
                    patch.set_facecolor(options["histogramColor"])
                    patch.set_edgecolor(options["histogramColor"])
                if "histogramAlpha" in options:
                    patch.set_alpha(number(options["histogramAlpha"], "分布の不透明度", minimum=0, maximum=1))
            for line in axes.lines:
                if "histogramFitColor" in options:
                    line.set_color(options["histogramFitColor"])
                if "histogramFitWidth" in options:
                    line.set_linewidth(number(options["histogramFitWidth"], "分布曲線の線幅", minimum=0, maximum=20))
        elif preset == "XPS Fit":
            groups = [[artist for artist in axes.collections if isinstance(artist, PathCollection)]]
            extra = [{"part": "preset", "artists": list(axes.lines) + [artist for artist in axes.collections if isinstance(artist, PolyCollection)]}]
        else:
            groups = [[line] for line in axes.lines]
        result = []
        for index, artists in enumerate(groups):
            visible = config.get("series", [])[index].get("visible", True)
            for artist in artists:
                artist.set_visible(visible)
            result.append({"index": index, "artists": artists})
        return result + extra

    @staticmethod
    def _data_geometry(groups, axes, box, renderer):
        """Normalize visible artist paths to the exported SVG, rather than data bounds."""
        def point(xy):
            x, y = xy / 72
            return [round(float((x - box.x0) / box.width), 7), round(float((box.y1 - y) / box.height), 7)]

        result = []
        for group in groups:
            entry = {key: group[key] for key in ("index", "part") if key in group}
            entry.update(paths=[], points=[], boxes=[], polygons=[])
            for artist in group["artists"]:
                if not artist.get_visible() or artist.get_alpha() == 0:
                    continue
                if isinstance(artist, Line2D) and artist.get_linewidth() <= 0 and artist.get_marker() in (None, "None", "", " "):
                    continue
                if isinstance(artist, PathCollection):
                    colors = [*artist.get_facecolors(), *artist.get_edgecolors()]
                    if not any(color[3] > 0 for color in colors):
                        continue
                    sizes = artist.get_sizes()
                    entry["pointRadius"] = float(np.sqrt(max(sizes, default=0)) / (2 * 72 * box.width))
                    offsets = artist.get_offset_transform().transform(artist.get_offsets())
                    seen = set()
                    for xy in offsets:
                        if np.ma.is_masked(xy) or not np.isfinite(xy).all() or not axes.bbox.contains(*xy):
                            continue
                        key = tuple(np.round(xy, 1))
                        if key not in seen:
                            seen.add(key)
                            entry["points"].append(point(xy))
                    continue
                if isinstance(artist, Rectangle):
                    b = artist.get_window_extent(renderer)
                    x0, y0 = max(b.x0, axes.bbox.x0), max(b.y0, axes.bbox.y0)
                    x1, y1 = min(b.x1, axes.bbox.x1), min(b.y1, axes.bbox.y1)
                    if x1 > x0 and y1 > y0:
                        p0, p1 = point(np.array([x0, y1])), point(np.array([x1, y0]))
                        entry["boxes"].append([*p0, p1[0] - p0[0], p1[1] - p0[1]])
                    continue
                paths = artist.get_paths() if hasattr(artist, "get_paths") else [artist.get_path()]
                for path in paths:
                    path = path.transformed(artist.get_transform())
                    if len(path.vertices) == 1 and not axes.bbox.padded(12).contains(*path.vertices[0]):
                        continue
                    path = path.cleaned(remove_nans=True, simplify=True, clip=axes.bbox.extents)
                    segment = []
                    for xy, code in zip(path.vertices, path.codes):
                        if code in (0, 1, 79):
                            if segment:
                                entry["polygons" if isinstance(artist, PolyCollection) else "paths"].append(segment)
                            segment = []
                        if code in (1, 2) and np.isfinite(xy).all():
                            segment.append(point(xy))
                    if segment:
                        entry["polygons" if isinstance(artist, PolyCollection) else "paths"].append(segment)
            result.append(entry)
        return result

    def render(self, config):
        frame, values, diagnostics, warnings = self._prepare(config)
        previous_figures = set(plt.get_fignums())
        figure = None
        try:
            with plot_environment(values, frame, self.sheet_name, self.filename), redirect_stdout(StringIO()):
                preset = config.get("plotType", "General")
                namespace = runpy.run_path(str(self.source_dir / self.presets[preset]["script"]), run_name="__main__")
                figure, axes = namespace["fig"], namespace["ax"]
                series_groups = self._series_artists(axes, namespace, preset, config)
                statistics = None
                if preset == "Particle Histogram":
                    statistics = {"median": float(namespace["median"]), "mean": float(namespace["mean"])}
                    if namespace["sigma"] <= 1e-12:
                        warnings.append("すべて同じ粒径のため対数正規分布曲線は描画されません。")
                if preset == "bar_graph_general" and not namespace.get("is_numeric_x", True):
                    axes.set_xticks(np.arange(len(frame)), [str(value) for value in frame.iloc[:, 0]])
                position = config.get("axes", {}).get("legendPosition", "best")
                if position not in {"best", "upper right", "upper left", "lower right", "lower left"}:
                    raise ValueError("凡例の位置を選び直してください。")
                legend = axes.get_legend()
                if legend and any(not item["visible"] for item in diagnostics):
                    handles, labels = axes.get_legend_handles_labels()
                    visible = [i for i, item in enumerate(diagnostics) if item["visible"]]
                    legend.remove()
                    if visible and preset not in {"XPS Fit", "Particle Histogram"}:
                        plot_utils.apply_preview_legend(axes, handles=[handles[i] for i in visible], labels=[diagnostics[i]["name"] for i in visible])
                    legend = axes.get_legend()
                if legend:
                    # Preserve apply_preview_legend()'s spacing and handle sizes.
                    if values["PLOT_LEGEND_X"] == "":
                        legend.set_loc(position)
                    if preset not in {"XPS Fit", "Particle Histogram"}:
                        for text, series in zip(legend.get_texts(), [item for item in diagnostics if item["visible"]]):
                            text.set_text(series["name"])
                if config.get("axes", {}).get("grid", False):
                    axes.grid(True, alpha=0.15, linewidth=0.5)
                else:
                    axes.grid(False)
                if preset in {"General", "Roughness"}:
                    plot_utils.ensure_axis_limits_include_data(axes)
                if preset == "Raman 3D":
                    options = config.get("options", {})
                    axes.view_init(elev=number(options.get("elevation", 24), "仰角", minimum=-180, maximum=180), azim=number(options.get("azimuth", -66), "方位角", minimum=-360, maximum=360))
                    axes.set_ylabel(str(options.get("depthLabel", "Series")))
                    overlay = figure.add_axes(axes.get_position(), frameon=False)
                    overlay.set_xlim(axes.get_xlim()); overlay.set_ylim(axes.get_zlim())
                    overlay.set_axis_off()
                    annotation_axes = overlay
                else:
                    annotation_axes = axes
                # Figure and plot-area backgrounds each have their own fill.
                plot_utils.apply_plot_background_from_env(figure, [])
                for target in figure.axes:
                    target.patch.set_facecolor("none")
                    target.patch.set_alpha(0)
                    if target.name == "3d":
                        for axis in (target.xaxis, target.yaxis, target.zaxis):
                            axis.pane.set_fill(False)
                axes.patch.set_facecolor(values["PLOT_AXES_BACKGROUND_COLOR"])
                axes.patch.set_alpha(float(values["PLOT_AXES_BACKGROUND_ALPHA"]))
                editable_axes = [("x", axes.xaxis), ("y", axes.zaxis if preset == "Raman 3D" else axes.yaxis)]
                positioned_labels = {}
                if preset == "Raman 3D":
                    figure.canvas.draw()  # Resolve the native projected label rotations first.
                for name, axis in editable_axes:
                    axis.label.set_fontweight("normal")
                    position = [number(config.get("axes", {}).get(f"{name}Label{coordinate}", ""), "軸ラベル位置", minimum=-10, maximum=10, optional=True) for coordinate in ("X", "Y")]
                    if (position[0] is None) != (position[1] is None):
                        raise ValueError("軸ラベルのX・Y位置を両方指定してください。")
                    if position[0] is not None:
                        if preset == "Raman 3D":
                            # 3D Axis overwrites its label transform, including after
                            # Text.draw in newer Matplotlib. Keep the native typography
                            # on a separate, stable 2D artist for manual placement.
                            label = axis.label
                            positioned_labels[name] = axes.text2D(*position, label.get_text(), transform=axes.transAxes,
                                fontproperties=label.get_fontproperties(), color=label.get_color(),
                                horizontalalignment=label.get_ha(), verticalalignment=label.get_va(),
                                rotation=label.get_rotation(), visible=label.get_visible(), clip_on=False)
                            label.set_visible(False)
                        else:
                            axis.set_label_coords(*position)
                annotations = config.get("annotations", [])
                if not isinstance(annotations, list) or len(annotations) > 200:
                    raise ValueError("注釈は200個以内にしてください。")
                native_annotations = json.loads(json.dumps(annotations))
                for item in native_annotations:
                    if item.get("type") != "text" and item.get("coordinate_system") == "axes_fraction":
                        for suffix in ("1", "2"):
                            xy = annotation_axes.transData.inverted().transform(annotation_axes.transAxes.transform((item[f"x{suffix}"], item[f"y{suffix}"])))
                            item[f"x{suffix}"], item[f"y{suffix}"] = map(float, xy)
                        item["coordinate_system"] = "data"
                collection = AnnotationCollection()
                annotation_warnings = collection.load_list(native_annotations)
                if annotation_warnings:
                    raise ValueError("注釈の設定を確認してください。")
                for annotation in collection.items:
                    if annotation.type == "text":
                        if annotation.font_family == "Arial" and "Arial" not in self.font_families:
                            annotation.font_family = config.get("axes", {}).get("fontFamily", self.font_family)
                        annotation.font_family = [annotation.font_family, config.get("axes", {}).get("japaneseFontFamily", "Noto Sans JP"), "DejaVu Sans"]
                manager = AnnotationManager(collection, logger=warnings.append)
                manager.attach(figure, annotation_axes)
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
                extra_artists = [positioned_labels.get("x", axes.xaxis.label), axes.yaxis.label, positioned_labels.get("y", axes.zaxis.label)] if preset == "Raman 3D" else None
                figure.savefig(image, format="svg", bbox_inches="tight", bbox_extra_artists=extra_artists, pad_inches=0.05, transparent=False)
                # Hit areas must use SVG text metrics, exactly as the preview,
                # rather than Agg bitmap metrics (noticeably different fonts).
                original_dpi = figure.dpi
                figure.set_dpi(72)
                size = figure.get_size_inches() * 72
                renderer = RendererSVG(*size, StringIO())
                figure.draw(renderer)
                box = figure.get_tightbbox(renderer, bbox_extra_artists=extra_artists).padded(0.05)
                # Normalized SVG coordinates, Y increasing downwards, for WYSIWYG dragging.
                def svg_box(artist_box):
                    b = artist_box.transformed(figure.dpi_scale_trans.inverted())
                    return [(b.x0 - box.x0) / box.width, (box.y1 - b.y1) / box.height, b.width / box.width, b.height / box.height]
                geometry = {"axes": svg_box(axes.get_window_extent(renderer)), "legend": svg_box(legend.get_window_extent(renderer)) if legend else None, "annotations": [], "axisLabels": [], "tickLabels": []}
                geometry["series"] = self._data_geometry(series_groups, axes, box, renderer)
                geometry["spines"] = [{"id": side, "paths": self._data_geometry([{"artists": [spine]}], axes, box, renderer)[0]["paths"]} for side, spine in axes.spines.items() if spine.get_visible() and preset != "Raman 3D"]
                geometry["grid"] = self._data_geometry([{"part": "grid", "artists": [line for line in axes.get_xgridlines() + axes.get_ygridlines() if line.get_visible()]}], axes, box, renderer)
                geometry["grid"] += self._data_geometry([{"part": "grid", "artists": [line for axis in (axes.xaxis, axes.yaxis) for tick in [*axis.get_major_ticks(), *axis.get_minor_ticks()] for line in (tick.tick1line, tick.tick2line) if line.get_visible()]}], axes, box, renderer)
                if preset == "Raman 3D":
                    geometry["depth"] = [svg_box(label.get_window_extent(renderer)) for label in [axes.yaxis.label, *axes.yaxis.get_ticklabels()] if label.get_visible() and label.get_text()]
                for name, axis in editable_axes:
                    label = positioned_labels.get(name, axis.label)
                    if label.get_visible() and label.get_text():
                        anchor = axes.transAxes.inverted().transform(label.get_transform().transform(label.get_position()))
                        geometry["axisLabels"].append({"id": f"axis-label-{name}", "axis": name, "kind": "label", "box": svg_box(label.get_window_extent(renderer)), "anchor": list(map(float, anchor))})
                    for index, label in enumerate(axis.get_ticklabels()):
                        if label.get_visible() and label.get_text():
                            geometry["tickLabels"].append({"id": f"axis-ticks-{name}-{index}", "axis": name, "kind": "ticks", "box": svg_box(label.get_window_extent(renderer))})
                for annotation in collection.items:
                    artist = manager.artist_by_id.get(annotation.id)
                    if isinstance(artist, list):
                        artist = artist[0]
                    if artist is not None and annotation.visible:
                        entry = {"id": annotation.id, "box": svg_box(artist.get_window_extent(renderer))}
                        if annotation.type != "text":
                            points = annotation_axes.transData.transform([(annotation.x1, annotation.y1), (annotation.x2, annotation.y2)]) / figure.dpi
                            entry["points"] = [[(x - box.x0) / box.width, (box.y1 - y) / box.height] for x, y in points]
                        geometry["annotations"].append(entry)
                figure.set_dpi(original_dpi)
            if self.figure is not None:
                plt.close(self.figure)
            self.figure = figure
            # Patches already hold their alpha; transparent=True would erase
            # a separately enabled axes fill when the figure is transparent.
            self.transparent = False
            self.annotation_manager = manager
            self.export_extra_artists = extra_artists
            return {"svg": image.getvalue().decode("utf-8"), "series": [item for item in diagnostics if item["visible"]], "warnings": warnings, "statistics": statistics, "xRange": list(annotation_axes.get_xlim()), "yRange": list(annotation_axes.get_ylim()), "geometry": geometry, "fontFamily": family if (family := config.get("axes", {}).get("fontFamily")) else self.font_family}
        except Exception:
            for figure_number in set(plt.get_fignums()) - previous_figures:
                plt.close(figure_number)
            raise

    def export(self, config, format_name, dpi=1200):
        if format_name not in {"svg", "png", "pdf", "pptx"}:
            raise ValueError("SVG・PNG・PDF・PowerPointのいずれかを選んでください。")
        self.render(config)
        if format_name == "pptx":
            return {"format": "pptx", "base64": base64.b64encode(self.powerpoint_file()).decode("ascii")}
        resolution = number(dpi, "PNG解像度", minimum=150, maximum=1200)
        width, height = self.figure.get_size_inches()
        if format_name == "png" and width * height * resolution**2 > 25_000_000:
            raise ValueError("画像が大きすぎます。軸領域のサイズまたはPNG解像度を小さくしてください。")
        image = BytesIO()
        self.figure.savefig(image, format=format_name, dpi=resolution, bbox_inches="tight", bbox_extra_artists=self.export_extra_artists, pad_inches=0.03, transparent=self.transparent)
        return {"format": format_name, "base64": base64.b64encode(image.getvalue()).decode("ascii")}

    def powerpoint_file(self):
        """One slide: vector SVG with PNG fallback, editable panel caption.

        Uses the checked-in blank slide template, and only Python stdlib in WASM.
        """
        p = "http://schemas.openxmlformats.org/presentationml/2006/main"
        a = "http://schemas.openxmlformats.org/drawingml/2006/main"
        r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
        svg_ns = "http://schemas.microsoft.com/office/drawing/2016/SVG/main"
        rel_ns = "http://schemas.openxmlformats.org/package/2006/relationships"
        for prefix, ns in (("p", p), ("a", a), ("r", r), ("asvg", svg_ns)):
            ET.register_namespace(prefix, ns)
        figure = self.figure
        figure.canvas.draw()
        renderer = figure.canvas.get_renderer()
        bbox = figure.get_tightbbox(renderer, bbox_extra_artists=self.export_extra_artists).padded(.03)
        caption = next((item for item in self.annotation_manager.annotations.items if item.id in {"__panel_label__", "panel-label"} and item.visible), None)
        caption_artist = self.annotation_manager.artist_by_id.get(caption.id) if caption else None
        caption_bbox = caption_artist.get_window_extent(renderer).transformed(figure.dpi_scale_trans.inverted()) if caption_artist else None
        if caption_artist:
            caption_artist.set_visible(False)
        images = {}
        try:
            for fmt in ("svg", "png"):
                buffer = BytesIO()
                figure.savefig(buffer, format=fmt, bbox_inches=bbox, dpi=300, transparent=self.transparent)
                images[fmt] = buffer.getvalue()
        finally:
            if caption_artist:
                caption_artist.set_visible(True)
        template = self.source_dir.parent / "assets/plot-template.pptx"
        if not template.exists():
            template = self.source_dir.parent / "web/assets/plot-template.pptx"
        with zipfile.ZipFile(template) as source:
            parts = {name: source.read(name) for name in source.namelist()}
        slide = ET.fromstring(parts["ppt/slides/slide1.xml"])
        relationships = ET.fromstring(parts["ppt/slides/_rels/slide1.xml.rels"])
        image_id = slide.find(f".//{{{a}}}blip").get(f"{{{r}}}embed")
        png_target = next(item.get("Target") for item in relationships if item.get("Id") == image_id)
        parts["ppt/" + png_target.removeprefix("../")] = images["png"]
        ET.SubElement(relationships, f"{{{rel_ns}}}Relationship", {"Id": "rIdWebSVG", "Type": r + "/image", "Target": "../media/plot.svg"})
        blip = slide.find(f".//{{{a}}}blip")
        ext = ET.SubElement(ET.SubElement(blip, f"{{{a}}}extLst"), f"{{{a}}}ext", {"uri": "{96DAC541-7B7A-43D3-8B79-37D633B846F1}"})
        ET.SubElement(ext, f"{{{svg_ns}}}svgBlip", {f"{{{r}}}embed": "rIdWebSVG"})
        # Preserve physical dimensions; large figures get a larger blank slide.
        width, height = max(13.333333, bbox.width + 1), max(7.5, bbox.height + 1)
        x, y = (width - bbox.width) / 2, (height - bbox.height) / 2
        emu = lambda value: str(round(value * 914400))
        transform = slide.find(f".//{{{p}}}pic/{{{p}}}spPr/{{{a}}}xfrm")
        transform.find(f"{{{a}}}off").attrib.update(x=emu(x), y=emu(y))
        transform.find(f"{{{a}}}ext").attrib.update(cx=emu(bbox.width), cy=emu(bbox.height))
        presentation = ET.fromstring(parts["ppt/presentation.xml"])
        presentation.find(f"{{{p}}}sldSz").attrib.update(cx=emu(width), cy=emu(height))
        if caption_bbox is not None:
            color = matplotlib.colors.to_hex(caption.color).lstrip("#").upper()
            font = caption.font_family[0] if isinstance(caption.font_family, list) else caption.font_family
            shape = ET.fromstring(f'''<p:sp xmlns:p="{p}" xmlns:a="{a}"><p:nvSpPr><p:cNvPr id="3" name="Panel label"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm rot="{round(-caption.rotation*60000)}"><a:off x="{emu(x+caption_bbox.x0-bbox.x0)}" y="{emu(y+bbox.y1-caption_bbox.y1)}"/><a:ext cx="{emu(caption_bbox.width+.02)}" cy="{emu(caption_bbox.height+.02)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr lIns="0" rIns="0" tIns="0" bIns="0" anchor="ctr"/><a:lstStyle/><a:p><a:pPr/><a:r><a:rPr sz="{round(caption.font_size*100)}" b="{int(caption.bold)}" i="{int(caption.italic)}"><a:solidFill><a:srgbClr val="{color}"><a:alpha val="{round(caption.opacity*100000)}"/></a:srgbClr></a:solidFill><a:latin typeface="{escape(str(font), {'"': '&quot;'})}"/></a:rPr><a:t>{escape(caption.text)}</a:t></a:r><a:endParaRPr/></a:p></p:txBody></p:sp>''')
            slide.find(f".//{{{p}}}spTree").append(shape)
        content_types = ET.fromstring(parts["[Content_Types].xml"])
        ET.SubElement(content_types, "{http://schemas.openxmlformats.org/package/2006/content-types}Default", {"Extension": "svg", "ContentType": "image/svg+xml"})
        for name, element in (("ppt/slides/slide1.xml", slide), ("ppt/slides/_rels/slide1.xml.rels", relationships), ("ppt/presentation.xml", presentation), ("[Content_Types].xml", content_types)):
            parts[name] = ET.tostring(element, encoding="utf-8", xml_declaration=True)
        parts["ppt/media/plot.svg"] = images["svg"]
        output = BytesIO()
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as destination:
            for name, data in parts.items():
                destination.writestr(name, data)
        return output.getvalue()

    def align_annotations(self, config, ids, operation):
        self.render(config)
        manager = self.annotation_manager
        manager.selected_ids = set(ids)
        # The desktop alignment algorithm is retained. Its offsets are adapted
        # to display coordinates for mixed axes-fraction/data and log axes.
        manager._annotation_bounds = manager._annotation_display_bounds
        def offset_in_display(annotation, dx, dy):
            ax = manager.axes[annotation.axes_id]
            transform = manager._annotation_transform(annotation, ax)
            suffixes = ("",) if annotation.type == "text" else ("1", "2")
            for suffix in suffixes:
                xy = transform.inverted().transform(transform.transform((getattr(annotation, f"x{suffix}"), getattr(annotation, f"y{suffix}"))) + np.array([dx, dy]))
                setattr(annotation, f"x{suffix}", float(xy[0]))
                setattr(annotation, f"y{suffix}", float(xy[1]))
            manager._update_annotation_artist(annotation)
        manager._offset_annotation = offset_in_display
        manager.align_selected(operation)
        items = json.loads(json.dumps(config.get("annotations", [])))
        for item in items:
            annotation = manager.annotations.get(item["id"])
            if annotation is None:
                continue
            if annotation.type == "text":
                item.update(x=float(annotation.x), y=float(annotation.y))
            else:
                for suffix in ("1", "2"):
                    xy = (getattr(annotation, f"x{suffix}"), getattr(annotation, f"y{suffix}"))
                    if item.get("coordinate_system") == "axes_fraction":
                        ax = manager.axes["primary"]
                        xy = ax.transAxes.inverted().transform(ax.transData.transform(xy))
                    item[f"x{suffix}"], item[f"y{suffix}"] = map(float, xy)
        return {"annotations": items}

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
        elif operation == "colors":
            result = {"colors": self.gradient_colors(args["name"], int(number(args["count"], "系列数", minimum=1, maximum=32)))}
        elif operation == "align":
            result = self.align_annotations(args["config"], args["ids"], args["operation"])
        else:
            raise ValueError("未対応の操作です。")
        return json.dumps(result, ensure_ascii=False, allow_nan=False)
