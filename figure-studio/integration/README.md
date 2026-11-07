# Web版との編集連携

Figure Studioの `bridge-client.mjs` と、編集アプリ側の `bridge-host.mjs` が、ブラウザの `postMessage` で元プロジェクトと編集結果を受け渡します。データをサーバーへアップロードしません。送信先origin・送信元window・ランダムなセッション識別子を照合します。

## アダプターの適用

PlotLauncher Web / MiFiTo Webに連携アダプターを適用して利用します。同梱アダプターを適用した両アプリのローカル配信版で、元プロジェクトの読込と編集結果の反映を確認しています。別の配信先へ移す場合や旧版を使用する場合も、編集アプリ側へこのアダプターを適用してください。

未適用の旧版では、URLを開くだけではプロジェクトの自動読込・自動反映は動きません。Figure Studio側は20秒で未接続を案内し、添付した元プロジェクトをダウンロードして手動で開けます。

## 作成アプリから直接送る

対応するPlotLauncher Web / MiFiTo Webでは、上部の「Figure Studioへ送る」で現在の図と元プロジェクトをまとめて追加します。途中でプロジェクトファイルを保存する操作は不要です。

- 同じブラウザで開いているFigure Studioが見つかれば、最後に操作したタブへ追加します。既存のFigureを読み直しません。
- 見つからない場合は、クリック直後に新しいFigure Studioタブを開き、準備できてからデータを渡します。
- 受信側が図の追加を完了してから送信元へ確認を返します。再試行は同じ転送IDを使い、二重追加を抑止します。

Figure Studio側は、現在のドラフトを復元してから受信を開始します。

```js
import {setupTransferReceiver} from './integration/direct-transfer.mjs';
setupTransferReceiver({
  async onImport({app,project,preview,sourceName,transferId}) {
    // 現在のFigureに追加し、元プロジェクトとtransferIdを保存する。
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

通常のURLで開いた場合は「Figure Studioへ送る」を上部へ追加します。Figureから元プロジェクトを開いた場合は「Figureへ反映」を表示します。新しいバージョンのコードでは適用前に差分の確認が必要です。

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
    // 該当パネルの位置・サイズを保って、元プロジェクトと表示を差し替える。
  }
});
```

呼出しはクリックなどのユーザー操作内で行います。戻り値の `ready` は接続結果をresolveし、`close()` は受信を終了します。`downloadProject()` は受け渡すプロジェクトを保存します。アダプターを入れたローカルコピーを試す場合は、`url:'http://localhost:PORT/'` を指定できます。

プロジェクトの中で現在選択されているグラフ／画像を反映します。異なるパネルは別の編集セッションとして開きます。編集中にFigure側のパネルを削除・置換した場合は、呼出側が `onResult` で整合性を確認し、適用できなければ例外で拒否してください。

## 確認

```powershell
node --test integration/bridge.test.mjs integration/direct-transfer.test.mjs
```

このテストは受信元の検証とclient側のハンドシェイク、編集画面の再接続を確認します。今回のローカル配信版では、アダプターを適用した両実アプリで画像・プロジェクトの往復も確認しました。配信先やアプリのバージョンを変える場合は、その環境で接続・往復を再確認してください。

直接送信のテストでは、既存Figureの選択、同期的なタブ起動、追加完了後の確認、二重受信、失敗後の再試行を確認します。
