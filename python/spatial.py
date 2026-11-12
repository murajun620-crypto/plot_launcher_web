"""Matrix measurements: preserve blank cells and derive distributions from raw values."""
from io import BytesIO, StringIO
from contextlib import redirect_stdout
from pathlib import Path
import math, re, json
import numpy as np
import pandas as pd
from matplotlib import pyplot as plt, colors
from matplotlib.backends.backend_svg import RendererSVG

TYPES = {"Surface Map", "Surface Histogram"}

def cell_name(row, column):
    letters = ""
    while column >= 0:
        letters = chr(65 + column % 26) + letters
        column = column // 26 - 1
    return f"{letters}{row+1}"

def cell_range(value):
    match = re.fullmatch(r"\s*\$?([A-Za-z]{1,3})\$?(\d+):\$?([A-Za-z]{1,3})\$?(\d+)\s*", str(value))
    if not match:
        raise ValueError("セル範囲はA1:S19のように指定してください。")
    def column(text):
        result = 0
        for c in text.upper(): result = result * 26 + ord(c) - 64
        return result - 1
    a, r, b, s = match.groups()
    r0, r1, c0, c1 = int(r)-1, int(s), column(a), column(b)+1
    if not (0 <= r0 < r1 <= 200000 and 0 <= c0 < c1 <= 256) or (r1-r0)*(c1-c0) > 1000000:
        raise ValueError("セル範囲は256列・100万セル以内で指定してください。")
    return r0, r1, c0, c1

def raw_sheet(engine, sheet_index):
    sources = getattr(engine, "matrix_sources", [])
    if len(sources) != 1:
        raise ValueError("マップ・分布には、分布データを含むExcelファイルを1つ開いてください。")
    source = sources[0]
    suffix = Path(source["filename"]).suffix.lower()
    if suffix not in {".xlsx", ".xlsm", ".xls"}:
        raise ValueError("分布データを含むExcelファイルを開いてください。")
    key = (source["path"], int(sheet_index))
    cache = getattr(engine, "matrix_cache", {})
    if key not in cache:
        with pd.ExcelFile(source["path"], engine="xlrd" if suffix == ".xls" else "openpyxl") as book:
            if not 0 <= int(sheet_index) < len(book.sheet_names): raise ValueError("対象のシートがありません。")
            cache[key] = (book.sheet_names[int(sheet_index)], book.parse(sheet_index, header=None, nrows=512))
        engine.matrix_cache = cache
    return cache[key]

def matrix_info(engine):
    sources = getattr(engine, "matrix_sources", [])
    if len(sources) != 1: raise ValueError("Excelファイルを1つ開いてください。")
    suffix = Path(sources[0]["filename"]).suffix.lower()
    if suffix not in {".xlsx", ".xlsm", ".xls"}: raise ValueError("Excelファイルの分布データに対応しています。")
    with pd.ExcelFile(sources[0]["path"], engine="xlrd" if suffix == ".xls" else "openpyxl") as book:
        names = book.sheet_names
    if len(names) > 100: raise ValueError("分布データは100シート以内にしてください。")
    result = []
    for index, name in enumerate(names):
        _, frame = raw_sheet(engine, index)
        # Only two-dimensional connected numeric areas qualify. A separate
        # vertical list or the workbook's existing histogram is never merged.
        scan = frame.iloc[:512, :256].apply(pd.to_numeric, errors="coerce").to_numpy(dtype=float)
        valid = np.isfinite(scan); visited = np.zeros(valid.shape, dtype=bool); components = []
        for row, col in zip(*np.where(valid)):
            if visited[row, col]: continue
            stack = [(row, col)]; visited[row, col] = True; points = []
            while stack:
                r, c = stack.pop(); points.append((r, c))
                for rr, cc in ((r-1,c), (r+1,c), (r,c-1), (r,c+1)):
                    if 0 <= rr < valid.shape[0] and 0 <= cc < valid.shape[1] and valid[rr,cc] and not visited[rr,cc]:
                        visited[rr,cc] = True; stack.append((rr,cc))
            rs, cs = zip(*points)
            if max(rs)>min(rs) and max(cs)>min(cs):
                h,w=max(rs)-min(rs)+1,max(cs)-min(cs)+1
                # A compact spatial grid takes priority over long precomputed
                # frequency/cumulative columns, even when those contain more cells.
                score=len(points)*math.sqrt(min(h,w)/max(h,w))
                components.append((score,len(points),min(rs),max(rs),min(cs),max(cs)))
        if components:
            _, count, r0, r1, c0, c1 = max(components)
            data = scan[r0:r1+1,c0:c1+1]; values = data[np.isfinite(data)]
            result.append({"index":index,"name":name,"range":f"{cell_name(r0,c0)}:{cell_name(r1,c1)}","count":len(values),"min":float(values.min()),"max":float(values.max())})
        else: result.append({"index":index,"name":name,"range":"","count":0})
    return {"sheets":result}

