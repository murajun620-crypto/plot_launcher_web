# Web版との編集連携

Figure Studioの `bridge-client.mjs` と、編集アプリ側の `bridge-host.mjs` が、ブラウザの `postMessage` で元プロジェクトと編集結果を受け渡します。データをサーバーへアップロードしません。送信先origin・送信元window・ランダムなセッション識別子を照合します。

## アダプターの適用

PlotLauncher Web / MiFiTo Webに連携アダプターを適用して利用します。同梱アダプターを適用した両アプリのローカル配信版で、元プロジェクトの読込と編集結果の反映を確認しています。別の配信先へ移す場合や旧版を使用する場合も、編集アプリ側へこのアダプターを適用してください。

未適用の旧版では、URLを開くだけではプロジェクトの自動読込・自動反映は動きません。Figure Studio側は20秒で未接続を案内し、添付した元プロジェクトをダウンロードして手動で開けます。

## 編集アプリ側へ追加する

既存アプリのWeb用リポジトリを作業用ディレクトリへチェックアウトしてから実行します。

```powershell
node integration/apply-bridge.mjs plot C:\path\to\plot_launcher_web
node integration/apply-bridge.mjs mifito C:\path\to\Microscopy_figure_tools_web
```

スクリプトは、アプリのコードに対応する箇所が存在するか確認し、次の変更を行います。

- `bridge-host.mjs` を配置。
- `app.js` にimportと連携用コールバックを追加。
- Figureから開いたときはギャラリーを開かず、受け渡されたプロジェクトを復元。アプリ更新時の一時保存は従来どおり復元し、再接続後も編集内容を保持。
- `index.html` のapp.jsキャッシュキー、アプリのビルドID、`version.json` を揃えて更新。
- 元の `app.js` は `app.js.before-figure-bridge` に保存。

通常のURLで開いた場合は連携UIを表示せず、既存の編集機能を使用します。新しいバージョンのコードでは適用前に差分の確認が必要です。

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
node --test integration/bridge.test.mjs
```

このテストは受信元の検証とclient側のハンドシェイク、編集画面の再接続を確認します。今回のローカル配信版では、アダプターを適用した両実アプリで画像・プロジェクトの往復も確認しました。配信先やアプリのバージョンを変える場合は、その環境で接続・往復を再確認してください。
