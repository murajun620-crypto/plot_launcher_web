// Shared with MiFiTo. Keep file operations and help behavior identical.
export function filePickerOptions(id, description, accept, startIn) {
  return {id, types:[{description, accept}], ...(startIn ? {startIn} : {})};
}

export async function documentSaver({name, id, description, accept, startIn, fallback}, host = window) {
  if (typeof host.showSaveFilePicker !== 'function') return fallback();
  // Acquire the handle in the click gesture, before generating large projects.
  const handle = await host.showSaveFilePicker({...filePickerOptions(id, description, accept, startIn), suggestedName:name});
  return async blob => {
    const writer = await handle.createWritable();
    try {await writer.write(blob); await writer.close();}
    catch (error) {try {await writer.abort();} catch {} throw error;}
    return handle.name;
  };
}

export function compactHelp(root = document) {
  // Keep live readouts, warnings, measurements and dialog help in place.
  for (const hint of root.querySelectorAll('p.hint:not([id]), p.field-hint:not([id])')) {
    if (hint.closest('#helpDialog, [role="status"], .download-receipt')) continue;
    const text = hint.textContent.trim();
    let scope = hint.previousElementSibling;
    if (scope?.matches('input[hidden]')) scope = scope.previousElementSibling;
    let targets = scope ? [...scope.querySelectorAll('button,input,select,summary')] : [];
    if (scope?.matches('button,input,select,summary')) targets.unshift(scope);
    if (hint.dataset.helpFor) targets = [...root.querySelectorAll(hint.dataset.helpFor)];
    if (!targets.length) {
      const heading = hint.parentElement.querySelector('summary,button,input,select');
      if (heading) targets = [heading];
    }
    if (!targets.length || !text) continue;
    for (const control of targets) {
      const existing = control.getAttribute('title') || '';
      const description = existing.includes(text) ? existing : [existing,text].filter(Boolean).join('\n');
      control.setAttribute('title', description);
      control.setAttribute('aria-description', description);
    }
    hint.remove();
  }
}