def matrix_values(engine, sheet_index, region):
    r0, r1, c0, c1 = cell_range(region)
    sources = getattr(engine,"matrix_sources",[])
    if len(sources)!=1: raise ValueError("分布データのExcelファイルを1つ開いてください。")
    source=sources[0];suffix=Path(source["filename"]).suffix.lower()
    cache=getattr(engine,"matrix_cache",{});key=(source["path"],int(sheet_index),region)
    if key not in cache:
        with pd.ExcelFile(source["path"],engine="xlrd" if suffix==".xls" else "openpyxl") as book:
            if not 0<=int(sheet_index)<len(book.sheet_names): raise ValueError("対象のシートがありません。")
            name=book.sheet_names[int(sheet_index)]
            frame=book.parse(sheet_index,header=None,skiprows=r0,nrows=r1-r0,usecols=list(range(c0,c1)))
        frame=frame.reindex(index=range(r1-r0),columns=range(c0,c1))
        data=frame.apply(pd.to_numeric,errors="coerce").to_numpy(dtype=float)
        cache[key]=(name,data);engine.matrix_cache=cache
    name,base=cache[key];data=base.copy()
    for edit in getattr(engine,"table_edits",[]):
        if edit["sourceIndex"]!=0 or edit["sheetIndex"]!=sheet_index: continue
        for row,col,value in edit["cells"]:
            rr=edit["headerRow"]+row-r0;cc=col-c0
            if 0<=rr<data.shape[0] and 0<=cc<data.shape[1]:
                try: data[rr,cc]=float(value) if value is not None and str(value).strip() else np.nan
                except (ValueError,TypeError): data[rr,cc]=np.nan
    data[~np.isfinite(data)]=np.nan;values=data[np.isfinite(data)]
    if not len(values): raise ValueError(f"シート「{name}」の{region}に数値がありません。")
    return name,data,values


def statistic_format(raw=None):
    if raw is None: raw={}
    if not isinstance(raw,dict): raise ValueError("集計注記の表示桁数を確認してください。")
    value={"mode":"significant","meanDigits":3,"errorDigits":3,**raw}
    minimum=0 if value["mode"]=="decimal" else 1
    if value["mode"] not in ("significant","decimal") or any(type(value[key]) is not int or not minimum<=value[key]<=12 for key in ("meanDigits","errorDigits")):
        raise ValueError("表示桁数は有効数字1〜12桁、小数点以下0〜12桁で指定してください。")
    return value


def distribution_label(row,kind,raw_format=None):
    display=statistic_format(raw_format)
    def number_text(value,digits):
        text=format(value,f".{digits}{'f' if display['mode']=='decimal' else 'g'}")
        return text[1:] if text.startswith("-") and float(text)==0 else text
    average=number_text(row["mean"],display["meanDigits"])
    unit=row.get("unit","");suffix=f" {unit}" if unit and unit!="auto" else ""
    if row[kind] is None: return f"avg. ± {kind.upper()} = {average} ± N/A{suffix} (n = {row['count']})"
    error=number_text(row[kind],display["errorDigits"])
    return f"avg. ± {kind.upper()} = {average} ± {error}{suffix}"


