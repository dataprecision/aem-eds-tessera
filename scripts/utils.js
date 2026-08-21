/*
 * scripts/utils.js — shared mechanics library for dataprecision/aem-eds-tessera.
 *
 * Plain ES module. No imports from blocks/, no framework, no side effects on load.
 * Every export is a generic mechanic that more than one block (or an obvious future
 * block) needs; block-specific content parsing stays in the block.
 */

/* -------------------------------------------------------------------------- */
/* ids                                                                        */
/* -------------------------------------------------------------------------- */

const idCounters = new Map();

/**
 * Generates a document-unique id with a stable, readable prefix. Blocks that build
 * aria-controls / aria-labelledby wiring need collision-free ids across instances.
 * @param {string} [prefix='id'] prefix for the generated id
 * @returns {string} unique id, e.g. `faq-3`
 */
export function nextId(prefix = 'id') {
  const n = (idCounters.get(prefix) || 0) + 1;
  idCounters.set(prefix, n);
  const id = `${prefix}-${n}`;
  if (typeof document !== 'undefined' && document.getElementById(id)) return nextId(prefix);
  return id;
}

/* -------------------------------------------------------------------------- */
/* timing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Trailing-edge debouncer for type-ahead, resize and scroll handlers.
 * @param {Function} fn function to debounce
 * @param {number} [delay=200] quiet period in milliseconds
 * @returns {Function} debounced wrapper; call `.cancel()` to drop a pending run
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

/* -------------------------------------------------------------------------- */
/* links                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Tests whether an anchor points off this origin. Safe on relative, hash, mailto,
 * tel and malformed hrefs (all report `false`).
 * @param {HTMLAnchorElement|string} anchor anchor element or raw href
 * @returns {boolean} true when the href resolves to an http(s) URL on another origin
 */
export function isExternalHref(anchor) {
  try {
    const href = typeof anchor === 'string' ? anchor : anchor.getAttribute('href');
    if (!href) return false;
    const url = new URL(href, window.location.href);
    return url.protocol.startsWith('http:') || url.protocol.startsWith('https:')
      ? url.origin !== window.location.origin
      : false;
  } catch (e) {
    return false;
  }
}

/**
 * Site-wide link hygiene for authored anchors inside a scope:
 *  - every `target="_blank"` link gets `rel="noopener noreferrer"` (security hardening);
 *  - an empty `target=""` attribute (authored artefact) is removed;
 *  - optionally, off-origin and/or document links (`.pdf` by default) are promoted to
 *    a new tab.
 * Targets are otherwise preserved exactly as authored.
 * @param {Element} scope container to scan
 * @param {object} [options] behaviour flags
 * @param {boolean} [options.externalNewTab=false] force off-origin links to `_blank`
 * @param {RegExp|null} [options.documentPattern=null] href pattern also forced to `_blank`
 *   (e.g. `/\.pdf(?:[?#]|$)/i`)
 * @returns {HTMLAnchorElement[]} the anchors that were processed
 */
export function normalizeLinks(scope, options = {}) {
  const { externalNewTab = false, documentPattern = null } = options;
  if (!scope) return [];
  const anchors = [...scope.querySelectorAll('a[href]')];
  anchors.forEach((a) => {
    const href = a.getAttribute('href') || '';
    const promote = (externalNewTab && isExternalHref(a))
      || (documentPattern && documentPattern.test(href));
    if (promote) a.setAttribute('target', '_blank');
    if (a.getAttribute('target') === '') a.removeAttribute('target');
    if (a.getAttribute('target') === '_blank') a.setAttribute('rel', 'noopener noreferrer');
  });
  return anchors;
}

/**
 * Unwraps invalid nested anchors (`<a href><a>label</a></a>`), keeping the outer href.
 * @param {Element} scope container to scan
 */
export function flattenNestedLinks(scope) {
  if (!scope) return;
  scope.querySelectorAll('a a').forEach((inner) => inner.replaceWith(...inner.childNodes));
}

/**
 * Disables or restores keyboard reachability for interactive descendants — used by
 * carousels/disclosures to keep off-screen content out of the tab order.
 * @param {Element} scope container whose focusables are toggled
 * @param {boolean} focusable true to restore, false to remove from the tab order
 */
