/*
 * scripts/utils.js — shared mechanics library for dataprecision/aem-eds-tessera.
 *
 * Plain ES module. No imports from blocks/. Every export is a generic mechanic that
 * more than one block needs (or that is block-agnostic by construction).
 */

/**
 * Fragment-autoblock guard. `buildBlock()` hands `decorate()` a block containing one
 * EMPTY row, so `block.children.length` lies about whether an author placed content.
 * Test for real content instead.
 * @param {Element} block block element
 * @returns {boolean} true when the block carries authored content of its own
 */
export function isAuthored(block) {
  if (!block) return false;
  return !!(block.textContent.trim() || block.querySelector('img, picture'));
}

/**
 * Normalises the two EDS table shapes an author may produce (one row × N cells, or
 * N rows × one cell) into a flat list of column elements.
 * @param {Element} block block element
 * @returns {Element[]} the column elements, in author order
 */
export function flattenColumns(block) {
  if (!block) return [];
  const rows = [...block.children];
  const cells = rows.flatMap((row) => [...row.children]);
  return cells.length >= rows.length && cells.length > 0 ? cells : rows;
}

/**
 * Origin-aware external-link test. Relative and malformed hrefs are treated as internal.
 * @param {string} href candidate href
 * @param {string} [base=window.location.href] base URL to resolve against
 * @returns {boolean} true when the href resolves to a different origin
 */
export function isExternalHref(href, base = window.location.href) {
  if (!href) return false;
  try {
    return new URL(href, base).origin !== new URL(base).origin;
  } catch (e) {
    return false;
  }
}

/**
 * Applies the site-wide new-tab policy to every link in a scope: external links (and
 * links already marked `target="_blank"`) open in a new tab with `rel="noopener noreferrer"`.
 * @param {Element} scope container to harden
 * @param {Object} [options] behaviour flags
 * @param {boolean} [options.openExternalInNewTab=true] set `target="_blank"` on external links;
 *   pass false to preserve authored targets and only add `rel` (policy-row behaviour)
 * @param {boolean} [options.stripEmptyTarget=true] remove a meaningless `target=""` attribute
 * @returns {Element[]} the links that were modified
 */
export function secureLinks(scope, options = {}) {
  const {
    openExternalInNewTab = true,
    stripEmptyTarget = true,
  } = options;
  if (!scope) return [];
  const touched = [];
  scope.querySelectorAll('a[href]').forEach((a) => {
    const external = isExternalHref(a.getAttribute('href'));
    const marked = a.getAttribute('target') === '_blank';
    if ((external && openExternalInNewTab) || marked) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
      touched.push(a);
    } else if (stripEmptyTarget && a.getAttribute('target') === '') {
      a.removeAttribute('target');
      touched.push(a);
    }
  });
  // links marked for a new tab but carrying no href still need the rel hardening
  scope.querySelectorAll('a[target="_blank"]:not([href])').forEach((a) => {
    a.setAttribute('rel', 'noopener noreferrer');
    touched.push(a);
  });
  return touched;
}

/**
 * Unwraps nested anchors (`<a><a>Label</a></a>`) left behind by pasted markup.
 * @param {Element} root container to normalize
 */
export function flattenNestedAnchors(root) {
  if (!root) return;
  root.querySelectorAll('a a').forEach((inner) => inner.replaceWith(...inner.childNodes));
}

/**
 * Loads the placeholders sheet without hard-failing when the project ships no
 * `scripts/placeholders.js` and the vendored `aem.js` predates `fetchPlaceholders`.
 * Resolves to an empty object on any failure. Result is cached per prefix.
 * @param {string} [prefix='default'] placeholders prefix (locale root)
 * @returns {Promise<Object>} placeholder key/value map (empty on failure)
 */
const placeholdersCache = new Map();
export function loadPlaceholders(prefix = 'default') {
  if (!placeholdersCache.has(prefix)) {
    const attempt = (async () => {
      /* eslint-disable import/no-unresolved */
      try {
        const mod = await import('./placeholders.js');
        if (typeof mod.fetchPlaceholders === 'function') {
          return (await mod.fetchPlaceholders(prefix)) || {};
        }
      } catch (e) { /* project has no placeholders.js — fall through */ }
      try {
        const mod = await import('./aem.js');
        if (typeof mod.fetchPlaceholders === 'function') {
          return (await mod.fetchPlaceholders(prefix)) || {};
        }
      } catch (e) { /* vendored aem.js predates fetchPlaceholders */ }
      /* eslint-enable import/no-unresolved */
      return {};
    })();
    placeholdersCache.set(prefix, attempt);
  }
  return placeholdersCache.get(prefix);
}

