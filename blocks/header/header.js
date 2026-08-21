import { getMetadata, decorateIcons } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

// media query match that indicates desktop width
const isDesktop = window.matchMedia('(min-width: 900px)');

const SEARCH_MIN_CHARS = 2;
// measured dropdown rendered 51 rows; cap keeps the 320px panel bounded instead of unbounded
const SEARCH_MAX_RESULTS = 50;
const SEARCH_DEBOUNCE = 200;

let indexPromise;

/**
 * Loads placeholders without hard-failing if the vendored aem.js predates fetchPlaceholders.
 * @returns {Promise<Object>} placeholder key/value map (empty on failure)
 */
async function loadPlaceholders() {
  try {
    const mod = await import('../../scripts/aem.js');
    return typeof mod.fetchPlaceholders === 'function' ? await mod.fetchPlaceholders() : {};
  } catch (e) {
    return {};
  }
}

/**
 * @shared-candidate lazy JSON index loader + substring matcher — every block that offers
 * type-ahead over an EDS query index (search, filters, autocomplete) needs exactly this.
 */
function loadIndex(url) {
  if (!indexPromise) {
    indexPromise = fetch(url)
      .then((resp) => (resp.ok ? resp.json() : { data: [] }))
      .then((json) => (Array.isArray(json) ? json : json.data || []))
      .catch(() => []);
  }
  return indexPromise;
}

function matchesQuery(item, query) {
  return ['title', 'description', 'path'].some((key) => (item[key] || '').toLowerCase().includes(query));
}

/** page-wide fix policy: every new-tab link gets rel="noopener noreferrer" */
function secureExternalLinks(scope) {
  scope.querySelectorAll('a[target="_blank"]').forEach((a) => a.setAttribute('rel', 'noopener noreferrer'));
}

/** authors may mark links as buttons; header chrome owns its own styling */
function unstyleButton(a) {
  if (!a) return;
  a.className = '';
  const container = a.closest('.button-container');
  if (container) container.className = '';
}

/**
 * Splits the fragment into the two authored rows: utility (carries the logo) and nav.
 * Defensive: authors may omit either row entirely.
 */
function splitRows(source) {
  const rows = [...source.children].filter((row) => row.textContent.trim() || row.querySelector('img, picture'));
  if (!rows.length) return { utility: null, main: null };
  if (rows.length === 1) {
    const [only] = rows;
    return only.querySelector('img, picture') ? { utility: only, main: null } : { utility: null, main: only };
  }
  const utility = rows.find((row) => row.querySelector('img, picture')) || rows[0];
  return { utility, main: rows.find((row) => row !== utility) || null };
}

function buildToggle(placeholders) {
  const wrapper = document.createElement('div');
  wrapper.className = 'nav-hamburger';
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-controls', 'nav-main');
  button.setAttribute('aria-expanded', 'false');
  // accessible name comes from the placeholders sheet — no hardcoded locale strings in block JS
  const label = placeholders.menu || placeholders.navigation;
  if (label) button.setAttribute('aria-label', label);
  const icon = document.createElement('span');
  icon.className = 'nav-hamburger-icon';
  button.append(icon);
  wrapper.append(button);
  return wrapper;
}

function buildUtilityBar(row) {
  const bar = document.createElement('div');
  bar.className = 'nav-utility';
  const inner = document.createElement('div');
  inner.className = 'nav-utility-inner';
  bar.append(inner);
  if (!row) return bar;

  const media = row.querySelector('picture, img');
  if (media) {
    const logo = document.createElement('div');
    logo.className = 'nav-logo';
    logo.append(media.closest('a') || media.closest('p') || media);
    unstyleButton(logo.querySelector('a'));
    inner.append(logo);
  }

  const actions = document.createElement('div');
  actions.className = 'nav-utility-actions';
  const lists = [...row.querySelectorAll('ul')];
  // one list with a single item is a lone Login entry, not a utility-link row
  const utilityList = lists.length > 1 || (lists[0] && lists[0].children.length > 1) ? lists[0] : null;
  if (utilityList) {
    utilityList.className = 'nav-utility-links';
    actions.append(utilityList);
  }

  const login = row.querySelector('a'); // whatever link survives the moves above
  if (login) {
    unstyleButton(login);
    login.classList.add('nav-login');
    const holder = document.createElement('div');
    holder.className = 'nav-login-wrapper';
    holder.append(login);
    actions.append(holder);
  }

  inner.append(actions);
  return bar;
}

/**
 * Search is index-backed or absent: with no authored query-index link there is nothing real
 * to suggest, so the field is not rendered at all rather than shipped as a placebo.
 */
function readSearchConfig(row) {
  const index = row && row.querySelector('a[href$=".json"]');
  if (!index) return null;
  const results = [...row.querySelectorAll('a')].find((a) => a !== index);
  return {
    index: index.getAttribute('href'),
    label: index.textContent.trim(),
    results: results ? results.getAttribute('href') : '',
  };
}

