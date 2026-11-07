/** Add this small module to the source editor. It is inactive on normal visits. */
const PROTOCOL = 'figure-studio-bridge-v1';
const MAX_PROJECT = 320 * 1024 * 1024;

export function getFigureBridgeContext(locationRef = location) {
  const params = new URLSearchParams(locationRef.hash.slice(1));
  const nonce = params.get('figureBridge'), rawOrigin = params.get('figureOrigin');
  if (!nonce || !/^[a-zA-Z0-9-]{16,100}$/.test(nonce) || !rawOrigin) return null;
  try {
    const url = new URL(rawOrigin);
    if (url.origin !== rawOrigin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) return null;
    return {nonce,origin:url.origin};
  } catch {return null;}
}

/** captureResult may return both blobs atomically; otherwise use the two callbacks. */
export function setupFigureBridge({app,loadProject,buildProject,renderPreview,captureResult,onAccepted}) {
  const context = getFigureBridgeContext();
  const parent = window.opener;
  if (!context || !parent || !['plot','mifito'].includes(app)) return null;
  const hostId = crypto.randomUUID();
  let panelId = '', sourceName = '', revision = 0, initialized = false, loaded = false, busy = false, awaiting = 0;
  const send = (type,extra={}) => parent.postMessage({protocol:PROTOCOL,nonce:context.nonce,hostId,app,type,panelId,...extra},context.origin);
  const panel = document.createElement('div');
  panel.id = 'figure-studio-bridge';
  panel.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483000;display:flex;gap:12px;align-items:center;max-width:calc(100vw - 40px);padding:12px 16px;background:#fff;color:#173c38;border:1px solid #b8cfcb;border-radius:12px;box-shadow:0 6px 28px #173c3825;font:13px/1.5 system-ui,sans-serif;';
  const message = document.createElement('span'); message.textContent = 'Figure Studio に接続しています…';
  message.setAttribute('role','status'); message.setAttribute('aria-live','polite');
  const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Figureへ反映'; button.disabled = true;
  button.style.cssText = 'white-space:nowrap;border:0;border-radius:7px;padding:9px 14px;background:#126c60;color:#fff;font:600 13px system-ui;cursor:pointer;';
  panel.append(message,button); document.body.append(panel);
  const readyTimer = setInterval(() => {if (!initialized) send('ready');},700);
  send('ready');
  async function receive(event) {
    const data = event.data;
    if (event.source !== parent || event.origin !== context.origin || data?.protocol !== PROTOCOL || data?.nonce !== context.nonce || data?.app !== app) return;
    if (data.type === 'load' && !initialized) {
      if (!(data.project instanceof Blob) || !data.project.size || data.project.size > MAX_PROJECT || typeof data.panelId !== 'string') {
        send('error',{message:'プロジェクトの受け渡し形式が正しくありません。'}); return;
      }
      initialized = true; clearInterval(readyTimer); busy = true;
      panelId = data.panelId; sourceName = String(data.sourceName || (app === 'plot' ? 'figure.plotproject' : 'figure.mifito'));
      message.textContent = '元プロジェクトを読み込んでいます…';
      try {
        await loadProject(new File([data.project],sourceName,{type:data.project.type || 'application/octet-stream'}),{reconnect:!!data.reconnect});
        loaded = true; button.disabled = false;
        message.textContent = '修正後に「Figureへ反映」を押してください。'; send('loaded');
      } catch (error) {
        message.textContent = error.message || '元プロジェクトを開けませんでした。'; send('error',{message:message.textContent});
      } finally {busy = false;}
    } else if (data.type === 'accepted' && data.revision === awaiting) {
      awaiting = 0; button.disabled = false; message.textContent = 'Figureに反映しました。続けて編集できます。';
      onAccepted?.();
    } else if (data.type === 'rejected' && data.revision === awaiting) {
      awaiting = 0; button.disabled = false; message.textContent = data.message || 'Figureへの反映に失敗しました。';
    }
  }
  window.addEventListener('message',receive);
  button.addEventListener('click',async () => {
    if (!loaded || busy || awaiting) return;
    if (parent.closed) {message.textContent = 'Figure Studioが閉じています。編集内容をプロジェクトとして保存してください。';return;}
    busy = true; button.disabled = true; send('applying'); message.textContent = '編集結果を作成しています…';
    try {
      const result = captureResult ? await captureResult() : {project:await buildProject(),preview:await renderPreview()};
      if (!(result?.project instanceof Blob) || !(result?.preview instanceof Blob)) throw new Error('編集結果を作成できませんでした。');
      awaiting = ++revision;
      const sentRevision = revision;
      send('result',{revision,project:result.project,preview:result.preview,sourceName:result.sourceName || sourceName});
      message.textContent = 'Figureへの反映を確認しています…';
      setTimeout(() => {if(awaiting === sentRevision){awaiting=0;button.disabled=false;message.textContent='Figureからの確認が届きません。Figure Studioの画面を確認してください。';}},15000);
    } catch (error) {
      message.textContent = error.message || '編集結果の作成に失敗しました。';
      send('error',{message:message.textContent}); button.disabled = false;
    } finally {busy = false;}
  });
  return {close(){clearInterval(readyTimer);window.removeEventListener('message',receive);panel.remove();}};
}
