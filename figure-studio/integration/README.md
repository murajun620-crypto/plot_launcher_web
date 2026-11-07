# Web版との編集連携

Figure Studioの `bridge-client.mjs` と、編集アプリ側の `bridge-host.mjs` が、ブラウザ内で元プロジェクトと編集結果を受け渡します。同一originの既存タブは `editor-discovery.mjs` のBroadcastChannelで検出・接続し、新しく開く編集タブには `postMessage` も使用します。origin・接続先・所有者・セッション識別子を照合し、接続成立後にプロジェクトを送ります。データをサーバーへアップロードしません。

今回の対応版はFigure Studio v0.4.0／PlotLauncher v2.4.20／MiFiTo v1.9.4です。

`/figure-studio/` はStudio／PlotLauncher／MiFiToを切り替える統合画面です。Studio本体を `studio.html?figureWorkspace=1`、元アプリをそれぞれの既存HTMLから読み込み、初回に開いた画面を保持します。タブ切替で描画エンジンを再起動せず、図の送信をStudioが受理した後にStudioタブへ戻ります。統合用に編集アプリを複製せず、単独版と同じコード・モジュールを使います。

単独URLも維持します：[Studio](https://murajun620-crypto.github.io/plot_launcher_web/figure-studio/studio.html)、[PlotLauncher](https://murajun620-crypto.github.io/plot_launcher_web/)、[MiFiTo](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/)。元アプリの単独起動時はStudio送信ボタンを表示しません。Studio単独画面からは同じoriginの既存編集タブを再利用でき、連携はブラウザ内で完結するためサーバーやAPIキーは不要です。

Studioの子画面ではブランド・バージョン・更新ボタンを外側の統合ヘッダーへまとめ、Figure名と保存・開く操作を残します。Studio更新は子画面だけに適用し、元アプリの編集画面を再読み込みしません。プロジェクト保存はMiFiToと同じく、初回にフォルダーとファイル名を選び、以後は上書き、保存メニューから「名前を付けて保存」を使えます。保存先ハンドルはプロジェクトJSONへ含めず、ブラウザ内に保持します。

## アダプターの適用

PlotLauncher Web / MiFiTo Webに連携アダプターを適用して利用します。同梱アダプターを適用した両アプリのローカル配信版で、元プロジェクトの読込と編集結果の反映を確認しています。別の配信先へ移す場合や旧版を使用する場合も、編集アプリ側へこのアダプターを適用してください。

未適用の旧版では、URLを開くだけではプロジェクトの自動読込・自動反映は動きません。Figure Studio側は20秒で未接続を案内し、添付した元プロジェクトをダウンロードして手動で開けます。

## 統合画面からStudioへ送る

統合画面のPlotLauncher／MiFiToでは、トップバーの「Figure Studioへ送る」で現在の図と元プロジェクトをまとめて送ります。MiFiToの「まとめてStudioへ送る」は複数画像の追加・更新に対応します。Studioから図を開き直した場合も同じボタンを使い、関連付けた元の図を更新してStudioへ戻ります。途中でプロジェクトファイルを保存する操作は不要です。

- 同じブラウザで開いているFigure Studioが見つかれば、最後に操作したタブへ追加します。既存のFigureを読み直しません。
- 見つからない場合は、クリック直後に新しいFigure Studioタブを開き、準備できてからデータを渡します。
- 受信側が図の追加を完了してから送信元へ確認を返します。再試行は同じ転送IDを使い、二重追加を抑止します。

Figure Studio側は、現在のドラフトを復元してから受信を開始します。

```js
import {setupTransferReceiver} from './integration/direct-transfer.mjs';
setupTransferReceiver({
  async onImport({app,project,preview,image,batch,sourceName,transferId}) {
    // 単体はpreview、MiFiTo一括はbatch.imagesの画像を処理する。
    // 元プロジェクトとtransferId、MiFiToのprojectId/imageIdを保存する。
    // 追加できなければ例外を投げる。処理が完了するまでawaitする。
  },
  onStatus({state,message}) { /* 状態表示 */ }
});
```

受信記録はメモリとlocalStorageに保持し、対応ブラウザではWeb Locksで別タブへの同時再送も直列化します。クラッシュ直後に備え、Figureプロジェクトにも `transferId` を記録して重複を確認します。

開発時はlocalhost上の `/plot_launcher_web/figure-studio/` を既定の送信先にします。`studioUrl` オプションで別の検証先を指定できます。

## 編集アプリ側へ追加する

既存アプリのWeb用リポジトリを作業用ディレクトリへチェックアウトしてから実行します。

```powershell
node integration/apply-bridge.mjs plot C:\path\to\plot_launcher_web
node integration/apply-bridge.mjs mifito C:\path\to\Microscopy_figure_tools_web
```

スクリプトは、アプリのコードに対応する箇所が存在するか確認し、次の変更を行います。

- `bridge-host.mjs`・`direct-transfer.mjs`・`editor-discovery.mjs` を配置。
- `app.js` にimportと連携用コールバックを追加。
- Figureから開いたときはギャラリーを開かず、受け渡されたプロジェクトを復元。アプリ更新時の一時保存は従来どおり復元し、再接続後も編集内容を保持。
- `index.html` のapp.jsキャッシュキー、アプリのビルドID、`version.json` を揃えて更新。
- 元の `app.js` は `app.js.before-figure-bridge` に保存。

統合画面の子画面またはFigureから接続した編集画面では、トップバーへ「Figure Studioへ送る」を表示します。初回は図を追加し、編集接続した後は関連付けた元の図を更新します。接続・送信結果や切替を妨げる未反映編集がある場合だけ案内を追加します。元アプリを単独起動した場合は送信ボタンを表示しません。新しいバージョンのコードでは適用前に差分の確認が必要です。

MiFiToの一括対応を移植する場合は、最新の `app.js` / `project.js` にある識別情報の保存・復元と `mifito-sync.mjs` も必要です。`captureBatchResult` を渡すと、統合画面・連携編集のトップバーに「まとめてStudioへ送る」を追加します。

## Figure Studioから呼ぶ

```js
import {openSource,setupSourceDiscovery} from './integration/bridge-client.mjs';
setupSourceDiscovery(); // Studio起動時から既存の編集タブを検出
const session = openSource({
  app:'plot',
  project:projectBlob,
  sourceName:'experiment.plotproject',
  panelId:'panel-a',
  onStatus({state,message,downloadProject,openInNewTab}) { /* 状態表示と別タブで開く操作 */ },
  async onResult({project,preview,panelId}) {
    // 該当パネルの位置を保って、元プロジェクトと表示を差し替える。
    // 実寸指定がある画像は配置倍率を、それ以外は配置サイズを維持する。
  }
});
```

呼出しはクリックなどのユーザー操作内で行います。戻り値の `ready` は接続結果をresolveし、`close()` は受信を終了します。`downloadProject()` は受け渡すプロジェクトを保存します。アダプターを入れたローカルコピーを試す場合は、`url:'http://localhost:PORT/'` を指定できます。

単体反映では現在選択中のグラフ／画像を反映します。同一originでは通常起動した編集タブもアプリ・URLごとに検出し、MiFiToでは `imageId` を指定して該当画像を開きます。Studioを再読み込みしても同じタブの所有者情報で再接続します。別のStudioが使用中の編集タブは取得しません。

通常起動の編集内容を引き継ぐのは、Studioが受信完了を返した元プロジェクトと一致し、送信元でも同じ内容を引き続き編集している場合です。直接送信の成功時に `rememberAccepted(result)` へ正確な送信結果を渡し、`canAdoptAccepted` で元データの対応を確認します。その後の編集は保持して接続します。別の内容や未反映編集がある場合は置き換えを止め、利用者が `openInNewTab()` を選んだときだけ別タブで開けます。

接続の再試行では同じ読込リクエストIDを使います。編集側は読込中・読込済みの同じ要求を繰り返し実行せず、確認を返すため、通信の取りこぼしで編集中の内容を読み直しません。編集中にFigure側のパネルを削除・置換した場合は、呼出側が `onResult` で整合性を確認し、適用できなければ例外で拒否してください。

## MiFiToの一括同期

Figure Studio v0.4.0 / MiFiTo v1.9.4では、共通のプロジェクトBlobと `batch: {projectId, images: [{imageId, name, fingerprint, preview}]}` を渡します。プロジェクト・画像IDは `.mifito` へ保存し、旧形式では元画像情報から補完します。ファイル名や画像の並び順だけで既存パネルを置換しません。

受信側は画像ごとの内容・描画設定の指紋を照合し、変更のないプレビューを差し替えません。変更画像は別のFigureにあっても位置を維持して更新し、未追加の画像は受信中のFigure、または連携編集を開いた元のFigureへ追加します。元プロジェクトは共有して関連付け、一括変更を1つのUndo履歴として扱います。送信元にない画像をStudioから自動削除する処理はありません。受信結果の `summary: {updated, added, unchanged}` で処理件数を返します。

一括機能は `batch-v1` の対応確認後に使用します。変更のない画像は送信元でもプレビューを再利用し、反映確認後にだけ同期済みの状態を更新します。

MiFiTo v1.9.4の「Studioに貼る画像サイズ」で「画像本体のサイズを指定」をオンにすると、幅または高さをmmで指定できます。対象画像だけに設定し、「全画像に適用」で共有します。設定は `settings.output.studioSize`（未指定は `null`、指定時は `{axis:'width'|'height', mm:number}`）として保存します。単体・一括送信ともStudio用SVGに実寸を含め、カラーバーや画像外のラベル領域を除いた画像本体の寸法と縦横比を保ちます。通常のファイル保存には適用しません。

Figure Studio v0.4.0では、初めて実寸を指定した画像は指定寸法を採用し、以後の再編集ではStudioで変更した配置倍率を維持します。更新時の位置は維持します。実寸未指定の画像は従来どおり追加時に用紙へ収め、更新時は配置サイズを維持します。

## 確認

```powershell
node --test integration/*.test.mjs
```

このテストは受信元の検証、既存の通常タブへの接続、Studio再読み込み後の再接続、読込要求・確認の欠落からの復旧、単体・一括反映を確認します。配信先やアプリのバージョンを変える場合は、その環境で接続・往復を再確認してください。

直接送信のテストでは、既存Figureの選択、同期的なタブ起動、追加完了後の確認、二重受信、失敗後の再試行を確認します。