export function setFocusable(scope, focusable) {
  if (!scope) return;
  scope.querySelectorAll('a[href], button, input, select, textarea, [tabindex]').forEach((el) => {
    if (focusable) el.removeAttribute('tabindex');
    else el.setAttribute('tabindex', '-1');
  });
}

/* -------------------------------------------------------------------------- */
/* cells & content                                                            */
/* -------------------------------------------------------------------------- */

/**
 * True when a table cell carries meaningful authored content (text or media),
 * so an empty autoblocked cell can be skipped.
 * @param {Element} cell candidate cell/element
 * @returns {boolean}
 */
export function hasContent(cell) {
  return !!cell && (cell.textContent.trim() !== '' || !!cell.querySelector('img, picture, a, iframe, svg, video'));
}

/**
 * Moves all child nodes from one element into another, preserving order and listeners.
 * @param {Element|null} from source element (no-op when null)
 * @param {Element} to destination element
 * @returns {Element} the destination element
 */
export function moveChildren(from, to) {
  if (from) while (from.firstChild) to.append(from.firstChild);
  return to;
}

/**
 * Returns the meaningful child nodes of a cell, unwrapping the single `<p>` that
 * authors add inconsistently around short strings.
 * @param {Element|null} cell cell to read
 * @returns {Node[]} child nodes ready to append elsewhere
 */
export function cellNodes(cell) {
  if (!cell) return [];
  const kids = [...cell.children];
  if (kids.length === 1 && kids[0].tagName === 'P') return [...kids[0].childNodes];
  return [...cell.childNodes];
}

/**
 * Returns the authored heading inside a cell, or synthesises one from its text so a
 * block always has a real heading element to style and label controls with.
 * @param {Element|null} cell cell that may contain an authored heading
 * @param {object} [options] options
 * @param {string} [options.fallbackTag='h3'] tag used when no heading was authored
 * @param {string} [options.className] class added to the resulting heading
 * @param {string} [options.id] id assigned to the resulting heading
 * @returns {HTMLElement} the heading element (not yet attached when synthesised)
 */
export function toHeading(cell, options = {}) {
  const { fallbackTag = 'h3', className, id } = options;
  const authored = cell && cell.querySelector('h1, h2, h3, h4, h5, h6');
  const heading = authored || document.createElement(fallbackTag);
  if (!authored) heading.textContent = cell ? cell.textContent.trim() : '';
  if (className) heading.classList.add(className);
  if (id) heading.id = id;
  return heading;
}

/* -------------------------------------------------------------------------- */
/* placeholders / labels                                                      */
/* -------------------------------------------------------------------------- */

let placeholderPromise;

/**
 * Resolves UI strings from placeholders.json with inline fallbacks, tolerating an
 * `aem.js` build without `fetchPlaceholders` and a missing placeholders sheet.
 * Each requested key may list several placeholder aliases; the first non-empty wins.
 * @param {Object<string, string|string[]>} keys map of result key -> placeholder key(s)
 * @param {Object<string, string>} [fallbacks] literal defaults per result key
 * @returns {Promise<Object<string, string>>} resolved label map (never rejects)
 * @example
 *   const labels = await resolveLabels(
 *     { more: ['faqViewMore', 'viewMore'], less: ['faqViewLess', 'viewLess'] },
 *     { more: 'View More', less: 'View Less' },
 *   );
 */
export async function resolveLabels(keys = {}, fallbacks = {}) {
  let placeholders = {};
  try {
    if (!placeholderPromise) {
      placeholderPromise = import('./aem.js')
        .then((mod) => (typeof mod.fetchPlaceholders === 'function' ? mod.fetchPlaceholders() : {}))
        .catch(() => ({}));
    }
    placeholders = (await placeholderPromise) || {};
  } catch (e) {
    placeholders = {};
  }
  const labels = { ...fallbacks };
  Object.entries(keys).forEach(([name, alias]) => {
    const aliases = Array.isArray(alias) ? alias : [alias];
    const hit = aliases
      .map((key) => placeholders[key])
      .find((value) => typeof value === 'string' && value.trim() !== '');
    if (hit) labels[name] = hit.trim();
  });
  return labels;
}

