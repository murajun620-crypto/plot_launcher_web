# Web版との編集連携

Figure Studioの `bridge-client.mjs` と、編集アプリ側の `bridge-host.mjs` が、ブラウザの `postMessage` で元プロジェクトと編集結果を受け渡します。データをサーバーへアップロードしません。送信先origin・送信元window・ランダムなセッション識別子を照合します。

## アダプターの適用

PlotLauncher Web / MiFiTo Webに連携アダプターを適用して利用します。同梱アダプターを適用した両アプリのローカル配信版で、元プロジェクトの読込と編集結果の反映を確認しています。別の配信先へ移す場合や旧版を使用する場合も、編集アプリ側へこのアダプターを適用してください。

未適用の旧版では、URLを開くだけではプロジェクトの自動読込・自動反映は動きません。Figure Studio側は20秒で未接続を案内し、添付した元プロジェクトをダウンロードして手動で開けます。

## 作成アプリから直接送る

PlotLauncher v2.4.18 / MiFiTo v1.9.2では、トップバーの「Figure Studioへ送る」で現在の図と元プロジェクトをまとめて送ります。MiFiToの「まとめてStudioへ送る」は複数画像の追加・更新に対応します。通常起動とStudioからの編集起動でボタン名・配置を統一しています。途中でプロジェクトファイルを保存する操作は不要です。

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

- `bridge-host.mjs` と `direct-transfer.mjs` を配置。
- `app.js` にimportと連携用コールバックを追加。
- Figureから開いたときはギャラリーを開かず、受け渡されたプロジェクトを復元。アプリ更新時の一時保存は従来どおり復元し、再接続後も編集内容を保持。
- `index.html` のapp.jsキャッシュキー、アプリのビルドID、`version.json` を揃えて更新。
- 元の `app.js` は `app.js.before-figure-bridge` に保存。

通常起動・Figureからの編集起動ともに、トップバーへ「Figure Studioへ送る」を表示します。通常起動では図を追加し、連携編集では関連付けた元の図を更新します。接続状態・送信結果・取り消し操作もヘッダー内に表示し、画面下部に重なる操作パネルは使用しません。新しいバージョンのコードでは適用前に差分の確認が必要です。

MiFiToの一括対応を移植する場合は、最新の `app.js` / `project.js` にある識別情報の保存・復元と `mifito-sync.mjs` も必要です。`captureBatchResult` を渡すと、通常起動・連携編集のどちらでもトップバーに「まとめてStudioへ送る」を追加します。

## Figure Studioから呼ぶ

```js
import {openSource} from './integration/bridge-client.mjs';
const session = openSource({
  app:'plot',
  project:projectBlob,
  sourceName:'experiment.plotproject',
  panelId:'panel-a',
  onStatus({state,message,downloadProject}) { /* 状態表示 */ },
  async onResult({project,preview,panelId}) {
    // 該当パネルの位置を保って、元プロジェクトと表示を差し替える。
    // 実寸指定がある画像は配置倍率を、それ以外は配置サイズを維持する。
  }
});
```

呼出しはクリックなどのユーザー操作内で行います。戻り値の `ready` は接続結果をresolveし、`close()` は受信を終了します。`downloadProject()` は受け渡すプロジェクトを保存します。アダプターを入れたローカルコピーを試す場合は、`url:'http://localhost:PORT/'` を指定できます。

単体反映では現在選択中のグラフ／画像を反映します。編集用タブはアプリごとに再利用し、MiFiToでは `imageId` を指定して該当画像を開きます。編集中にFigure側のパネルを削除・置換した場合は、呼出側が `onResult` で整合性を確認し、適用できなければ例外で拒否してください。

## MiFiToの一括同期

Figure Studio v0.3.5 / MiFiTo v1.9.2では、共通のプロジェクトBlobと `batch: {projectId, images: [{imageId, name, fingerprint, preview}]}` を渡します。プロジェクト・画像IDは `.mifito` へ保存し、旧形式では元画像情報から補完します。ファイル名や画像の並び順だけで既存パネルを置換しません。

受信側は画像ごとの内容・描画設定の指紋を照合し、変更のないプレビューを差し替えません。変更画像は別のFigureにあっても位置を維持して更新し、未追加の画像は受信中のFigure、または連携編集を開いた元のFigureへ追加します。元プロジェクトは共有して関連付け、一括変更を1つのUndo履歴として扱います。送信元にない画像をStudioから自動削除する処理はありません。受信結果の `summary: {updated, added, unchanged}` で処理件数を返します。

一括機能は `batch-v1` の対応確認後に使用します。変更のない画像は送信元でもプレビューを再利用し、反映確認後にだけ同期済みの状態を更新します。

MiFiTo v1.9.2の「Studioに貼る画像サイズ」で「画像本体のサイズを指定」をオンにすると、幅または高さをmmで指定できます。対象画像だけに設定し、「全画像に適用」で共有します。設定は `settings.output.studioSize`（未指定は `null`、指定時は `{axis:'width'|'height', mm:number}`）として保存します。単体・一括送信ともStudio用SVGに実寸を含め、カラーバーや画像外のラベル領域を除いた画像本体の寸法と縦横比を保ちます。通常のファイル保存には適用しません。

Figure Studio v0.3.5では、初めて実寸を指定した画像は指定寸法を採用し、以後の再編集ではStudioで変更した配置倍率を維持します。更新時の位置は維持します。実寸未指定の画像は従来どおり追加時に用紙へ収め、更新時は配置サイズを維持します。

## 確認

```powershell
node --test integration/bridge.test.mjs integration/direct-transfer.test.mjs
```

このテストは受信元の検証とclient側のハンドシェイク、編集画面の再接続を確認します。今回のローカル配信版では、アダプターを適用した両実アプリで画像・プロジェクトの往復も確認しました。配信先やアプリのバージョンを変える場合は、その環境で接続・往復を再確認してください。

直接送信のテストでは、既存Figureの選択、同期的なタブ起動、追加完了後の確認、二重受信、失敗後の再試行を確認します。