def distribution_summary(values, name, sheet_index, unit=""):
    n=len(values)
    # Scaling avoids overflow in the sum of squares without altering source data.
    scale=float(np.max(np.abs(values)))
    scaled=values/scale if scale else values
    mean=float(np.mean(scaled)*scale)
    sd=float(np.std(scaled,ddof=1)*scale) if n>1 else None
    if sd is not None and not math.isfinite(sd): sd=None
    se=sd/math.sqrt(n) if sd is not None else None
    row={"name":name,"sheetIndex":sheet_index,"count":n,"min":float(values.min()),"max":float(values.max()),"mean":mean,"sd":sd,"se":se,"unit":unit}
    row.update(sdText=distribution_label(row,"sd"),seText=distribution_label(row,"se"))
    return row


def distribution_annotations(annotations, statistics, active):
    rows={row["sheetIndex"]:row for row in statistics};resolved=[];updates=[]
    for raw in annotations:
        if not isinstance(raw,dict): raise ValueError("注記の設定を確認してください。")
        item=dict(raw);link=raw.get("matrix_statistic")
        if link is not None:
            if not isinstance(link,dict) or raw.get("type")!="text" or not isinstance(raw.get("id"),str) or not raw["id"] or link.get("kind") not in ("sd","se") or not isinstance(link.get("includeName",False),bool):
                raise ValueError("分布の集計注記を確認してください。")
            index=link.get("sheetIndex")
            if index!="active" and (type(index) is not int or not 0<=index<=1000): raise ValueError("集計注記の対象シートを確認してください。")
            display=statistic_format(link.get("format"))
            row=rows.get(active if index=="active" else index)
            if row is None: item["visible"]=False
            else:
                item["text"]=(row["name"]+"\n" if link.get("includeName",False) else "")+distribution_label(row,link["kind"],display)
                updates.append({"id":item["id"],"text":item["text"]})
        resolved.append(item)
    return resolved,updates