/* -------------------------------------------------------------------------- */
/* disclosure / expandable                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Flips an `aria-expanded` control and the region(s) it owns. Handles the three shapes
 * blocks need: hide/show one region, swap a collapsed node for an expanded one, and
 * swap the control's own label text.
 * @param {Element} control element carrying `aria-expanded` (button or role=button)
 * @param {object} [options] options
 * @param {Element|Element[]|null} [options.region] node(s) shown while expanded
 * @param {Element|Element[]|null} [options.collapsedRegion] node(s) shown while collapsed
 * @param {string} [options.labelExpanded] control text while expanded
 * @param {string} [options.labelCollapsed] control text while collapsed
 * @param {string} [options.openClass] class toggled on `options.openTarget`
 * @param {Element} [options.openTarget] element receiving `openClass` (defaults to control)
 * @param {boolean} [options.force] explicit target state; omit to toggle
 * @param {boolean} [options.manageFocus=false] move focus to the control when collapsing
 *   while focus lives inside a region being hidden
 * @returns {boolean} the resulting expanded state
 */
export function toggleExpandable(control, options = {}) {
  const {
    region = null,
    collapsedRegion = null,
    labelExpanded,
    labelCollapsed,
    openClass,
    openTarget,
    force,
    manageFocus = false,
  } = options;

  const expanded = typeof force === 'boolean'
    ? force
    : control.getAttribute('aria-expanded') !== 'true';
  const show = (nodes, visible) => {
    if (!nodes) return;
    (Array.isArray(nodes) ? nodes : [nodes]).forEach((node) => {
      if (node) node.hidden = !visible;
    });
  };

  if (manageFocus && !expanded && region) {
    const nodes = Array.isArray(region) ? region : [region];
    if (nodes.some((node) => node && node.contains(document.activeElement))) control.focus();
  }

  control.setAttribute('aria-expanded', String(expanded));
  show(region, expanded);
  show(collapsedRegion, !expanded);
  if (labelCollapsed || labelExpanded) {
    const text = expanded ? (labelExpanded || labelCollapsed) : (labelCollapsed || labelExpanded);
    if (text) control.textContent = text;
  }
  if (openClass) (openTarget || control).classList.toggle(openClass, expanded);
  return expanded;
}

/**
 * Builds a real `<button aria-expanded>` wired to a region and returns it, so every
 * read-more / show-all / accordion control is created the same way.
 * The caller supplies labels (authored content or placeholders) — no UI string is
 * invented here; with no label the button is caret-only and named by `labelledBy`.
 * @param {object} [options] options
 * @param {Element|Element[]|null} [options.region] region revealed when expanded
 * @param {Element|Element[]|null} [options.collapsedRegion] region hidden when expanded
 * @param {string} [options.labelCollapsed] button text while collapsed
 * @param {string} [options.labelExpanded] button text while expanded
 * @param {string} [options.labelledBy] id used for `aria-labelledby` when unlabelled
 * @param {string} [options.className] class added to the button
 * @param {boolean} [options.expanded=false] initial state
 * @param {boolean} [options.manageFocus=false] pull focus back on collapse
 * @param {Function} [options.onToggle] callback receiving the new expanded state
 * @returns {HTMLButtonElement} the wired button
 */
export function createExpandableToggle(options = {}) {
  const {
    region = null,
    collapsedRegion = null,
    labelCollapsed,
    labelExpanded,
    labelledBy,
    className,
    expanded = false,
    manageFocus = false,
    onToggle,
  } = options;

  const button = document.createElement('button');
  button.type = 'button';
  if (className) button.className = className;
  button.setAttribute('aria-expanded', 'false');

  const first = Array.isArray(region) ? region[0] : region;
  if (first) {
    if (!first.id) first.id = nextId('expandable');
    button.setAttribute('aria-controls', first.id);
  }
  if (labelCollapsed) button.textContent = labelCollapsed;
  else if (labelledBy) button.setAttribute('aria-labelledby', labelledBy);

  const state = {
    region, collapsedRegion, labelCollapsed, labelExpanded, manageFocus,
  };
  toggleExpandable(button, { ...state, force: expanded });
  button.addEventListener('click', () => {
    const open = toggleExpandable(button, state);
    if (onToggle) onToggle(open);
  });
  return button;
}

