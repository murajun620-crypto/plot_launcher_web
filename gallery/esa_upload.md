# PlotLauncher 図のギャラリー

PlotLauncherで作れる15種類のグラフを、16作例で紹介します。CVとLSVは同じプリセットの異なる使用例です。図を眺めるだけでなく、CSVと設定済みプロジェクトを開いて、自分のデータの並べ方と描画設定を確認できます。

**全データは人工的に生成した模擬データです。実験結果や論文掲載データではありません。** 図の見やすさ、単位、線幅、フォント、余白を論文図の体裁に合わせています。投稿時は各雑誌の規定と実測データに合わせて調整してください。

[PlotLauncherを開く](https://murajun620-crypto.github.io/plot_launcher_web/) · [学生向けマニュアル](https://murajun620-crypto.github.io/plot_launcher_web/manual/) · [全プロジェクトを保存（ZIP）](projects.zip?v=27e45f64cf51) · [esa掲載用一式](gallery.zip?v=27e45f64cf51)

## 作例の一覧

|種別|作例|入力の形|
|---|---|---|
|CV/LSV|[CV 掃引速度による酸化還元応答](#cv)|共通X＋各Y列|
|CV/LSV|[LSV 触媒の分極曲線](#lsv)|共通X＋各Y列|
|CA|[CA 濃度による電流減衰](#ca)|共通X＋各Y列|
|CP|[CP 定電流保持時の電位推移](#cp)|共通X＋各Y列|
|EDX|[EDX Au粒子とSiO₂基板のスペクトル](#edx)|共通X＋各Y列|
|XPS Survey|[XPS Survey 表面元素の全体像](#xps-survey)|共通X＋各Y列|
|XPS Core|[XPS Core Au 4fダブレット](#xps-core)|共通X＋各Y列|
|XPS Fit|[XPS Fit 成分と合成曲線を重ねる](#xps-fit)|A/B/D/G/H以降の専用配列|
|XAFS|[XAFS 吸収端と吸収端後の構造](#xafs)|共通X＋各Y列|
|Raman Spectrum|[Raman Spectrum 炭素材料のバンド比較](#raman)|共通X＋各Y列|
|AFM Section|[AFM Section 高さマップから取り出した断面](#afm-section)|共通X＋各Y列|
|Particle Histogram|[粒径ヒストグラム 対数正規分布](#particle-histogram)|1行1粒子の生の粒径|
|General|[一般グラフ 飽和応答と反復データ](#general)|XとYのペア＋SD列|
|Roughness|[Roughness 研磨時間と表面粗さ](#roughness)|共通X＋平均/SDの列|
|棒グラフ|[棒グラフ 反復試験の比較](#bar)|カテゴリ＋平均＋SD|
|Raman 3D|[Raman 3D 時系列スペクトル](#raman-3d)|共通X＋各Y列|

## 全作例のプロジェクト

[全16プロジェクトを保存（ZIP）](projects.zip?v=27e45f64cf51)

|作例|プロジェクト|
|---|---|
|CV 掃引速度による酸化還元応答|[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=cv) · [保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/cv.plotproject?v=27e45f64cf51)|
|LSV 触媒の分極曲線|[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=lsv) · [保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/lsv.plotproject?v=27e45f64cf51)|
|CA 濃度による電流減衰|[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=ca) · [保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/ca.plotproject?v=27e45f64cf51)|
|CP 定電流保持時の電位推移|[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=cp) · [保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/cp.plotproject?v=27e45f64cf51)|
|EDX Au粒子とSiO₂基板のスペクトル|[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=edx) · [保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/edx.plotproject?v=27e45f64cf51)|
|XPS Survey 表面元素の全体像|[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=xps-survey) · [保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/xps-survey.plotproject?v=27e45f64cf51)|
|XPS Core Au 4fダブレット|[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=xps-core) · [保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/xps-core.plotproject?v=27e45f64cf51)|
|XPS Fit 成分と合成曲線を重ねる|[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=xps-fit) · [保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/xps-fit.plotproject?v=27e45f64cf51)|
|XAFS 吸収端と吸収端後の構造|[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=xafs) · [保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/xafs.plotproject?v=27e45f64cf51)|
|Raman Spectrum 炭素材料のバンド比較|[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=raman) · [保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/raman.plotproject?v=27e45f64cf51)|
|AFM Section 高さマップから取り出した断面|[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=afm-section) · [保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/afm-section.plotproject?v=27e45f64cf51)|
|粒径ヒストグラム 対数正規分布|[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=particle-histogram) · [保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/particle-histogram.plotproject?v=27e45f64cf51)|
|一般グラフ 飽和応答と反復データ|[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=general) · [保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/general.plotproject?v=27e45f64cf51)|
|Roughness 研磨時間と表面粗さ|[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=roughness) · [保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/roughness.plotproject?v=27e45f64cf51)|
|棒グラフ 反復試験の比較|[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=bar) · [保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/bar.plotproject?v=27e45f64cf51)|
|Raman 3D 時系列スペクトル|[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=raman-3d) · [保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/raman-3d.plotproject?v=27e45f64cf51)|

## プロジェクトで再現する

1. 作例の「プロジェクトを保存」を押す。まとめて保存する場合は「全プロジェクトを保存（ZIP）」を使い、ZIPを展開する。
2. PlotLauncherの「プロジェクトを開く」で開く。データと設定が一緒に読み込まれる。
3. 系列、軸、注釈を変更して保存する。元の設定を残す場合は別名で保存する。

CSVから作る場合は、1行目を見出しにし、X列とY列を選びます。「共通X＋全Y」を使うときは、SDや補助列を描画系列から外してください。CVの電位は往路・復路の順に並べます。行を電位順に並べ替えるとループが崩れます。

<a id="cv"></a>

## CV 掃引速度による酸化還元応答

![CV 掃引速度による酸化還元応答 模擬データ](assets/cv.png?v=27e45f64cf51)

酸化・還元ピークと、掃引速度による電流増加。Xの行順序を保ち、電位で並べ替えない。

[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=cv) · [CSV](https://murajun620-crypto.github.io/plot_launcher_web/gallery/data/cv.csv?v=27e45f64cf51) · [プロジェクトを保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/cv.plotproject?v=27e45f64cf51) · [PNG 1200 dpi](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/cv.png?v=27e45f64cf51) · [SVG](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/cv.svg?v=27e45f64cf51) · [PDF](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/cv.pdf?v=27e45f64cf51)

### データの作り方

Fickの一次元拡散方程式を陰的差分で解き、電極表面はNernst平衡。往復掃引に二重層充電と微小ノイズを加えた。

**生成条件：** n=1、T=298.15 K、D=7×10⁻⁶ cm² s⁻¹、濃度1 mM、形式電位0.20 V、掃引20/50/100 mV s⁻¹。dx=0.5 µm、3000区間、計算領域1.5 mm、遠端濃度一定、電位刻み1 mV。

[Gamry CVと表面平衡の解説](https://www.gamry.com/electrochemistry-applications/cv-cyclic-voltammetry)を参考に、拡散と表面平衡をモデル化。

**表の構成：** 1,601行、4列。

列は 「1: Potential / V」、「2: 20 mV s-1 / mA cm-2」、「3: 50 mV s-1 / mA cm-2」、「4: 100 mV s-1 / mA cm-2」。

**系列設定：** 20 mV s$^{-1}$: X=列1、Y=列2。50 mV s$^{-1}$: X=列1、Y=列3。100 mV s$^{-1}$: X=列1、Y=列4。

<a id="lsv"></a>

## LSV 触媒の分極曲線

![LSV 触媒の分極曲線 模擬データ](assets/lsv.png?v=27e45f64cf51)

立ち上がりと高電流域の形。OERを想定した作例で、触媒性能を示す実測結果ではない。

[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=lsv) · [CSV](https://murajun620-crypto.github.io/plot_launcher_web/gallery/data/lsv.csv?v=27e45f64cf51) · [プロジェクトを保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/lsv.plotproject?v=27e45f64cf51) · [PNG 1200 dpi](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/lsv.png?v=27e45f64cf51) · [SVG](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/lsv.svg?v=27e45f64cf51) · [PDF](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/lsv.pdf?v=27e45f64cf51)

### データの作り方

Tafel式 η=η₁+b log₁₀(j)+jRから電流を数値的に求める。高電流域は未補償抵抗により湾曲する。

**生成条件：** Tafel勾配60/85/120 mV dec⁻¹、j=1 mA cm⁻²のη=185/220/310 mV、面積比抵抗2.5/3.5/4 Ω cm²。数値は作例用の仮定。

Tafel近似は[MITのButler–Volmer講義資料](https://ocw.mit.edu/courses/10-626-electrochemical-energy-systems-spring-2014/56cfa6e0f28bc8fc1a647cbe679384d1_MIT10_626S14_S11lec13.pdf)を参考にした。抵抗と数値条件は作例用の仮定。

**表の構成：** 450行、4列。

列は 「1: Potential / V」、「2: Catalyst A」、「3: Catalyst B」、「4: Support」。

**系列設定：** Catalyst A: X=列1、Y=列2。Catalyst B: X=列1、Y=列3。Support: X=列1、Y=列4。

<a id="ca"></a>

## CA 濃度による電流減衰

![CA 濃度による電流減衰 模擬データ](assets/ca.png?v=27e45f64cf51)

初期過渡応答の後にt⁻¹ᐟ²で減衰。濃度が2倍になると拡散電流も2倍になる。

[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=ca) · [CSV](https://murajun620-crypto.github.io/plot_launcher_web/gallery/data/ca.csv?v=27e45f64cf51) · [プロジェクトを保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/ca.plotproject?v=27e45f64cf51) · [PNG 1200 dpi](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/ca.png?v=27e45f64cf51) · [SVG](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/ca.svg?v=27e45f64cf51) · [PDF](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/ca.pdf?v=27e45f64cf51)

### データの作り方

Cottrell式 j=nF√D C/√(πt)に、短時間の充電電流と計測ノイズを加えた。

**生成条件：** D=7×10⁻⁶ cm² s⁻¹、n=1、濃度0.5/1/2 mM。t=0の発散を避け、最初の点は0.02 s。

[Gamry CAとCottrell式](https://help.gamry.com/Framework/experiments_e_chronoamperometry.html)を基に生成。

**表の構成：** 550行、4列。

列は 「1: Time / s」、「2: 0.5 mM」、「3: 1 mM」、「4: 2 mM」。

**系列設定：** 0.5 mM: X=列1、Y=列2。1 mM: X=列1、Y=列3。2 mM: X=列1、Y=列4。

<a id="cp"></a>

## CP 定電流保持時の電位推移

![CP 定電流保持時の電位推移 模擬データ](assets/cp.png?v=27e45f64cf51)

初期のなじみと長時間ドリフト。安定性の実証には実測・反復試験が必要。

[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=cp) · [CSV](https://murajun620-crypto.github.io/plot_launcher_web/gallery/data/cp.csv?v=27e45f64cf51) · [プロジェクトを保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/cp.plotproject?v=27e45f64cf51) · [PNG 1200 dpi](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/cp.png?v=27e45f64cf51) · [SVG](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/cp.svg?v=27e45f64cf51) · [PDF](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/cp.pdf?v=27e45f64cf51)

### データの作り方

定電流ごとの初期電位に、時定数70 sの安定化と緩やかな対数ドリフトを重ねた経験的モデル。

**生成条件：** 電流密度10/20/50 mA cm⁻²、保持7200 s、電位ノイズ標準偏差0.45 mV。モデル値は説明用。

数値条件はギャラリー用の仮定で、特定試料の実測値ではありません。

**表の構成：** 800行、4列。

列は 「1: Time / s」、「2: 10 mA cm-2」、「3: 20 mA cm-2」、「4: 50 mA cm-2」。

**系列設定：** 10 mA cm$^{-2}$: X=列1、Y=列2。20 mA cm$^{-2}$: X=列1、Y=列3。50 mA cm$^{-2}$: X=列1、Y=列4。

<a id="edx"></a>

## EDX Au粒子とSiO₂基板のスペクトル

![EDX Au粒子とSiO₂基板のスペクトル 模擬データ](assets/edx.png?v=27e45f64cf51)

低エネルギー主ピークと弱い高エネルギーAu線。EDXマップと同じ元素を使う。

[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=edx) · [CSV](https://murajun620-crypto.github.io/plot_launcher_web/gallery/data/edx.csv?v=27e45f64cf51) · [プロジェクトを保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/edx.plotproject?v=27e45f64cf51) · [PNG 1200 dpi](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/edx.png?v=27e45f64cf51) · [SVG](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/edx.svg?v=27e45f64cf51) · [PDF](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/edx.pdf?v=27e45f64cf51)

### データの作り方

O K、Si K、Au M/Lの近似ピーク位置に、エネルギー依存の検出器幅、連続背景、Poisson計数ノイズを加えた。

**生成条件：** エネルギー刻み10 eV、20 kV励起を想定。FWHM(E)=√(0.050²+0.0045E) keV。強度比は定量組成に対応させていない。

線エネルギーは[NIST X線遷移データ](https://physics.nist.gov/PhysRefData/XrayTrans/Html/search.html)の近傍を採用。

**表の構成：** 1,191行、2列。

列は 「1: Energy / keV」、「2: Counts per channel」。

**系列設定：** Au / SiO$_2$: X=列1、Y=列2。

<a id="xps-survey"></a>

## XPS Survey 表面元素の全体像

![XPS Survey 表面元素の全体像 模擬データ](assets/xps-survey.png?v=27e45f64cf51)

XPSの結合エネルギーは左が高く右が低い。Surveyで全体を確認し、CoreとFitで拡大する。

[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=xps-survey) · [CSV](https://murajun620-crypto.github.io/plot_launcher_web/gallery/data/xps-survey.csv?v=27e45f64cf51) · [プロジェクトを保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/xps-survey.plotproject?v=27e45f64cf51) · [PNG 1200 dpi](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/xps-survey.png?v=27e45f64cf51) · [SVG](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/xps-survey.svg?v=27e45f64cf51) · [PDF](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/xps-survey.pdf?v=27e45f64cf51)

### データの作り方

Au、Si、O、Cの主要線と一部の副線をpseudo-Voigt形状で配置し、非弾性背景とPoissonノイズを加えた。

**生成条件：** 0–1000 eV、刻み0.5 eV。相対強度と背景は例示用。感度係数・透過関数・全Auger線を再現した定量スペクトルではない。

Auの主要線は[HarwellXPSのAu解説](https://www.harwellxps.guru/xpskb/gold/)を参考に配置。

**表の構成：** 2,001行、2列。

列は 「1: Binding energy / eV」、「2: Survey / counts」。

**系列設定：** Au / SiO$_2$: X=列1、Y=列2。

<a id="xps-core"></a>

## XPS Core Au 4fダブレット

![XPS Core Au 4fダブレット 模擬データ](assets/xps-core.png?v=27e45f64cf51)

ピークの位置、幅、分裂。装置分解能や帯電条件は実測に合わせる。

[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=xps-core) · [CSV](https://murajun620-crypto.github.io/plot_launcher_web/gallery/data/xps-core.csv?v=27e45f64cf51) · [プロジェクトを保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/xps-core.plotproject?v=27e45f64cf51) · [PNG 1200 dpi](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/xps-core.png?v=27e45f64cf51) · [SVG](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/xps-core.svg?v=27e45f64cf51) · [PDF](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/xps-core.pdf?v=27e45f64cf51)

### データの作り方

Au 4f₇ᐟ₂/4f₅ᐟ₂の二重線。分裂3.67 eV、同じ幅、面積比4:3。単調な非弾性背景とPoissonノイズ。

**生成条件：** 中心84.00/87.67 eV、FWHM 0.85 eV、Lorentz比0.28。背景はShirleyに似せた経験的ステップであり、Shirley積分を解いたものではない。

[HarwellXPS Au 4f](https://www.harwellxps.guru/xpskb/gold/)の分裂と、[スピン軌道二重線](https://www.harwellxps.guru/xpskb/spin-orbit-coupling/)の面積比を参考にした。

**表の構成：** 281行、2列。

列は 「1: Binding energy / eV」、「2: Au 4f / counts」。

**系列設定：** Au 4f: X=列1、Y=列2。

<a id="xps-fit"></a>

## XPS Fit 成分と合成曲線を重ねる

![XPS Fit 成分と合成曲線を重ねる 模擬データ](assets/xps-fit.png?v=27e45f64cf51)

観測点、合成線、背景、色分け成分を比較。専用CSVではアプリが各ピークに背景を足して塗りつぶす。

[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=xps-fit) · [CSV](https://murajun620-crypto.github.io/plot_launcher_web/gallery/data/xps-fit.csv?v=27e45f64cf51) · [プロジェクトを保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/xps-fit.plotproject?v=27e45f64cf51) · [PNG 1200 dpi](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/xps-fit.png?v=27e45f64cf51) · [SVG](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/xps-fit.svg?v=27e45f64cf51) · [PDF](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/xps-fit.pdf?v=27e45f64cf51)

### データの作り方

Coreと同じ模擬観測値に生成モデル・背景・2成分を重ねた。推定フィット結果ではなく、既知の生成条件の表示例。

**生成条件：** A=Abscissa、B=Ordinate、D=Background、G=Synthesize、H以降=背景を含まない各ピーク成分。Cは生成モデルとの差分。

[HarwellXPS Au 4f](https://www.harwellxps.guru/xpskb/gold/)の分裂と面積比を使用。

**表の構成：** 281行、9列。

列は 「1: Abscissa」、「2: Ordinate」、「3: Residual」、「4: Background」、「5: Auxiliary 1」、「6: Auxiliary 2」、「7: Synthesize」、「8: Au 4f7/2 peak」、「9: Au 4f5/2 peak」。

**系列設定：** Synthetic observation: X=列1、Y=列2。

この作例では横軸範囲を79〜93 eV、目盛り間隔を4 eVに指定しています。結合エネルギーは左から右へ減少します。

<a id="xafs"></a>

## XAFS 吸収端と吸収端後の構造

![XAFS 吸収端と吸収端後の構造 模擬データ](assets/xafs.png?v=27e45f64cf51)

吸収端のシフト、白線、吸収端後の減衰振動。配位数や酸化数の推定に使える定量計算ではない。

[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=xafs) · [CSV](https://murajun620-crypto.github.io/plot_launcher_web/gallery/data/xafs.csv?v=27e45f64cf51) · [プロジェクトを保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/xafs.plotproject?v=27e45f64cf51) · [PNG 1200 dpi](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/xafs.png?v=27e45f64cf51) · [SVG](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/xafs.svg?v=27e45f64cf51) · [PDF](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/xafs.pdf?v=27e45f64cf51)

### データの作り方

arctan型吸収端、白線ピーク、sin(2kR+φ)の減衰振動を重ねた概念モデル。

**生成条件：** 基準E₀から−40～260 eV、k=√[(E−E₀)/3.81] Å⁻¹、R=2.1 Å、σ²=0.004/0.008 Å²。元素固有の散乱振幅・位相は使用していない。

吸収端と減衰振動の形は[IUCr XAS入門](https://www.iucr.org/__data/assets/pdf_file/0004/60637/IUCr2011-XAFS-Tutorial_-Ascone.pdf)に沿った概念モデル。

**表の構成：** 1,000行、3列。

列は 「1: Energy - E0 / eV」、「2: Reference A」、「3: Reference B」。

**系列設定：** Reference A: X=列1、Y=列2。Reference B: X=列1、Y=列3。

<a id="raman"></a>

## Raman Spectrum 炭素材料のバンド比較

![Raman Spectrum 炭素材料のバンド比較 模擬データ](assets/raman.png?v=27e45f64cf51)

ピークの強度比と幅を見比べる。縦オフセットしたスペクトルの絶対強度を相互比較しない。

[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=raman) · [CSV](https://murajun620-crypto.github.io/plot_launcher_web/gallery/data/raman.csv?v=27e45f64cf51) · [プロジェクトを保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/raman.plotproject?v=27e45f64cf51) · [PNG 1200 dpi](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/raman.png?v=27e45f64cf51) · [SVG](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/raman.svg?v=27e45f64cf51) · [PDF](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/raman.pdf?v=27e45f64cf51)

### データの作り方

D、G、2Dバンドに幅を持たせ、弱い蛍光背景とPoissonノイズを加えた。比較のため各系列を縦に950ずつ移動。

**生成条件：** D=1350、G=1582、2D=2685 cm⁻¹。幅・強度は仮定。実際のピーク位置や強度比は励起波長、欠陥量、層数等に依存する。

バンドの基本的な形は[Ferrari et al. PRL 97, 187401](https://doi.org/10.1103/PhysRevLett.97.187401)を参考にした。

**表の構成：** 1,001行、4列。

列は 「1: Raman shift / cm-1」、「2: Low disorder」、「3: Intermediate」、「4: High disorder」。

**系列設定：** Low disorder: X=列1、Y=列2。Intermediate: X=列1、Y=列3、Yオフセット=950。High disorder: X=列1、Y=列4、Yオフセット=1900。

<a id="afm-section"></a>

## AFM Section 高さマップから取り出した断面

![AFM Section 高さマップから取り出した断面 模擬データ](assets/afm-section.png?v=27e45f64cf51)

高さマップと断面を同じデータで説明できる。断面の各山は探針の影響を含む見かけの形状。

[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=afm-section) · [CSV](https://murajun620-crypto.github.io/plot_launcher_web/gallery/data/afm-section.csv?v=27e45f64cf51) · [プロジェクトを保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/afm-section.plotproject?v=27e45f64cf51) · [PNG 1200 dpi](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/afm-section.png?v=27e45f64cf51) · [SVG](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/afm-section.svg?v=27e45f64cf51) · [PDF](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/afm-section.pdf?v=27e45f64cf51)

### データの作り方

MiFiTo用AFMナノ粒状表面と同一の高さ配列から、2本の水平断面を抽出。独立した曲線を作り直していない。

**生成条件：** 画素寸法4 nm、走査範囲3.072 µm。行280/510。探針による広がりと高さノイズを含む。

数値条件はギャラリー用の仮定で、特定試料の実測値ではありません。

**表の構成：** 768行、3列。

列は 「1: Position / um」、「2: Profile 1 / nm」、「3: Profile 2 / nm」。

**系列設定：** y = 1.120 µm: X=列1、Y=列2。y = 2.040 µm: X=列1、Y=列3。

<a id="particle-histogram"></a>

## 粒径ヒストグラム 対数正規分布

![粒径ヒストグラム 対数正規分布 模擬データ](assets/particle-histogram.png?v=27e45f64cf51)

生の粒径を1行1粒子で入れる。計算済みの頻度表は粒径入力にしない。

[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=particle-histogram) · [CSV](https://murajun620-crypto.github.io/plot_launcher_web/gallery/data/particle-histogram.csv?v=27e45f64cf51) · [プロジェクトを保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/particle-histogram.plotproject?v=27e45f64cf51) · [PNG 1200 dpi](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/particle-histogram.png?v=27e45f64cf51) · [SVG](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/particle-histogram.svg?v=27e45f64cf51) · [PDF](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/particle-histogram.pdf?v=27e45f64cf51)

### データの作り方

SEM粒子モデルに与えた190個の投影径を、そのまま粒径入力として使用。PlotLauncherが20 nm幅の頻度と対数正規曲線を描画する。

**生成条件：** 生成時の中央値184 nm、対数標準偏差0.32。入力は幾何学的な真値。重なったSEM像から画像解析で測定した値ではない。

数値条件はギャラリー用の仮定で、特定試料の実測値ではありません。

**表の構成：** 190行、2列。

列は 「1: Particle ID」、「2: Diameter / nm」。

**系列設定：** Diameter: X=列1、Y=列2。

この模擬標本の平均径は193.5 nm、対数正規モデルの中央値は183.9 nm。190粒子の有限標本なので生成時の184 nmと完全には一致しません。

<a id="general"></a>

## 一般グラフ 飽和応答と反復データ

![一般グラフ 飽和応答と反復データ 模擬データ](assets/general.png?v=27e45f64cf51)

散布点・対称誤差棒・生成モデルを併記。曲線と点はX列が別でもよい。

[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=general) · [CSV](https://murajun620-crypto.github.io/plot_launcher_web/gallery/data/general.csv?v=27e45f64cf51) · [プロジェクトを保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/general.plotproject?v=27e45f64cf51) · [PNG 1200 dpi](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/general.png?v=27e45f64cf51) · [SVG](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/general.svg?v=27e45f64cf51) · [PDF](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/general.pdf?v=27e45f64cf51)

### データの作り方

Langmuir型q=qmax C/(K+C)から各濃度5回の独立模擬反復を作り、平均と標本SDを計算。曲線は既知の生成モデル。

**生成条件：** qmax=45 mg g⁻¹、K=1.8 mM、n=5。ノイズSDは濃度により1.0～約2.3 mg g⁻¹。誤差棒はSDで、SEM/95%CIではない。

数値条件はギャラリー用の仮定で、特定試料の実測値ではありません。

**表の構成：** 240行、5列。

列は 「1: Measured concentration / mM」、「2: Mean / mg g-1」、「3: SD / mg g-1」、「4: Model concentration / mM」、「5: Langmuir model / mg g-1」。

**系列設定：** Mean ± SD: X=列1、Y=列2、±誤差=列3。Generating model: X=列4、Y=列5。

<a id="roughness"></a>

## Roughness 研磨時間と表面粗さ

![Roughness 研磨時間と表面粗さ 模擬データ](assets/roughness.png?v=27e45f64cf51)

対数Y軸で、初期改善と下限への収束を比較。AFM作例とは別の仮想研磨試験。

[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=roughness) · [CSV](https://murajun620-crypto.github.io/plot_launcher_web/gallery/data/roughness.csv?v=27e45f64cf51) · [プロジェクトを保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/roughness.plotproject?v=27e45f64cf51) · [PNG 1200 dpi](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/roughness.png?v=27e45f64cf51) · [SVG](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/roughness.svg?v=27e45f64cf51) · [PDF](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/roughness.pdf?v=27e45f64cf51)

### データの作り方

Rq(t)=Rq∞+(Rq₀−Rq∞) exp(−t/τ)に乗法性のばらつきを加え、各時刻5反復の平均とSDを計算。

**生成条件：** Process A: Rq₀=36 nm、τ=4.5 min、下限0.7 nm。B: 32 nm、8 min、1.2 nm。対数ノイズSD=0.075、n=5。

数値条件はギャラリー用の仮定で、特定試料の実測値ではありません。

**表の構成：** 9行、5列。

列は 「1: Polishing time / min」、「2: Process A mean」、「3: Process A SD」、「4: Process B mean」、「5: Process B SD」。

**系列設定：** Process A: X=列1、Y=列2、±誤差=列3。Process B: X=列1、Y=列4、±誤差=列5。

<a id="bar"></a>

## 棒グラフ 反復試験の比較

![棒グラフ 反復試験の比較 模擬データ](assets/bar.png?v=27e45f64cf51)

カテゴリ名をX列に置く。Yは平均、3列目はSD。現在の棒グラフ描画は誤差列を自動描画しないため、この作例ではSDから算出した線の注釈で誤差棒を表示している。値を変更したら注釈も更新する。有意差やp値は作成していない。

[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=bar) · [CSV](https://murajun620-crypto.github.io/plot_launcher_web/gallery/data/bar.csv?v=27e45f64cf51) · [プロジェクトを保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/bar.plotproject?v=27e45f64cf51) · [PNG 1200 dpi](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/bar.png?v=27e45f64cf51) · [SVG](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/bar.svg?v=27e45f64cf51) · [PDF](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/bar.pdf?v=27e45f64cf51)

### データの作り方

独立した5反復の模擬過電圧を生成し、平均と標本SDを棒と誤差棒で示す。

**生成条件：** 想定平均370/275/220 mV、模擬反復のノイズSD9/7/5 mV、n=5。LSVとは別の比較例で、同一測定の要約ではない。

数値条件はギャラリー用の仮定で、特定試料の実測値ではありません。

**表の構成：** 3行、3列。

列は 「1: Sample」、「2: Mean / mV」、「3: SD / mV」。

**系列設定：** Mean ± SD: X=列1、Y=列2。

<a id="raman-3d"></a>

## Raman 3D 時系列スペクトル

![Raman 3D 時系列スペクトル 模擬データ](assets/raman-3d.png?v=27e45f64cf51)

時系列のバンド形状変化を俯瞰。個別正規化しているため絶対強度の増減を示す図ではない。

[Web版で開く](https://murajun620-crypto.github.io/plot_launcher_web/?gallery=raman-3d) · [CSV](https://murajun620-crypto.github.io/plot_launcher_web/gallery/data/raman-3d.csv?v=27e45f64cf51) · [プロジェクトを保存](https://murajun620-crypto.github.io/plot_launcher_web/gallery/projects/raman-3d.plotproject?v=27e45f64cf51) · [PNG 1200 dpi](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/raman-3d.png?v=27e45f64cf51) · [SVG](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/raman-3d.svg?v=27e45f64cf51) · [PDF](https://murajun620-crypto.github.io/plot_launcher_web/gallery/figures/raman-3d.pdf?v=27e45f64cf51)

### データの作り方

炭素材料のD/G/2Dバンドを、処理時間に応じて幅と強度が変化する6系列として生成。

**生成条件：** 処理0/10/20/30/40/50 minを想定。深さ間隔10。各スペクトルを0–1に正規化するアプリ設定。

バンドの基本的な形は[Ferrari et al. PRL 97, 187401](https://doi.org/10.1103/PhysRevLett.97.187401)を参考にした。

**表の構成：** 1,001行、7列。

列は 「1: Raman shift / cm-1」、「2: 0 min」、「3: 10 min」、「4: 20 min」、「5: 30 min」、「6: 40 min」、「7: 50 min」。

**系列設定：** 0 min: X=列1、Y=列2。10 min: X=列1、Y=列3。20 min: X=列1、Y=列4。30 min: X=列1、Y=列5。40 min: X=列1、Y=列6。50 min: X=列1、Y=列7。

## 図の体裁とデータの注意点

- 軸ラベルと目盛りは太字にせず、Liberation Sansで統一。元の軸領域は通常6.7×4.8 cm、Raman 3Dは7.1×5.4 cm。保存幅はラベルの長さで変わります。
- PNGは1200 dpi、SVGとPDFは線と文字をベクトルで保存。高いdpiは元データや測定精度を改善するものではありません。
- 色に加えて系列名・ピーク名・位置で図を読めるようにしています。点と線、誤差棒の意味は各作例に記載。
- General、Roughness、棒グラフの誤差棒は独立模擬反復5回の標本SD。元の反復データもCSVで添付。
- XPS Fitの線は既知の生成モデルで、実測データへのフィッティングではありません。XAFSは形状を説明する概念モデルです。

反復CSV：[一般グラフ](https://murajun620-crypto.github.io/plot_launcher_web/gallery/data/general_replicates.csv?v=27e45f64cf51)、[粗さ](https://murajun620-crypto.github.io/plot_launcher_web/gallery/data/roughness_replicates.csv?v=27e45f64cf51)、[棒グラフ](https://murajun620-crypto.github.io/plot_launcher_web/gallery/data/bar_replicates.csv?v=27e45f64cf51)。

サンセリフ書体、判読できる文字、適切な線幅、写真へのスケールバーという方針は、[Natureの最終図版ガイド](https://www.nature.com/documents/NRJs-guide-to-preparing-final-artwork.pdf)を参考にしました。特定誌の採択や科学的妥当性を保証する意味ではありません。

乱数の初期値は20261004。掲載図のPNG・SVG・PDFは、全16プロジェクトをPlotLauncher Web v1.2.1のアプリ画面で開き、保存ボタンから出力しました。CSVと描画設定は各プロジェクトに同梱しています。