def render_matrix(engine, config):
    from engine import number, plot_environment, _MarkerExtent, smooth_line_coordinates
    import plot_utils
    options = config.get("options", {}).get("matrix", {})
    settings = config.get("axes", {})
    histogram = config["plotType"] == "Surface Histogram"
    region = options.get("range", "A1:S19")
    indices = options.get("sheets", [engine.table_info["sheetIndex"]])
    if not isinstance(indices,list) or not 1 <= len(indices) <= 32 or len(set(indices)) != len(indices) or any(not isinstance(i,int) or not 0<=i<=1000 for i in indices): raise ValueError("分布の比較対象は1〜32シートで選択してください。")
    sheet_mode=options.get("histSheetMode","combined")
    if sheet_mode not in {"separate","combined"}: raise ValueError("グラフのまとめ方を確認してください。")
    separate=histogram and sheet_mode=="separate"
    active=engine.table_info["sheetIndex"]
    if separate and active not in indices: raise ValueError("表示するシートを分布の対象にも選択してください。")
    if not histogram: indices = [active]
    datasets = [matrix_values(engine, i, region) for i in indices]
    primary_settings = {**settings, "yAxisRight": False} if histogram and options.get("cumulative",True) else settings
    style_values, _, font, requested_font = engine._style_values(primary_settings)
    right_settings = engine._secondary_axis_settings(settings)
    right_values = engine._style_values(right_settings)[0] if histogram and options.get("cumulative", True) else None
    size = float(settings.get("fontScale", 1))*8
    width = float(style_values["PLOT_AX_W_CM"]); height = float(style_values["PLOT_AX_H_CM"])
    with plot_environment(style_values, engine.frame, engine.sheet_name, engine.filename), redirect_stdout(StringIO()):
        figure = plt.figure(figsize=((width+2.6)/2.54,(height+2)/2.54),dpi=100)
        try:
            axes = figure.add_axes([1/(width+2.6),.9/(height+2),width/(width+2.6),height/(height+2)])
            right = None; colorbar = None; groups = []; extra = []; warnings = []; statistics = []; diagnostics = []
            if requested_font != font:
                warnings.append(f"Arialが未読込のため{font}で代替表示しています。")
            if histogram:
                arrays = [data[2]*float(settings.get("xUnitScale",1)) for data in datasets]
                all_values = np.concatenate(arrays)
                low = number(options.get("binMin",""),"ビンの最小値",optional=True)
                high = number(options.get("binMax",""),"ビンの最大値",optional=True)
                lo = min(0,float(all_values.min())) if low is None else low
                hi = float(all_values.max()) if high is None else high
                if not hi>lo: hi = lo+max(1,abs(lo)*.1)
                step = number(options.get("binWidth",""),"ビン幅",minimum=1e-15,maximum=1e15,optional=True)
                count = number(options.get("binCount",""),"ビン数",minimum=1,maximum=500,optional=True)
                if step is not None and count is not None: raise ValueError("ビン幅とビン数はいずれか一方を指定してください。")
                if step is not None:
                    n = int(math.ceil((hi-lo)/step))
                    if n>500: raise ValueError("ビン数が500を超えます。ビン幅を大きくしてください。")
                    edges = lo + np.arange(n+1)*step
                    if high is not None: edges[-1] = hi
                else:
                    n = int(count) if count is not None else min(100,max(5,len(np.histogram_bin_edges(all_values,bins="fd",range=(lo,hi)))-1))
                    edges = np.linspace(lo,hi,n+1)
                cumulative = options.get("cumulative",True)
                interpolation=options.get("cdfInterpolation","smooth")
                if interpolation not in {"smooth","linear"}: raise ValueError("累積線の表示方法を確認してください。")
                if cumulative: right = axes.twinx(); right.set_ylim(0,100)
                style = options.get("histStyle","overlay")
                if style not in {"overlay","grouped","step"}: raise ValueError("ヒストグラムの表示方法を確認してください。")
                alpha = number(options.get("histAlpha",.55),"棒の不透明度",minimum=0,maximum=1)
                for index, ((sheet, matrix, _), sheet_index) in enumerate(zip(datasets,indices)):
                    values=arrays[index]
                    series = config["series"][index] if index<len(config["series"]) else {}
                    label = series.get("name") or sheet; color = series.get("color",f"C{index%10}")
                    if not colors.is_color_like(color): raise ValueError("系列の色を確認してください。")
                    if separate and sheet_index!=active:
                        diagnostics.append({"name":label,"points":len(values),"count":len(values),"visible":False,"processing":{}})
                        continue
                    visible = series.get("visible",True); counts,_ = np.histogram(values,edges)
                    under = int(np.count_nonzero(values<edges[0])); over = int(np.count_nonzero(values>edges[-1]))
                    artists = []
                    if visible:
                        if style=="step": artists += [axes.stairs(counts,edges,color=color,linewidth=float(series.get("lineWidth",1)),label=label)]
                        else:
                            widths=np.diff(edges); x=edges[:-1]; w=widths
                            if style=="grouped": w=widths/len(datasets); x=x+index*w
                            artists += list(axes.bar(x,counts,width=w,align="edge",color=color,alpha=alpha,label=label,edgecolor=color,linewidth=.35))
                        if cumulative:
                            ccolor=options.get("cumulativeColors",{}).get(str(sheet_index),"auto")
                            ccolor=color if ccolor=="auto" else ccolor
                            if not colors.is_color_like(ccolor): raise ValueError("累積線の色を確認してください。")
                            curve=100*np.r_[under,under+np.cumsum(counts)]/len(values)
                            line_x,line_y=smooth_line_coordinates(edges,curve,xlog=settings.get("xScale")=="log",xlim=(edges[0],edges[-1])) if interpolation=="smooth" else (edges,curve)
                            artists+=right.plot(line_x,line_y,color=ccolor,linewidth=float(series.get("lineWidth",1)),label=f"CDF · {label}" if ccolor!=color else "_nolegend_")
                        groups.append({"index":index,"artists":artists})
                    if under or over: warnings.append(f"{label}：ビンの範囲外 {under+over}点（累積率の分母は全{len(values)}点）。")
                    diagnostics.append({"name":label,"points":len(values),"count":len(values),"visible":visible,"processing":{}})
                    statistics.append({**distribution_summary(values,label,sheet_index,settings.get("xUnit",options.get("valueUnit",""))),"binEdges":edges.tolist(),"frequency":counts.tolist(),"cumulative":(100*(under+np.cumsum(counts))/len(values)).tolist(),"outside":under+over})
                axes.set_xlim(edges[0],edges[-1]); axes.set_ylim(0,max(1,axes.get_ylim()[1])*1.05)
                handles, labels = axes.get_legend_handles_labels()
                if right:
                    h,l=right.get_legend_handles_labels();handles+=h;labels+=l
                legend = None
                if handles:
                    plot_utils.apply_preview_legend(axes, handles=handles, labels=labels)
                    legend = axes.get_legend()
                    position = settings.get("legendPosition", "best")
                    if position not in {"best", "upper right", "upper left", "lower right", "lower left"}:
                        raise ValueError("凡例の位置を選び直してください。")
                    if legend and style_values["PLOT_LEGEND_X"] == "": legend.set_loc(position)
            else:
                sheet, matrix, values = datasets[0]
                px=number(options.get("pitchX",5),"X間隔",minimum=1e-12,maximum=1e12);py=number(options.get("pitchY",5),"Y間隔",minimum=1e-12,maximum=1e12)
                ox=number(options.get("originX",0),"中心X",minimum=-1e15,maximum=1e15);oy=number(options.get("originY",0),"中心Y",minimum=-1e15,maximum=1e15)
                xs=((np.arange(matrix.shape[1])-(matrix.shape[1]-1)/2)*px+ox)*float(settings.get("xUnitScale",1))
                ys=(((matrix.shape[0]-1)/2-np.arange(matrix.shape[0]))*py+oy)*float(settings.get("yUnitScale",1))
                px*=float(settings.get("xUnitScale",1));py*=float(settings.get("yUnitScale",1))
                xx,yy=np.meshgrid(xs,ys);valid=np.isfinite(matrix)
                vmin=number(options.get("colorMin",""),"配色の最小値",optional=True);vmax=number(options.get("colorMax",""),"配色の最大値",optional=True)
                # Shared auto range enables direct comparison between sheets.
                compare=[matrix_values(engine,i,region)[2] for i in options.get("sheets",indices)]
                vmin=min(float(a.min()) for a in compare) if vmin is None else vmin;vmax=max(float(a.max()) for a in compare) if vmax is None else vmax
                if vmax==vmin: vmax=vmin+max(abs(vmin)*.05,1e-12)
                if not vmax>vmin: raise ValueError("配色の最大値を最小値より大きくしてください。")
                palette=options.get("palette","turbo")
                if palette not in {"viridis","plasma","turbo","jet","cividis","gray"}: raise ValueError("マップの配色を確認してください。")
                norm=colors.Normalize(vmin,vmax,clip=True)
                if options.get("mapStyle","points")=="cells":
                    image=axes.pcolormesh(np.r_[xs-px/2,xs[-1]+px/2],np.r_[ys+py/2,ys[-1]-py/2],np.ma.masked_invalid(matrix),cmap=palette,norm=norm,shading="flat")
                else:
                    area=number(options.get("markerSize",30),"点面積",minimum=.1,maximum=1000)
                    image=axes.scatter(xx[valid],yy[valid],c=matrix[valid],s=area,cmap=palette,norm=norm,edgecolors=options.get("edgeColor","none"),linewidths=number(options.get("edgeWidth",.25),"点の縁幅",minimum=0,maximum=10),clip_on=False,zorder=3)
                    extent=_MarkerExtent(image);axes.add_artist(extent);extra.append(extent)
                axes.set_xlim(xs[0]-px/2,xs[-1]+px/2);axes.set_ylim(ys[-1]-py/2,ys[0]+py/2)
                if options.get("equalAspect",True): axes.set_aspect("equal",adjustable="box")
                visibility=options.get("colorbarVisibility",{})
                if not isinstance(visibility,dict): raise ValueError("シートごとのカラーバー表示を確認してください。")
                show_colorbar=visibility.get(str(active),options.get("colorbar",True))
                if not isinstance(show_colorbar,bool): raise ValueError("カラーバーの表示設定を確認してください。")
                if show_colorbar:
                    cax=figure.add_axes([(width+1.18)/(width+2.6),.9/(height+2),.16/(width+2.6),height/(height+2)])
                    colorbar=figure.colorbar(image,cax=cax)
                    colorbar.outline.set_visible(False)
                    colorbar.set_label(label_text(options.get("valueLabel","Surface roughness, Sa"),options.get("valueUnit","nm")),fontsize=size)
                    colorbar.ax.tick_params(labelsize=size*.875*float(settings.get("tickFontScale",1)))
                    # Match MiFiTo: gaps are percentages of the image/axes short side.
                    short_points=min(width,height)*72/2.54
                    for key,kind in [("colorbarTickGapPercent","ticks"),("colorbarTitleGapPercent","title")]:
                        value=options.get(key,"")
                        if value=="": continue
                        percent=number(value,"カラーバーの文字余白",minimum=0,maximum=20)
                        pad=short_points*percent/100
                        if kind=="ticks": colorbar.ax.tick_params(pad=pad)
                        else: colorbar.ax.yaxis.labelpad=pad
                groups=[{"index":0,"artists":[image]}];legend=None
                diagnostics=[{"name":sheet,"points":len(values),"count":len(values),"visible":True,"processing":{}}]
                statistics=[distribution_summary(values,sheet,indices[0],options.get("valueUnit","nm"))]
            editable_axes = [("x",axes.xaxis),("y",axes.yaxis)]+([("y2",right.yaxis)] if right else [])
            # Validate against the generated bin/coordinate extents before locators
            # allocate ticks. Data primitives stay specific; appearance uses the
            # same paper style, environment and finishers as ordinary presets.
            for name, axis in editable_axes:
                low=number(settings.get(name+"Min",""),"軸の最小値",optional=True)
                high=number(settings.get(name+"Max",""),"軸の最大値",optional=True)
                limits=list(axis.get_view_interval())
                if low is not None: limits[0]=low
                if high is not None: limits[1]=high
                scale=settings.get(name+"Scale","linear")
                if scale=="log" and name=="y" and histogram and low is None: limits[0]=.8;axes.set_ylim(limits)
                if not limits[1]>limits[0]: raise ValueError("軸の最大値を最小値より大きくしてください。")
                if scale=="log" and limits[0]<=0: raise ValueError("対数軸の範囲は0より大きくしてください。")
                for suffix,maximum in [("Step",200),("MinorStep",1000)]:
                    step=number(settings.get(name+suffix,""),"目盛り間隔",minimum=1e-15,maximum=1e15,optional=True)
                    if step is not None and (limits[1]-limits[0])/step>maximum: raise ValueError("目盛りが多すぎます。間隔を大きくしてください。")
            def apply_style(target, axis_settings, env):
                for name in ("x", "y"):
                    label = axis_settings.get(name+"Label", "")
                    unit = axis_settings.get(name+"Unit", "")
                    if target is right and name=="y":
                        if label=="Cumulative undersize": label="Cumulative frequency"
                        if not label: label="Cumulative frequency";unit="%"
                    env["PLOT_"+name.upper()+"LABEL_TEXT"] = str(label)
                    env["PLOT_"+name.upper()+"UNIT"] = "" if unit=="auto" else str(unit)
                with plot_environment(env, engine.frame, engine.sheet_name, engine.filename):
                    plot_utils.apply_paper_style(target, ax_w_cm=width, **plot_utils.env_style_options({}))
                    plot_utils.configure_axes_with_env(target, {})
                    for spine in target.spines.values(): spine.set_color(env["PLOT_SPINE_COLOR"])
                    target.tick_params(axis="both", which="both", colors=env["PLOT_SPINE_COLOR"])
                    target.xaxis.label.set_color(env["PLOT_SPINE_COLOR"])
                    target.yaxis.label.set_color(env["PLOT_SPINE_COLOR"])
                    plot_utils.apply_axis_overrides_from_env(target)
                    plot_utils.apply_axis_labels_from_env(target)
            apply_style(axes, primary_settings, style_values)
            if right is not None:
                apply_style(right, right_settings, right_values)
                right.xaxis.set_visible(False)
                right.grid(False,which="both")
                for side in ("left","top","bottom"): right.spines[side].set_visible(False)
                axes.spines["right"].set_visible(False)
            if not histogram and not options.get("frame",False):
                for spine in axes.spines.values(): spine.set_visible(False)
            positioned_labels=engine._finish_axes(figure,axes,editable_axes,config,style_values,config["plotType"])
            for name,axis in editable_axes: axis.label.set_gid("web-axis-label-"+name)
            if right is not None:
                annotation_axes=figure.add_axes(axes.get_position(),frameon=False,zorder=5)
                annotation_axes.set_xscale(axes.get_xscale());annotation_axes.set_yscale(axes.get_yscale())
                annotation_axes.set_xlim(axes.get_xlim());annotation_axes.set_ylim(axes.get_ylim())
                annotation_axes.set_axis_off()
            else: annotation_axes=axes
            legend,legend_records=engine._finish_legends(figure,annotation_axes,legend,config,diagnostics,config["plotType"])
            if legend: legend.set_gid("web-legend")
            for i,row in enumerate(legend_records):
                if row["artist"] is not legend: row["artist"].set_gid(f"web-legend-item-{i}")
            annotation_values,annotation_texts=distribution_annotations(config.get("annotations",[]),statistics,active)
            collection,manager=engine._attach_annotations(figure,annotation_axes,annotation_values,config,style_values,warnings)
            annotation_svg_ids=engine._tag_annotations(collection,manager)
            engine._finish_background(figure,axes,style_values)
            figure.canvas.draw()
            for _,axis in editable_axes:
                low,high=sorted(axis.get_view_interval())
                for tick in axis.get_major_ticks():
                    if not low<=tick.get_loc()<=high:
                        tick.label1.set_visible(False);tick.label2.set_visible(False)
            figure.set_dpi(72);renderer=RendererSVG(*(figure.get_size_inches()*72),StringIO());figure.draw(renderer)
            box=figure.get_tightbbox(renderer,bbox_extra_artists=extra).padded(.05)
            def svg_box(b):
                b=b.transformed(figure.dpi_scale_trans.inverted());return [(b.x0-box.x0)/box.width,(box.y1-b.y1)/box.height,b.width/box.width,b.height/box.height]
            geometry={"axes":svg_box(axes.get_window_extent(renderer)),"legend":svg_box(legend.get_window_extent(renderer)) if legend else None,"legendSvgIds":[legend.get_gid()] if legend else [],"legendItems":[],"annotations":[],"axisLabels":[],"tickLabels":[],"spines":[],"tickLines":[],"series":engine._data_geometry(groups,axes,box,renderer)}
            geometry["colorbar"]=svg_box(colorbar.ax.get_tightbbox(renderer)) if colorbar else None
            for row in legend_records:
                if "id" in row: geometry["legendItems"].append({"id":row["id"],"svgIds":[row["artist"].get_gid()],"seriesIndex":row["seriesIndex"],"key":row["key"],"label":row["label"],"box":svg_box(row["artist"].get_window_extent(renderer))})
            engine._axis_geometry(geometry,figure,axes,right,editable_axes,positioned_labels,config["plotType"],box,renderer,svg_box)
            geometry["annotations"]=engine._annotation_geometry(collection,manager,annotation_axes,figure,box,renderer,svg_box,annotation_svg_ids)
            tick_steps,axis_info=engine._axis_metadata(editable_axes,config,{"x":style_values,"y":style_values,"y2":right_values})
            image=BytesIO();figure.savefig(image,format="svg",bbox_inches=box,bbox_extra_artists=extra,transparent=False,pad_inches=0)
            if engine.figure is not None: plt.close(engine.figure)
            engine.figure=figure;engine.matrix_colorbar=colorbar;engine.annotation_manager=manager;engine.export_extra_artists=extra;engine.transparent=False
            return {"svg":image.getvalue().decode(),"series":diagnostics,"seriesProcessing":[{} for _ in diagnostics],"fits":[],"warnings":warnings,"statistics":None,"matrixStatistics":statistics,"matrixAnnotationTexts":annotation_texts,"xRange":list(axes.get_xlim()),"yRange":list(axes.get_ylim()),"y2Range":list(right.get_ylim()) if right else None,"xDataScale":axes.get_xscale(),"yDataScale":axes.get_yscale(),"tickSteps":tick_steps,"axisInfo":axis_info,"geometry":geometry,"fontFamily":font,"matrix":True}
        except Exception:
            plt.close(figure);raise

def label_text(label,unit):
    return str(label)+(f" ({unit})" if unit and unit!="auto" else "")
