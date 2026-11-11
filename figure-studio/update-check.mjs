// Updates are requested by the user. Project persistence stays with the editor.
const RELEASE_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const BUILD_PATTERN = /^[0-9A-Za-z._-]{1,100}$/;

export function parseRelease(value) {
  if (!value || typeof value.version !== 'string' || !RELEASE_PATTERN.test(value.version)
      || typeof value.build !== 'string' || !BUILD_PATTERN.test(value.build)) {
    throw new Error('更新情報の形式が正しくありません。');
  }
  return {version: value.version, build: value.build};
}

function compareVersion(a, b) {
  const [av, ap] = a.split('-'), [bv, bp] = b.split('-');
  const left = av.split('.').map(Number), right = bv.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  if (ap === bp) return 0;
  if (!ap) return 1;
  if (!bp) return -1;
  return ap.localeCompare(bp, 'en', {numeric: true});
}

export function hasNewRelease(current, remote) {
  const order = compareVersion(remote.version, current.version);
  return order > 0 || (order === 0 && remote.build !== current.build);
}

export function setupUpdateCheck({beforeReload, onStatus = () => {}} = {}) {
  if (typeof beforeReload !== 'function') throw new TypeError('beforeReload callback is required.');
  const button = document.getElementById('checkUpdateButton');
  if (!button) throw new Error('更新確認ボタンが見つかりません。');
  const label = button.querySelector('.update-check-label');
  const current = parseRelease({
    version: document.querySelector('meta[name="figure-studio-version"]')?.content,
    build: document.querySelector('meta[name="figure-studio-build"]')?.content,
  });
  let busy = false, available = null, disposed = false, activeController = null;

  function notify(message, status, release = available || current) {
    onStatus(message, {status, ...release});
  }

  function paint(state = busy ? 'checking' : available ? 'available' : 'idle') {
    const text = state === 'reloading' ? '保存中…' : state === 'checking' ? '確認中…'
      : available ? '更新する' : '更新確認';
    if (label) label.textContent = text;
    button.disabled = busy;
    button.dataset.state = state;
    button.classList.toggle('has-update', !!available);
    button.setAttribute('aria-busy', String(busy));
    const description = available
      ? `作業内容を保存して v${available.version} に更新`
      : '新しいバージョンを確認';
    button.title = description;
    button.setAttribute('aria-label', description);
  }

  async function check() {
    if (busy || disposed) return {status: 'busy'};
    busy = true;
    paint('checking');
    const controller = new AbortController();
    activeController = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const url = new URL('./version.json', document.baseURI);
      url.searchParams.set('check', String(Date.now()));
      const response = await fetch(url, {cache: 'no-store', credentials: 'same-origin', signal: controller.signal});
      if (!response.ok) throw new Error('更新情報を取得できませんでした。');
      const remote = parseRelease(await response.json());
      if (disposed) return {status: 'disposed'};
      available = hasNewRelease(current, remote) ? remote : null;
      if (available) {
        notify(`v${remote.version} に更新できます。「更新する」で作業内容を保存して再開します。`, 'available', remote);
        return {status: 'available', ...remote};
      }
      notify(`現在の v${current.version} は最新です。`, 'current', current);
      return {status: 'current', ...current};
    } catch (error) {
      if (disposed) return {status: 'disposed'};
      notify(error?.name === 'AbortError'
        ? '更新確認がタイムアウトしました。時間をおいて再度お試しください。'
        : '更新を確認できませんでした。接続を確認して再度お試しください。', 'error');
      return {status: 'error'};
    } finally {
      clearTimeout(timeout);
      activeController = null;
      busy = false;
      if (!disposed) paint();
    }
  }

  async function update({pendingToken=null}={}) {
    if (busy || disposed) return {status: 'busy'};
    if (!available) return check();
    busy = true;
    paint('reloading');
    try {
      if(window.FigureAppRelease)available=await window.FigureAppRelease.latest();
      const result = await beforeReload();
      if (disposed) return {status: 'disposed'};
      if (result === false) {
        notify('更新を中止しました。作業内容はそのままです。', 'cancelled');
        return {status: 'cancelled'};
      }
      notify('作業内容を保存しました。更新して再開します。', 'reloading');
      const url=window.FigureAppRelease?window.FigureAppRelease.navigationURL(location.href,available,pendingToken):new URL(location.href);url.searchParams.set('_studioBuild',available.build);if(typeof result?.resumeToken==='string')url.searchParams.set('_studioResume',result.resumeToken);location.replace(url.href);
      return {status: 'reloading', ...available};
    } catch {
      notify('作業内容を保存できなかったため、更新しませんでした。プロジェクトを保存してから再度お試しください。', 'save-error');
      return {status: 'save-error'};
    } finally {
      busy = false;
      if (!disposed) paint();
    }
  }

  function clicked() { void (available ? update() : check()); }
  button.addEventListener('click', clicked);
  paint();
  return {
    check,
    update,
    async forceUpdate(target,pendingToken){available=parseRelease(target);return (await update({pendingToken})).status==='reloading';},
    getState: () => ({busy, current: {...current}, available: available ? {...available} : null}),
    dispose() {
      disposed = true;
      activeController?.abort();
      button.removeEventListener('click', clicked);
    },
  };
}