/**
 * Splits a body of authored copy at a marker and hides everything after it behind a
 * generated read-more button. The marker is authored content — a paragraph containing
 * `#read-more` / `#read-less` links, an `<hr>`, or any selector the caller passes —
 * so labels come from the document (or supplied fallbacks) and never from code.
 * With no marker and no resolvable label the copy stays fully visible.
 * @param {Element} body element whose trailing content becomes collapsible
 * @param {object} [options] options
 * @param {string} [options.moreSelector='a[href$="#read-more"]'] authored "more" link
 * @param {string} [options.lessSelector='a[href$="#read-less"]'] authored "less" link
 * @param {string} [options.fallbackSelector='hr'] alternate split marker
 * @param {string} [options.labelCollapsed] label used when the marker carries none
 * @param {string} [options.labelExpanded] expanded label used when the marker carries none
 * @param {string} [options.regionClass] class for the generated hidden region
 * @param {string} [options.buttonClass] class for the generated button
 * @param {string} [options.idPrefix='read-more'] prefix for the generated region id
 * @returns {{button: HTMLButtonElement, region: Element}|null} refs, or null when nothing was built
 */
export function createReadMoreFromMarker(body, options = {}) {
  const {
    moreSelector = 'a[href$="#read-more"]',
    lessSelector = 'a[href$="#read-less"]',
    fallbackSelector = 'hr',
    labelCollapsed,
    labelExpanded,
    regionClass,
    buttonClass,
    idPrefix = 'read-more',
  } = options;

  if (!body) return null;
  const link = body.querySelector(moreSelector);
  const marker = link ? (link.closest('p') || link) : body.querySelector(fallbackSelector);
  if (!marker) return null;

  const authoredMore = marker.querySelector?.(moreSelector)?.textContent.trim();
  const authoredLess = marker.querySelector?.(lessSelector)?.textContent.trim();
  const collapsed = authoredMore || labelCollapsed;
  if (!collapsed) return null;
  const expandedLabel = authoredLess || labelExpanded || collapsed;

  const region = document.createElement('div');
  if (regionClass) region.className = regionClass;
  region.id = nextId(idPrefix);
  let node = marker.nextSibling;
  while (node) {
    const next = node.nextSibling;
    region.append(node);
    node = next;
  }

  const button = createExpandableToggle({
    region,
    labelCollapsed: collapsed,
    labelExpanded: expandedLabel,
    className: buttonClass,
  });

  marker.replaceWith(region, button);
  return { button, region };
}

/**
 * Turns a heading + panel pair into a disclosure below a breakpoint and restores plain
 * static markup above it (mobile-only footer columns, filter groups, nav sections).
 * The authored heading is used as the control (`role="button"`), so no extra
 * `<button>`/`<input>` is introduced into the markup.
 * @param {object} options options
 * @param {Element} options.control heading (or other element) acting as the toggle
 * @param {Element} options.panel region revealed by the control
 * @param {MediaQueryList|string} options.media media query gating the disclosure
 * @param {string} [options.openClass] class toggled while open
 * @param {Element} [options.openTarget] element receiving `openClass` (default: control's parent)
 * @param {boolean} [options.openByDefault=false] initial state inside the breakpoint
 * @returns {{destroy: Function}|null} handle removing the media listener, or null if unusable
 */
export function createResponsiveDisclosure(options = {}) {
  const {
    control,
    panel,
    media,
    openClass,
    openTarget,
    openByDefault = false,
  } = options;
  if (!control || !panel || !media) return null;

  const mq = typeof media === 'string' ? window.matchMedia(media) : media;
  if (!panel.id) panel.id = nextId('disclosure');
  const target = openTarget || control.parentElement || control;
  const state = {
    region: panel, openClass, openTarget: target, manageFocus: true,
  };

  const apply = () => {
    if (mq.matches) {
      control.setAttribute('role', 'button');
      control.setAttribute('tabindex', '0');
      control.setAttribute('aria-controls', panel.id);
      toggleExpandable(control, { ...state, force: openByDefault });
    } else {
      ['role', 'tabindex', 'aria-controls', 'aria-expanded'].forEach((attr) => control.removeAttribute(attr));
      panel.hidden = false;
      if (openClass) target.classList.remove(openClass);
    }
  };

  const toggle = () => {
    if (mq.matches) toggleExpandable(control, state);
  };

  control.addEventListener('click', toggle);
  control.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  });
  mq.addEventListener('change', apply);
  apply();
  return { destroy: () => mq.removeEventListener('change', apply) };
}