/**
 * Resolves UI microcopy from the placeholders sheet with safe fallbacks. Never throws,
 * never hardcodes locale strings — an empty string means "no label available", which
 * callers should treat as "do not render the control".
 * @param {Object<string, string>} keys map of result name → placeholders key
 *   (e.g. `{ more: 'viewMore', less: 'viewLess' }`)
 * @param {Object} [options] behaviour flags
 * @param {Object<string, string>} [options.defaults] fallback value per result name
 * @param {string} [options.prefix='default'] placeholders prefix
 * @returns {Promise<Object<string, string>>} resolved labels, one entry per key
 */
export async function resolveLabels(keys, options = {}) {
  const { defaults = {}, prefix = 'default' } = options;
  const placeholders = await loadPlaceholders(prefix);
  return Object.entries(keys).reduce((acc, [name, key]) => {
    acc[name] = placeholders[key] || defaults[name] || '';
    return acc;
  }, {});
}

/**
 * Wires an `aria-expanded` button to a collapsed/expanded pair of regions with authored
 * labels. Handles the id/aria-controls plumbing and the initial state; returns a
 * programmatic setter so callers can close the region from elsewhere.
 * @param {HTMLButtonElement} button the toggle control
 * @param {Object} regions the two regions
 * @param {Element} [regions.collapsed] region shown while closed (hidden when open)
 * @param {Element} [regions.expanded] region shown while open (hidden when closed)
 * @param {Object} labels button text per state
 * @param {string} labels.more text shown while collapsed
 * @param {string} labels.less text shown while expanded
 * @param {Object} [options] behaviour flags
 * @param {boolean} [options.expanded=false] initial state
 * @param {function(boolean):void} [options.onToggle] callback after each state change
 * @returns {function(boolean):void} setter that forces the open state
 */
export function toggleExpandable(button, regions, labels, options = {}) {
  const { collapsed, expanded } = regions || {};
  const { expanded: initial = false, onToggle } = options;

  const apply = (open) => {
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? labels.less : labels.more;
    if (collapsed) collapsed.hidden = open;
    if (expanded) expanded.hidden = !open;
    if (typeof onToggle === 'function') onToggle(open);
  };

  if (!button.type) button.type = 'button';
  if (expanded && expanded.id) button.setAttribute('aria-controls', expanded.id);
  apply(initial);
  button.addEventListener('click', () => {
    apply(button.getAttribute('aria-expanded') !== 'true');
  });
  return apply;
}

/**
 * Lazily fetches an EDS query index (or any JSON endpoint returning `{ data: [] }`
 * or a bare array) once per URL and caches the promise. Network failures resolve to
 * an empty array rather than rejecting.
 * @param {string} url index URL
 * @returns {Promise<Object[]>} the index rows
 */
const indexCache = new Map();
export function loadIndex(url) {
  if (!indexCache.has(url)) {
    indexCache.set(url, fetch(url)
      .then((resp) => (resp.ok ? resp.json() : { data: [] }))
      .then((json) => (Array.isArray(json) ? json : json.data || []))
      .catch(() => []));
  }
  return indexCache.get(url);
}

/**
 * Case-insensitive substring search over index rows — the matcher behind type-ahead,
 * filters and autocomplete built on a query index.
 * @param {Object[]} items index rows
 * @param {string} query raw user input
 * @param {Object} [options] behaviour flags
 * @param {string[]} [options.fields=['title','description','path']] row fields to search
 * @param {number} [options.limit=50] maximum number of hits returned
 * @param {number} [options.minChars=2] below this query length, return no hits
 * @returns {Object[]} matching rows, capped at `limit`
 */
export function searchIndex(items, query, options = {}) {
  const {
    fields = ['title', 'description', 'path'],
    limit = 50,
    minChars = 2,
  } = options;
  const needle = (query || '').trim().toLowerCase();
  if (needle.length < minChars) return [];
  return (items || [])
    .filter((item) => fields.some((key) => String(item[key] || '').toLowerCase().includes(needle)))
    .slice(0, limit);
}

/**
 * Trailing-edge debounce. Returns a wrapper that runs `fn` only after `delay` ms have
 * passed without another call — used for type-ahead input and resize handlers.
 * @param {Function} fn function to debounce
 * @param {number} [delay=200] quiet period in milliseconds
 * @returns {Function} debounced wrapper exposing a `.cancel()` method
 */
