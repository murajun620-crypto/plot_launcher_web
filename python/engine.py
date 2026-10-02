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
    try:
        yield
    finally:
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
        if font_path:
            font_manager.fontManager.addfont(str(font_path))
            self.font_family = font_manager.FontProperties(fname=str(font_path)).get_name()
        matplotlib.rcParams.update({"svg.fonttype": "path", "pdf.fonttype": 42})

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
        width = number(axes.get("width", 8), "軸領域の幅", minimum=2, maximum=24)
        height = number(axes.get("height", 5), "軸領域の高さ", minimum=2, maximum=24)
        font_scale = number(axes.get("fontScale", 1), "文字サイズ", minimum=0.5, maximum=3)
        values = {
            "PLOT_PREVIEW_ONLY": "1", "PLOT_SKIP_SHOW": "1", "PLOT_NO_PROMPT": "1",
            "PLOT_FONT_FAMILY": f"{self.font_family},DejaVu Sans",
            "PLOT_AX_W_CM": str(width), "PLOT_AX_H_CM": str(height),
            "PLOT_FONTSIZE_LABEL_SCALE": str(font_scale), "PLOT_FONTSIZE_TICK_SCALE": str(font_scale),
            "PLOT_LEGEND_FONTSCALE": str(font_scale),
            "PLOT_XLABEL_FULL": str(axes.get("xLabel", ""))[:500],
            "PLOT_YLABEL_FULL": str(axes.get("yLabel", ""))[:500],
            "PLOT_PREVIEW_LEGEND": "1" if axes.get("legend", True) else "0",
            "PLOT_FIGURE_BACKGROUND_ALPHA": "0" if axes.get("transparent", True) else "1",
            "PLOT_FIGURE_BACKGROUND_COLOR": "white",
        }
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
        keys = {key: [] for key in ("columns", "names", "colors", "modes", "widths", "markers", "sizes", "xoffsets", "yoffsets", "errors")}
        diagnostics, warnings = [], []
        extents = {"x": [], "y": []}
        for index, item in enumerate(series):
            xi = column_index(item.get("x"), count, f"系列{index + 1}のX")
            yi = column_index(item.get("y"), count, f"系列{index + 1}のY")
            error = item.get("error", "")
            ei = -1 if error in (None, "", -1) else column_index(error, count, "誤差")
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
            if ei >= 0:
                error_values = pd.to_numeric(frame.iloc[:, ei], errors="coerce").to_numpy(dtype=float)
                if np.any(valid & np.isfinite(error_values) & (error_values < 0)):
                    raise ValueError(f"「{name}」の誤差には0以上の値を使用してください。")
                missing_errors = int((valid & ~np.isfinite(error_values)).sum())
                if missing_errors:
                    warnings.append(f"{name}: 空欄・非数値の誤差{missing_errors:,}点には誤差棒を描画しません")
            excluded = int(len(frame) - valid.sum())
            if excluded:
                warnings.append(f"{name}: 空欄・非数値・対数軸の0以下の値を含む{excluded:,}点を除外")
            extents["x"].extend((float(x[valid].min()), float(x[valid].max())))
            extents["y"].extend((float(y[valid].min()), float(y[valid].max())))
            diagnostics.append({"name": name, "points": int(valid.sum())})
            color = str(item.get("color", "#2361b5"))
            if not is_color_like(color):
                raise ValueError("系列の色を選び直してください。")
            mode = item.get("mode", "line")
            marker = item.get("marker", "o")
            if mode not in {"line", "scatter", "line+scatter"} or marker not in {"o", "s", "^", "v", "D", "+", "x", "*", "p", "h"}:
                raise ValueError("描画方法とマーカーを選び直してください。")
            line_width = number(item.get("lineWidth", 1.2), "線幅", minimum=0, maximum=6)
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
            if ei >= 0:
                draw_error = len(draw_columns)
                draw_columns[f"_error_{index}"] = np.where(valid, error_values, np.nan)
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
            if index == 0:
                for axis, ci in (("X", xi), ("Y", yi)):
                    if not values[f"PLOT_{axis}LABEL_FULL"].strip():
                        label = str(frame.columns[ci])
                        if "/" in label:
                            text, unit = label.rsplit("/", 1)
                            label = f"{text.strip()} ({unit.strip()})" if unit.strip() else text.strip()
                        values[f"PLOT_{axis}LABEL_FULL"] = label
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
        }
        values.update({target: ",".join(keys[key]) for key, target in mappings.items()})
        values["PLOT_GENERIC_ERROR_MODES"] = ",".join("none" if value == "-1" else "symmetric" for value in keys["errors"])
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
                    legend.remove()
                    handles, labels = namespace["legend_handles"], namespace["legend_labels"]
                    legend = axes.legend(handles, labels, loc=position, frameon=False, fontsize=7 * float(config.get("axes", {}).get("fontScale", 1)))
                    for text, series in zip(legend.get_texts(), diagnostics):
                        text.set_text(series["name"])
                if config.get("axes", {}).get("grid", False):
                    axes.grid(True, alpha=0.15, linewidth=0.5)
                else:
                    axes.grid(False)
                figure.canvas.draw()
                # Hide off-screen log ticks before calculating the export box.
                for axis, limits in ((axes.xaxis, axes.get_xlim()), (axes.yaxis, axes.get_ylim())):
                    low, high = sorted(limits)
                    for tick in axis.get_major_ticks():
                        tick.label1.set_visible(low <= tick.get_loc() <= high)
                figure.canvas.draw()
                plot_utils.expand_figure_to_include_artists(figure)
                image = BytesIO()
                figure.savefig(image, format="svg", bbox_inches="tight", pad_inches=0.05, transparent=values["PLOT_FIGURE_BACKGROUND_ALPHA"] == "0")
            if self.figure is not None:
                plt.close(self.figure)
            self.figure = figure
            self.transparent = values["PLOT_FIGURE_BACKGROUND_ALPHA"] == "0"
            return {"svg": image.getvalue().decode("utf-8"), "series": diagnostics, "warnings": warnings, "xRange": list(axes.get_xlim()), "yRange": list(axes.get_ylim())}
        except Exception:
            for figure_number in set(plt.get_fignums()) - previous_figures:
                plt.close(figure_number)
            raise

    def export(self, config, format_name, dpi=300):
        if format_name not in {"svg", "png", "pdf"}:
            raise ValueError("SVG・PNG・PDFのいずれかを選んでください。")
        self.render(config)
        resolution = number(dpi, "PNG解像度", minimum=150, maximum=600)
        width, height = self.figure.get_size_inches()
        if format_name == "png" and width * height * resolution**2 > 25_000_000:
            raise ValueError("画像が大きすぎます。軸領域のサイズまたはPNG解像度を小さくしてください。")
        image = BytesIO()
        self.figure.savefig(image, format=format_name, dpi=resolution, bbox_inches="tight", pad_inches=0.05, transparent=self.transparent)
        return {"format": format_name, "base64": base64.b64encode(image.getvalue()).decode("ascii")}

    def dispatch(self, operation, payload):
        args = json.loads(payload)
        if operation == "load":
            result = self.load(**args)
        elif operation == "render":
            result = self.render(args["config"])
        elif operation == "export":
            result = self.export(args["config"], args["format"], args.get("dpi", 300))
        else:
            raise ValueError("未対応の操作です。")
        return json.dumps(result, ensure_ascii=False, allow_nan=False)
