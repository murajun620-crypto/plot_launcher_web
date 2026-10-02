# PlotLauncher Web

Excel / CSVの測定データをブラウザ内で処理し、一般グラフをSVG・PNG・PDFで保存できます。

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

一般グラフの軸寸法・文字・線・目盛り・凡例・単位の仕様をPython版に揃え、Python版v4.1の設定JSON、文字・矢印・線の注釈にも対応しています。PNGの標準解像度は1200 dpiです。
