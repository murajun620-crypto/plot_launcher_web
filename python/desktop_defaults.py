import re, unicodedata, json
from pathlib import Path
from matplotlib import cm as mpl_cm, colors as mpl_colors
SCRIPT_MAP = {p['id']: p['script'] for p in json.loads((Path(__file__).parent.parent / 'presets.json').read_text())}

def _filename_match_parts(path_text: str) -> tuple[str, set[str], str]:
    stem = Path(path_text).stem
    normalized = unicodedata.normalize("NFKC", stem).lower()
    tokens = [
        token
        for token in re.split(r"[^0-9a-z\u3040-\u30ff\u3400-\u9fff]+", normalized)
        if token
    ]
    compact = re.sub(r"[^0-9a-z\u3040-\u30ff\u3400-\u9fff]+", "", normalized)
    return normalized, set(tokens), compact

def infer_plot_type_from_filename(path_text: str | Path) -> str:
    normalized, token_set, compact = _filename_match_parts(str(path_text))

    def valid(plot_type: str) -> str | None:
        return plot_type if plot_type in SCRIPT_MAP else None

    def has_token(*values: str) -> bool:
        return any(value in token_set for value in values)

    def has_text(*values: str) -> bool:
        return any(value in normalized for value in values)

    def has_compact(*values: str) -> bool:
        return any(value in compact for value in values)

    def has_any(*values: str) -> bool:
        return has_token(*values) or has_text(*values) or has_compact(*values)

    xps_like = has_any("xps")
    xps_core_tokens = {
        "c1s", "o1s", "n1s", "si2p", "al2p", "ag3d", "au4f", "cu2p",
        "in3d", "sn3d", "fe2p", "ti2p", "cr2p", "ni2p", "zn2p",
        "s2p", "p2p", "f1s", "cl2p",
    }
    has_xps_core_name = has_token(*xps_core_tokens) or any(name in compact for name in xps_core_tokens)

    if xps_like and (has_any("peakfit", "fitting", "peakfitting") or has_text("peak fit", "peak_fit")):
        return valid("XPS Fit") or "General"
    if xps_like and has_token("fit"):
        return valid("XPS Fit") or "General"
    if xps_like and (has_any("core", "narrow", "narrowscan", "corelevel") or has_text("narrow scan", "core level") or has_xps_core_name):
        return valid("XPS Core") or "General"
    if (xps_like and has_any("survey", "xpssurvey", "wide", "widescan", "ワイド", "サーベイ")) or has_text("wide scan", "wide_scan"):
        return valid("XPS Survey") or "General"
    if xps_like:
        return valid("XPS Survey") or "General"
    if has_any("widescan", "wide_scan") or has_text("wide scan"):
        return valid("XPS Survey") or "General"
    if has_xps_core_name and has_any("core", "peak"):
        return valid("XPS Core") or "General"

    if has_any("raman", "ラマン") and (has_token("3d") or has_any("raman3d", "waterfall", "ウォーターフォール") or has_text("3d raman")):
        return valid("Raman 3D") or "General"

    if has_token("hist") or has_any("particle", "particlesize", "particlediameter", "sizedistribution", "diameterdistribution", "histogram", "histgram", "ヒストグラム", "粒径", "粒子径", "粒度分布"):
        return valid("Particle Histogram") or "General"

    if has_any("afm", "断面", "断面プロファイル", "ラインプロファイル"):
        return valid("AFM Section") or "General"

    if has_any("roughness", "surfaceroughness", "rmsroughness", "表面粗さ", "粗さ") or has_token("ra", "rq", "rms"):
        return valid("Roughness") or "General"

    if has_token("cv", "lsv") or has_any("cyclicvoltammetry", "voltammogram", "voltammetry", "linearsweep", "サイクリックボルタンメトリー", "ボルタモグラム"):
        return valid("CV/LSV") or "General"
    if has_token("ca") or has_any("chronoamperometry", "クロノアンペロメトリー"):
        return valid("CA") or "General"
    if has_token("cp") or has_any("chronopotentiometry", "クロノポテンショメトリー"):
        return valid("CP") or "General"
    if has_token("edx", "eds") or has_any("energydispersive", "elementalanalysis", "元素分析"):
        return valid("EDX") or "General"
    if has_any("xafs", "xanes", "exafs", "absorptionspectrum", "xrayabsorption", "x線吸収", "吸収端"):
        return valid("XAFS") or "General"
    if has_any("raman", "ラマン"):
        return valid("Raman Spectrum") or "General"
    if has_token("bar") or has_any("bargraph", "barchart", "barchart", "棒グラフ"):
        return valid("bar_graph_general") or "General"
    if has_any("general", "generic", "xyplot", "xy_plot", "一般") or has_token("xy"):
        return valid("General") or "General"
    return "General"

def gradient_colors_from_name(name: str, count: int) -> list[str]:
    cmap_key = (name or "").strip().lower()
    if cmap_key in {"", "none"} or count <= 0:
        return []
    cmap_lookup = {
        "viridis": "viridis",
        "virigit": "viridis",
        "plasma": "plasma",
        "spectrum": "nipy_spectral",
    }
    mpl_name = cmap_lookup.get(cmap_key)
    if not mpl_name:
        return []
    cmap = mpl_cm.get_cmap(mpl_name)
    denom = max(1, count - 1)
    return [mpl_colors.to_hex(cmap(i / denom), keep_alpha=False) for i in range(count)]
