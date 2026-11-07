/** Browser-only editing bridge. No project data is sent to a server. */
export const BRIDGE_PROTOCOL = 'figure-studio-bridge-v1';
export const SOURCE_APPS = Object.freeze({
  plot: {name:'PlotLauncher Web', url:'https://murajun620-crypto.github.io/plot_launcher_web/', extension:'.plotproject'},
  mifito: {name:'MiFiTo Web', url:'https://murajun620-crypto.github.io/Microscopy_figure_tools_web/', extension:'.mifito'}
});
const MAX_PROJECT = 320 * 1024 * 1024;
const MAX_PREVIEW = 96 * 1024 * 1024;

export function downloadBlob(blob, name, documentRef = document) {
  const url = URL.createObjectURL(blob);
  const a = documentRef.createElement('a');
  a.href = url; a.download = name; a.hidden = true;
  documentRef.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function isBridgeMessage(event, context) {
  const message = event?.data;
  return event?.origin === context.origin && event?.source === context.popup &&
    message?.protocol === BRIDGE_PROTOCOL && message?.nonce === context.nonce &&
    message?.app === context.app && typeof message.type === 'string';
}

/**
 * Must be called directly from a click/key handler so browsers allow the popup.
 * onStatus receives {state,message,downloadProject}; ready always resolves.
 * url is an optional adapter-enabled copy of the source app (for development).
 */
export function openSource({app, project, sourceName, panelId, onResult = () => {}, onStatus = () => {},
  url, timeoutMs = 20000, windowRef = window}) {
  const spec = SOURCE_APPS[app];
  if (!spec) throw new Error('連携先が不明です。');
  if (!(project instanceof Blob) || !project.size || project.size > MAX_PROJECT) throw new Error('有効な元プロジェクトを添付してください（320 MB以内）。');
  if (!panelId || typeof panelId !== 'string') throw new Error('図の識別子が必要です。');
  const origin = windowRef.location.origin;
  if (!/^https?:\/\//.test(origin)) throw new Error('Web連携はHTTPまたはHTTPSで開いて利用してください。');
  const target = new URL(url || spec.url, windowRef.location.href);
  if (target.protocol !== 'https:' && !(target.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(target.hostname))) throw new Error('連携先はHTTPSで指定してください。');
  const nonce = crypto.randomUUID();
  target.hash = new URLSearchParams({figureBridge:nonce, figureOrigin:origin}).toString();
  const popup = windowRef.open(target.href, `figure-editor-${nonce}`);
  const name = String(sourceName || `source${spec.extension}`).replace(/[\\/]/g, '_');
  const downloadProject = () => downloadBlob(project, name, windowRef.document);
  const status = (state, message) => onStatus({state, message, downloadProject});
  if (!popup) {
    status('error', '編集画面を開けませんでした。ポップアップを許可して、もう一度お試しください。');
    return {window:null, close(){}, downloadProject, ready:Promise.resolve({connected:false,reason:'popup-blocked'})};
  }
  const context = {origin:target.origin,popup,nonce,app};
  let disposed = false, initialized = false, activeHost = '', latestRevision = 0, applyingRevision = 0, settle;
  const ready = new Promise(resolve => {settle = resolve;});
  const send = (type, extra={}) => popup.postMessage({protocol:BRIDGE_PROTOCOL,nonce,app,type,panelId,...extra}, target.origin);
  const timeout = setTimeout(() => {
    if (!initialized && !disposed) {
      status('unavailable', `${spec.name} の連携機能が応答していません。公開版が未対応の場合は、元プロジェクトを保存し、編集画面で開いてください。`);
      settle({connected:false,reason:'adapter-unavailable'});
    }
  }, timeoutMs);
  const interval = setInterval(() => {
    if (popup.closed) {status('closed','編集画面を閉じました。'); close();}
  }, 1200);

  async function receive(event) {
    if (disposed || !isBridgeMessage(event,context)) return;
    const message = event.data;
    if (message.type !== 'ready' && activeHost && message.hostId !== activeHost) return;
    if (message.type === 'ready' && (!initialized || (message.hostId && message.hostId !== activeHost))) {
      const reconnect = initialized;
      activeHost = message.hostId || '';
      // Each editor page has its own revision counter after a reload.
      latestRevision = 0; applyingRevision = 0;
      initialized = true; clearTimeout(timeout);
      status('connected', `${spec.name} に接続しました。`);
      send('load', {project,sourceName:name,reconnect});
      status('loading','元プロジェクトを編集画面へ読み込んでいます…');
    } else if (message.type === 'loaded') {
      status('ready','元プロジェクトを開きました。修正後に「Figureへ反映」を押してください。');
      settle({connected:true});
    } else if (message.type === 'applying') {
      status('applying','編集結果を受け取っています…');
    } else if (message.type === 'error') {
      status('error',String(message.message || '連携処理に失敗しました。'));
      settle({connected:false,reason:'editor-error'});
    } else if (message.type === 'result' && initialized) {
      if (message.panelId !== panelId || !Number.isSafeInteger(message.revision) || message.revision <= latestRevision || message.revision === applyingRevision) return;
      if (!(message.project instanceof Blob) || !message.project.size || message.project.size > MAX_PROJECT ||
          !(message.preview instanceof Blob) || !message.preview.size || message.preview.size > MAX_PREVIEW ||
          !['image/svg+xml','image/png','image/jpeg','image/webp'].includes(message.preview.type)) {
        send('rejected',{revision:message.revision,message:'編集結果の形式・サイズを確認してください。'});
        status('error','編集結果の形式・サイズが対応範囲外です。'); return;
      }
      applyingRevision = message.revision;
      try {
        await onResult({project:message.project,preview:message.preview,sourceName:message.sourceName || name,panelId,app,revision:message.revision});
        latestRevision = message.revision;
        project = message.project;
        send('accepted',{revision:message.revision});
        status('updated','配置を保って編集結果を反映しました。');
      } catch (error) {
        send('rejected',{revision:message.revision,message:error.message || 'Figureへの反映に失敗しました。'});
        status('error',error.message || 'Figureへの反映に失敗しました。');
      } finally {applyingRevision = 0;}
    }
  }
  function close() {
    if (disposed) return;
    disposed = true; clearTimeout(timeout); clearInterval(interval);
    windowRef.removeEventListener('message',receive);
    settle({connected:false,reason:'closed'});
  }
  windowRef.addEventListener('message',receive);
  status('opening',`${spec.name} を開いています…`);
  return {window:popup,close,ready,downloadProject};
}
