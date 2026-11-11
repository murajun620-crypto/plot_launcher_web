"""Matrix measurements: preserve blank cells and derive distributions from raw values."""
from io import BytesIO, StringIO
from pathlib import Path
import math, re, json
import numpy as np
import pandas as pd
from matplotlib import pyplot as plt, colors, ticker
from matplotlib.backends.backend_svg import RendererSVG
from annotation_model import AnnotationCollection
from annotation_manager import AnnotationManager

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


def render_matrix(engine, config):
    from engine import number, grid_style, _MarkerExtent, smooth_line_coordinates
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
    font = settings.get("fontFamily", "Arial")
    if font not in engine.font_families: font = "Liberation Sans" if "Liberation Sans" in engine.font_families else engine.font_family
    size = number(settings.get("fontScale",1),"フォントサイズ",minimum=.1,maximum=10)*8
    width = number(settings.get("width",4),"軸の幅",minimum=.5,maximum=24)
    height = number(settings.get("height",3),"軸の高さ",minimum=.5,maximum=24)
    with plt.rc_context({"font.family":[font, settings.get("japaneseFontFamily","Noto Sans JP"),"DejaVu Sans"],"font.size":size,"svg.fonttype":"none","mathtext.fontset":"dejavusans"}):
        figure = plt.figure(figsize=((width+2.6)/2.54,(height+2)/2.54),dpi=100)
        try:
            axes = figure.add_axes([1/(width+2.6),.9/(height+2),width/(width+2.6),height/(height+2)])
            right = None; colorbar = None; groups = []; extra = []; warnings = []; statistics = []; diagnostics = []
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
                    statistics.append({"name":label,"sheetIndex":sheet_index,"count":len(values),"min":float(values.min()),"max":float(values.max()),"mean":float(values.mean()),"binEdges":edges.tolist(),"frequency":counts.tolist(),"cumulative":(100*(under+np.cumsum(counts))/len(values)).tolist(),"outside":under+over})
                axes.set_xlim(edges[0],edges[-1]); axes.set_ylim(0,max(1,axes.get_ylim()[1])*1.05)
                if right:
                    right.set_ylabel(settings.get("y2Label") or "Cumulative frequency (%)")
                    right.tick_params(labelsize=size*.875*float(settings.get("tickFontScale",1)),direction="in")
                handles, labels = axes.get_legend_handles_labels()
                if right:
                    h,l=right.get_legend_handles_labels();handles+=h;labels+=l
                legend=axes.legend(handles,labels,loc=settings.get("legendPosition","best"),frameon=False,fontsize=size*.875*float(settings.get("legendFontScale",1))) if settings.get("legend",True) and handles else None
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
                    colorbar.set_label(label_text(options.get("valueLabel","Surface roughness, Sa"),options.get("valueUnit","nm")))
                    colorbar.ax.tick_params(labelsize=size*.875*float(settings.get("tickFontScale",1)))
                groups=[{"index":0,"artists":[image]}];legend=None
                diagnostics=[{"name":sheet,"points":len(values),"count":len(values),"visible":True,"processing":{}}]
                statistics=[{"name":sheet,"sheetIndex":indices[0],"count":len(values),"min":float(values.min()),"max":float(values.max()),"mean":float(values.mean())}]
            for name, axis in [("x",axes.xaxis),("y",axes.yaxis)]+([("y2",right.yaxis)] if right else []):
                owner=axis.axes;axis_name="x" if name=="x" else "y"
                low=number(settings.get(name+"Min",""),"軸の最小値",optional=True);high=number(settings.get(name+"Max",""),"軸の最大値",optional=True)
                limits=list(owner.get_xlim() if name=="x" else owner.get_ylim())
                if low is not None: limits[0]=low
                if high is not None: limits[1]=high
                if not limits[1]>limits[0]: raise ValueError("軸の最大値を最小値より大きくしてください。")
                (owner.set_xlim if name=="x" else owner.set_ylim)(limits)
                scale=settings.get(name+"Scale","linear")
                if scale=="log" and name=="y" and histogram and low is None: limits[0]=.8;owner.set_ylim(limits)
                if scale=="log" and limits[0]<=0: raise ValueError("対数軸の範囲は0より大きくしてください。")
                (owner.set_xscale if name=="x" else owner.set_yscale)(scale)
                for suffix,which in [("Step","major"),("MinorStep","minor")]:
                    step=number(settings.get(name+suffix,""),"目盛り間隔",minimum=1e-15,maximum=1e15,optional=True)
                    if step is not None and (limits[1]-limits[0])/step>(200 if which=="major" else 1000): raise ValueError("目盛りが多すぎます。間隔を大きくしてください。")
                    if scale=="linear":
                        locator=ticker.MultipleLocator(step) if step is not None else ticker.AutoMinorLocator() if which=="minor" else ticker.AutoLocator()
                        (axis.set_major_locator if which=="major" else axis.set_minor_locator)(locator)
                for which,prefix,base_length in [("major","Major",3),("minor","Minor",1.5)]:
                    flag=name.upper();hidden=settings.get("hide"+flag+"Ticks",False) or which=="minor" and settings.get("hide"+flag+"MinorTicks",False)
                    owner.tick_params(axis=axis_name,which=which,direction="in",length=0 if hidden else base_length*float(settings.get(name+prefix+"TickLength",1)),width=float(settings.get(name+prefix+"TickWidth",1)),labelsize=size*.875*float(settings.get("tickFontScale",1)),pad=2+float(settings.get(name+"TickPad",0)))
                top=name=="x" and settings.get("xAxisTop",False)
                right_side=name=="y2" or name=="y" and settings.get("yAxisRight",False) and right is None
                if name=="x":
                    axis.set_ticks_position("top" if top else "bottom");axis.set_label_position("top" if top else "bottom")
                    axis.set_tick_params(labeltop=top and not settings.get("hideXTickLabels",False),labelbottom=not top and not settings.get("hideXTickLabels",False))
                else:
                    axis.set_ticks_position("right" if right_side else "left");axis.set_label_position("right" if right_side else "left")
                    visible=not settings.get("hide"+name.upper()+"TickLabels",False)
                    axis.set_tick_params(labelright=right_side and visible,labelleft=not right_side and visible)
                axis_color=settings.get(name+"Color","auto")
                if axis_color!="auto":
                    if not colors.is_color_like(axis_color): raise ValueError("軸の色を確認してください。")
                    axis.set_tick_params(colors=axis_color);axis.label.set_color(axis_color)
                label=settings.get(name+"Label","")
                if histogram and name=="y2" and label=="Cumulative undersize": label="Cumulative frequency"
                unit=settings.get(name+"Unit","")
                if name=="y2" and not label: label="Cumulative frequency";unit="%"
                axis.set_label_text(label_text(label,unit),fontsize=size*float(settings.get("labelFontScale",1)))
                axis.label.set_visible(not settings.get("hide"+name.upper()+"Label",False));axis.labelpad=float(settings.get(name+"LabelPad",2))
                axis.label.set_gid("web-axis-label-"+name)
                if settings.get(name+"LabelX","")!="" and settings.get(name+"LabelY","")!="": axis.set_label_coords(float(settings[name+"LabelX"]),float(settings[name+"LabelY"]))
            for target in [axes]+([right] if right else []):
                for side,spine in target.spines.items(): spine.set_visible((histogram or options.get("frame",False)) and bool(settings.get("spine"+side.title(),True)));spine.set_linewidth(.8*float(settings.get("spineScale",1)));spine.set_color(settings.get("spineColor","#000000"))
            for name in ["x","y"]:
                for minor in [False,True]:
                    enabled=settings.get(name+("MinorGrid" if minor else "Grid"),False)
                    axes.grid(bool(enabled),which="minor" if minor else "major",axis=name,**grid_style(settings,minor=minor))
            if legend and settings.get("legendX","")!="" and settings.get("legendY","")!="": legend.set_bbox_to_anchor((float(settings["legendX"]),float(settings["legendY"])),transform=axes.transAxes);legend._loc=2
            legend,legend_records=engine._web_legends(figure,legend,config,diagnostics,config["plotType"])
            if legend: legend.set_gid("web-legend")
            for i,row in enumerate(legend_records):
                if row["artist"] is not legend: row["artist"].set_gid(f"web-legend-item-{i}")
            collection=AnnotationCollection();errors=collection.load_list(config.get("annotations",[]))
            if errors: raise ValueError("注釈の設定を確認してください。")
            for annotation in collection.items:
                if annotation.type=="text": annotation.font_family=[font,settings.get("japaneseFontFamily","Noto Sans JP"),"DejaVu Sans"]
            manager=AnnotationManager(collection,logger=warnings.append);manager.attach(figure,axes)
            figure.patch.set_facecolor(settings.get("backgroundColor","#ffffff"));figure.patch.set_alpha(0 if settings.get("transparent",True) else float(settings.get("backgroundAlpha",1)))
            axes.patch.set_facecolor(settings.get("plotBackgroundColor","#ffffff"));axes.patch.set_alpha(float(settings.get("plotBackgroundAlpha",1)) if settings.get("plotBackgroundEnabled",False) else 0)
            figure.set_dpi(72);renderer=RendererSVG(*(figure.get_size_inches()*72),StringIO());figure.draw(renderer)
            box=figure.get_tightbbox(renderer,bbox_extra_artists=extra).padded(.05)
            def svg_box(b):
                b=b.transformed(figure.dpi_scale_trans.inverted());return [(b.x0-box.x0)/box.width,(box.y1-b.y1)/box.height,b.width/box.width,b.height/box.height]
            geometry={"axes":svg_box(axes.get_window_extent(renderer)),"legend":svg_box(legend.get_window_extent(renderer)) if legend else None,"legendSvgIds":[legend.get_gid()] if legend else [],"legendItems":[],"annotations":[],"axisLabels":[],"tickLabels":[],"spines":[],"tickLines":[],"series":engine._data_geometry(groups,axes,box,renderer)}
            geometry["colorbar"]=svg_box(colorbar.ax.get_tightbbox(renderer)) if colorbar else None
            for row in legend_records:
                if "id" in row: geometry["legendItems"].append({"id":row["id"],"svgIds":[row["artist"].get_gid()],"seriesIndex":row["seriesIndex"],"key":row["key"],"label":row["label"],"box":svg_box(row["artist"].get_window_extent(renderer))})
            for name,axis in [("x",axes.xaxis),("y",axes.yaxis)]+([("y2",right.yaxis)] if right else []):
                if axis.label.get_visible() and axis.label.get_text():
                    anchor=axes.transAxes.inverted().transform(axis.label.get_transform().transform(axis.label.get_position()))
                    geometry["axisLabels"].append({"id":"axis-label-"+name,"svgIds":[axis.label.get_gid()],"axis":name,"kind":"label","box":svg_box(axis.label.get_window_extent(renderer)),"anchor":list(map(float,anchor))})
                geometry["tickLabels"] += [{"id":f"axis-ticks-{name}-{i}","axis":name,"kind":"ticks","box":svg_box(t.get_window_extent(renderer))} for i,t in enumerate(axis.get_ticklabels()) if t.get_visible() and t.get_text()]
            for annotation in collection.items:
                artists=manager.artist_by_id.get(annotation.id);artists=artists if isinstance(artists,list) else [artists] if artists is not None else []
                ids=[]
                for part,artist in enumerate(artists): artist.set_gid(f"web-matrix-annotation-{annotation.id}-{part}");ids.append(artist.get_gid())
                if artists:
                    from matplotlib.transforms import Bbox
                    geometry["annotations"].append({"id":annotation.id,"box":svg_box(Bbox.union([a.get_window_extent(renderer) for a in artists])),"svgIds":ids})
            image=BytesIO();figure.savefig(image,format="svg",bbox_inches=box,bbox_extra_artists=extra,transparent=False,pad_inches=0)
            if engine.figure is not None: plt.close(engine.figure)
            engine.figure=figure;engine.annotation_manager=manager;engine.export_extra_artists=extra;engine.transparent=False
            return {"svg":image.getvalue().decode(),"series":diagnostics,"seriesProcessing":[{} for _ in diagnostics],"fits":[],"warnings":warnings,"statistics":None,"matrixStatistics":statistics,"xRange":list(axes.get_xlim()),"yRange":list(axes.get_ylim()),"y2Range":list(right.get_ylim()) if right else None,"xDataScale":axes.get_xscale(),"yDataScale":axes.get_yscale(),"tickSteps":{},"axisInfo":{},"geometry":geometry,"fontFamily":font,"matrix":True}
        except Exception:
            plt.close(figure);raise

def label_text(label,unit):
    return str(label)+(f" ({unit})" if unit and unit!="auto" else "")