function renderResults(panel, input, hits) {
  const list = document.createElement('ul');
  hits.forEach((hit) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = hit.path || '';
    a.textContent = hit.title || hit.path || '';
    li.append(a);
    list.append(li);
  });
  panel.replaceChildren(list);
  panel.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function buildSearch(config) {
  const form = document.createElement('form');
  form.className = 'nav-search';
  form.setAttribute('role', 'search');
  form.method = 'get';
  if (config.results) form.action = config.results;

  const input = document.createElement('input');
  input.type = 'search'; // measured type=text; type=search adds native clear + semantics (fix)
  input.id = 'nav-searchbox';
  input.name = 'q';
  input.autocomplete = 'off';
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', 'nav-search-results');
  input.setAttribute('aria-expanded', 'false');

  const label = document.createElement('label');
  label.className = 'nav-search-label';
  label.setAttribute('for', input.id);
  label.textContent = config.label; // real <label>, not placeholder-only (a11y fix)
  if (config.label) input.placeholder = config.label;

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'nav-search-submit';
  if (config.label) submit.setAttribute('aria-label', config.label);
  const icon = document.createElement('span');
  icon.className = 'icon icon-search'; // /icons/search.svg via decorateIcons — author-swappable
  submit.append(icon);

  const field = document.createElement('div');
  field.className = 'nav-search-field';
  field.append(input, submit);

  const panel = document.createElement('div');
  panel.className = 'nav-search-results';
  panel.id = 'nav-search-results';
  panel.hidden = true;

  form.append(label, field, panel);

  const close = () => {
    panel.hidden = true;
    panel.replaceChildren();
    input.setAttribute('aria-expanded', 'false');
  };

  let timer;
  const suggest = async () => {
    const query = input.value.trim().toLowerCase();
    if (query.length < SEARCH_MIN_CHARS) {
      close();
      return;
    }
    const items = await loadIndex(config.index);
    const hits = items.filter((item) => matchesQuery(item, query)).slice(0, SEARCH_MAX_RESULTS);
    if (!hits.length) {
      close();
      return;
    }
    renderResults(panel, input, hits);
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(suggest, SEARCH_DEBOUNCE);
  });
  input.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') close();
  });
  form.addEventListener('submit', (e) => {
    if (!config.results) e.preventDefault();
  });
  document.addEventListener('click', (e) => {
    if (!form.contains(e.target)) close();
  });

  return form;
}

function buildMainBar(row) {
  const bar = document.createElement('div');
  bar.className = 'nav-main';
  bar.id = 'nav-main';
  const inner = document.createElement('div');
  inner.className = 'nav-main-inner';
  bar.append(inner);
  if (!row) return bar;

  const lists = [...row.querySelectorAll('ul')];
  if (lists[0]) {
    // no nav-drop / megamenu machinery: measured behaviour has zero child menus
    lists[0].className = 'nav-list';
    inner.append(lists[0]);
  }

  const actions = document.createElement('div');
  actions.className = 'nav-actions';
  if (lists[1]) {
    lists[1].className = 'nav-app-links';
    actions.append(lists[1]);
  }
  const searchConfig = readSearchConfig(row);
  if (searchConfig) actions.append(buildSearch(searchConfig));
  inner.append(actions);
  return bar;
}

/** utility links live in the top bar on desktop, inside the collapsible panel on mobile */
function placeUtilityLinks(nav) {
  const links = nav.querySelector('.nav-utility-links');
  if (!links) return;
  const target = isDesktop.matches
    ? nav.querySelector('.nav-utility-actions')
    : nav.querySelector('.nav-main-inner');
  if (!target || links.parentElement === target) return;
  if (isDesktop.matches) target.prepend(links);
  else target.append(links);
}

function toggleMenu(nav, forceClosed = false) {
  const button = nav.querySelector('.nav-hamburger button');
  const expanded = forceClosed ? false : nav.getAttribute('aria-expanded') !== 'true';
  nav.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  if (button) button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  document.body.style.overflowY = expanded && !isDesktop.matches ? 'hidden' : '';
}

/**
 * loads and decorates the header, mainly the nav
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  const navMeta = getMetadata('nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';

  // FRAGMENT TRAP: buildAutoBlocks hands us one EMPTY row — test for real content, never child count
  const authored = !!(block.textContent.trim() || block.querySelector('img, picture'));
  let source;
  if (authored) {
    source = document.createElement('div');
    while (block.firstElementChild) source.append(block.firstElementChild);
  } else {
    source = await loadFragment(navPath);
  }
  if (!source) return;

  const placeholders = await loadPlaceholders();
  const { utility, main } = splitRows(source);

  const nav = document.createElement('nav');
  nav.id = 'nav';
  nav.setAttribute('aria-expanded', 'false');
  if (placeholders.navigation) nav.setAttribute('aria-label', placeholders.navigation);

  const utilityBar = buildUtilityBar(utility);
  const mainBar = buildMainBar(main);
  nav.append(utilityBar, mainBar);

  const toggle = buildToggle(placeholders);
  utilityBar.querySelector('.nav-utility-inner').prepend(toggle);
  toggle.querySelector('button').addEventListener('click', () => toggleMenu(nav));

  nav.addEventListener('click', (e) => {
    if (e.target.closest('a') && !isDesktop.matches) toggleMenu(nav, true);
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && nav.getAttribute('aria-expanded') === 'true') toggleMenu(nav, true);
  });

  placeUtilityLinks(nav);
  isDesktop.addEventListener('change', () => {
    placeUtilityLinks(nav);
    toggleMenu(nav, true);
  });

  secureExternalLinks(nav);
  decorateIcons(nav);

  block.textContent = '';
  const navWrapper = document.createElement('div');
  navWrapper.className = 'nav-wrapper';
  navWrapper.append(nav);
  block.append(navWrapper);
}