export function debounce(fn, delay = 200) {
  let timer;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

/**
 * Extracts a cell's meaningful contents, unwrapping a lone wrapping `<p>` so inline
 * text does not become a block-level paragraph when re-parented.
 * @param {Element} cell table cell / column element
 * @returns {Node[]} child nodes ready to be appended elsewhere
 */
export function contentsOf(cell) {
  if (!cell) return [];
  const onlyPara = cell.children.length === 1
    && cell.firstElementChild.tagName === 'P'
    && cell.textContent.trim() === cell.firstElementChild.textContent.trim();
  return onlyPara ? [...cell.firstElementChild.childNodes] : [...cell.childNodes];
}

/**
 * Returns the authored heading inside a cell, or synthesises one from its text so a
 * block always has a real heading element to style.
 * @param {Element} cell source cell
 * @param {string} [level='h2'] tag name used when no heading was authored
 * @returns {Element|null} heading element, or null for an empty cell
 */
export function headingFrom(cell, level = 'h2') {
  if (!cell) return null;
  const authored = cell.querySelector('h1, h2, h3, h4, h5, h6');
  if (authored) return authored;
  const text = cell.textContent.trim();
  if (!text) return null;
  const heading = document.createElement(level);
  heading.textContent = text;
  return heading;
}

/**
 * True when a column carries media and no copy — the "image only" column of a
 * multi-column row.
 * @param {Element} col column element
 * @returns {boolean} true for a media-only column
 */
export function isImageOnly(col) {
  if (!col) return false;
  return !!col.querySelector('picture, img') && col.textContent.trim() === '';
}

/**
 * Measures the geometry of a horizontally scrolling track: one step is the distance
 * between consecutive item origins (item width + gap), and `visible` is how many whole
 * items fit the viewport.
 * @param {Element} viewport clipping element
 * @param {Element[]|NodeList} items the track items
 * @param {number} [fallbackStep=0] step used when nothing can be measured yet
 * @returns {{step: number, visible: number, total: number}} measured metrics
 */
export function measureTrack(viewport, items, fallbackStep = 0) {
  const list = [...(items || [])];
  if (!list.length || !viewport) return { step: fallbackStep, visible: 1, total: list.length };
  const measured = list.length > 1
    ? list[1].offsetLeft - list[0].offsetLeft
    : list[0].offsetWidth;
  const step = measured > 0 ? measured : fallbackStep;
  const visible = step > 0
    ? Math.min(list.length, Math.max(1, Math.round(viewport.clientWidth / step)))
    : 1;
  return { step, visible, total: list.length };
}

/**
 * Applies the off-screen accessibility bookkeeping for a windowed carousel: items
 * outside the visible window are `aria-hidden` and their focusable descendants are
 * removed from the tab order.
 * @param {Element[]|NodeList} items the track items
 * @param {number} index index of the first visible item
 * @param {number} visible number of items in the visible window
 * @param {string} [focusables='a, button, input, select, textarea'] focusable selector
 */
export function setWindowVisibility(items, index, visible, focusables = 'a, button, input, select, textarea') {
  [...(items || [])].forEach((item, idx) => {
    const inWindow = idx >= index && idx < index + visible;
    item.setAttribute('aria-hidden', String(!inWindow));
    item.querySelectorAll(focusables).forEach((el) => {
      if (inWindow) el.removeAttribute('tabindex');
      else el.setAttribute('tabindex', '-1');
    });
  });
}

/**
 * Observes size changes on an element and calls back (debounced to the next frame when
 * available). No-op with a null teardown on browsers without ResizeObserver.
 * @param {Element} target element to observe
 * @param {Function} callback invoked on resize
 * @returns {function():void} teardown function
 */
export function onResize(target, callback) {
  if (!target || typeof window.ResizeObserver !== 'function') return () => {};
  const observer = new ResizeObserver(() => callback(target));
  observer.observe(target);
  return () => observer.disconnect();
}

/**
 * Single-open (exclusive) accordion wiring, delegated from a list container. Clicking a
 * trigger closes every other open item; clicking an open trigger closes it.
 * @param {Element} list container holding the accordion items
 * @param {Object} [options] selectors and state hooks
 * @param {string} [options.trigger='[aria-expanded]'] selector for the toggle control
 * @param {string} [options.item] selector for the item wrapper; defaults to the trigger's parent
 * @param {string} [options.openClass='is-open'] class applied to the open item
 * @returns {function(Element, boolean):void} setter that opens/closes a given item
 */
export function exclusiveAccordion(list, options = {}) {
  const {
    trigger = '[aria-expanded]',
    item: itemSelector,
    openClass = 'is-open',
  } = options;

  const wrapperOf = (button) => (itemSelector ? button.closest(itemSelector) : button.parentElement);

  const setOpen = (element, open) => {
    if (!element) return;
    const button = element.matches(trigger) ? element : element.querySelector(trigger);
    if (button) button.setAttribute('aria-expanded', open ? 'true' : 'false');
    element.classList.toggle(openClass, open);
  };

  list.addEventListener('click', (event) => {
    const button = event.target.closest(trigger);
    if (!button || !list.contains(button)) return;
    const wasOpen = button.getAttribute('aria-expanded') === 'true';
    list.querySelectorAll(`.${openClass}`).forEach((open) => setOpen(open, false));
    if (!wasOpen) setOpen(wrapperOf(button), true);
  });

  return setOpen;
}