/* -------------------------------------------------------------------------- */
/* carousel                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Paged carousel engine: steps a flex track N-visible/step-by-one inside a fixed
 * viewport window, clamps to a non-infinite range, drives arrow disabled state,
 * keeps off-screen slides out of the tab order, supports touch/pen swipe paging and
 * re-renders on viewport resize. No autoplay, no infinite wrap.
 * @param {object} options options
 * @param {Element} options.viewport clipping element (fixed visible window)
 * @param {Element} options.track scrolling flex container whose children are the slides
 * @param {Element} [options.prev] previous-page button
 * @param {Element} [options.next] next-page button
 * @param {Element} [options.stateTarget] element storing `data-active-slide` (default: viewport)
 * @param {string} [options.activeClass] class applied to visible slides
 * @param {number} [options.step=1] slides advanced per activation
 * @param {number} [options.swipeThreshold=40] px of pointer travel that counts as a swipe
 * @param {Function} [options.onChange] callback receiving (firstIndex, lastIndex)
 * @returns {{goTo: Function, next: Function, prev: Function, refresh: Function,
 *   index: Function, destroy: Function}|null} controls, or null when there is nothing to page
 */
export function buildCarousel(options = {}) {
  const {
    viewport,
    track,
    prev = null,
    next = null,
    stateTarget,
    activeClass,
    step: stepBy = 1,
    swipeThreshold = 40,
    onChange,
  } = options;
  if (!viewport || !track || !track.children.length) return null;

  const slides = [...track.children];
  const state = stateTarget || viewport;

  const slideStep = () => {
    if (slides.length > 1) {
      const delta = slides[1].offsetLeft - slides[0].offsetLeft;
      if (delta > 0) return delta;
    }
    return slides[0] ? slides[0].offsetWidth || viewport.clientWidth : viewport.clientWidth;
  };
  const perView = () => Math.max(1, Math.round(viewport.clientWidth / slideStep()));
  const maxIndex = () => Math.max(0, slides.length - perView());
  const index = () => parseInt(state.dataset.activeSlide, 10) || 0;

  function goTo(target) {
    const first = Math.min(Math.max(target, 0), maxIndex());
    const last = first + perView() - 1;
    state.dataset.activeSlide = String(first);

    const offset = slides[first] ? slides[first].offsetLeft - slides[0].offsetLeft : 0;
    track.style.transform = `translate3d(-${offset}px, 0px, 0px)`;

    slides.forEach((slide, idx) => {
      const visible = idx >= first && idx <= last;
      if (activeClass) slide.classList.toggle(activeClass, visible);
      slide.setAttribute('aria-hidden', String(!visible));
      setFocusable(slide, visible);
    });

    if (prev) prev.disabled = first <= 0;
    if (next) next.disabled = first >= maxIndex();
    if (onChange) onChange(first, last);
    return first;
  }

  const goNext = () => goTo(index() + stepBy);
  const goPrev = () => goTo(index() - stepBy);
  if (prev) prev.addEventListener('click', goPrev);
  if (next) next.addEventListener('click', goNext);

  let startX = null;
  viewport.addEventListener('pointerdown', (e) => {
    startX = e.pointerType === 'mouse' ? null : e.clientX;
  });
  viewport.addEventListener('pointerup', (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > swipeThreshold) goTo(index() + (dx < 0 ? stepBy : -stepBy));
  });

  let observer = null;
  if (window.ResizeObserver) {
    let width = 0;
    observer = new ResizeObserver(() => {
      if (viewport.clientWidth === width) return;
      width = viewport.clientWidth;
      goTo(index());
    });
    observer.observe(viewport);
  }

  goTo(0);
  return {
    goTo,
    next: goNext,
    prev: goPrev,
    refresh: () => goTo(index()),
    index,
    destroy: () => observer && observer.disconnect(),
  };
}
