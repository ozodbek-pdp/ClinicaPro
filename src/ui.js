// Small helpers to perform animated/strict hide and show for role-based UI elements
function _safe(el) { return el instanceof Element ? el : null; }

export function hideStrict(el) {
  el = _safe(el);
  if (!el) return;
  // Start fade-out animation, then apply tailwind 'hidden' for layout removal
  el.classList.remove('strict-show');
  el.classList.add('strict-hide');
  el.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => {
    try { el.classList.add('hidden'); } catch (_) {}
  }, 220);
}

export function showStrict(el) {
  el = _safe(el);
  if (!el) return;
  // Remove tailwind 'hidden' immediately so element takes space, then animate in
  el.classList.remove('hidden');
  // Force a reflow so transition runs
  // eslint-disable-next-line no-unused-expressions
  el.offsetHeight;
  el.classList.remove('strict-hide');
  el.classList.add('strict-show');
  el.removeAttribute('aria-hidden');
}

export default { hideStrict, showStrict };
