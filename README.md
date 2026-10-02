# PlotLauncher Web

Excel / CSVの測定データをブラウザ内で処理し、Python版の全15プリセットで描画してSVG・PNG・PDF・PPTXで保存できます。

[Webアプリを開く](https://murajun620-crypto.github.io/plot_launcher_web/)

Python・Excelのインストールは不要です。ファイルを選び、X列とY列を指定してください。
初期表示は合成サンプルです。設定JSONはデータを含みません。

初回起動にはインターネット接続が必要です。Pyodide・計算ライブラリはjsDelivr、Excel用パッケージはPyPIから取得します。
測定データのアップロードやアクセス解析の処理はありません。

## このリポジトリ

Web版の配信ファイルを保存しています。mainブランチのルートをGitHub Pagesで公開します。
開発側でscripts/build_web.pyを実行し、dist/webの内容を更新します。

## フォント

欧文用Liberation Sansと日本語用Noto Sans JPを同梱しています。SIL Open Font License 1.1はassets/fonts/Liberation-OFL.txt、assets/fonts/OFL.txtにあります。

Python版と同じArialの字形を使う場合は、表示オプションの「手元のフォントを読み込む」で利用するPCのArialを選んでください。日本語フォントも選択できます。フォントはブラウザ内だけで使用します。

CV/LSV、CA、CP、EDX、XPS Survey/Core/Fit、XAFS、Raman Spectrum、AFM Section、ヒストグラム、一般、Roughness、棒グラフ、Raman 3Dに対応。各種別の元のPython描画コードを使います。

Ctrl/Command＋ホイールでプレビューを25〜400%へ拡大・縮小できます。注釈の選択・Delete削除・複製・端点移動・整列・取り消しに対応し、PNGの標準解像度は1200 dpiです。PPTXはSVGの図と編集できるパネルラベルを含む空白スライドです。

Python版v4.1の各プリセットの設定JSONを復元できます。開いているExcel/PowerPointへの直接接続は、保存ファイルの読み込み・ダウンロードに置き換えています。
