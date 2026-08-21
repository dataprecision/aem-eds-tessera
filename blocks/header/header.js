/*
 * Header — two-tier site chrome: a utility bar above an orange primary nav bar.
 *
 * Content model (fragment named by the `nav` metadata, default `/nav`; may also be
 * authored inline as a `header` block):
 *   row 1 — utility : logo image link, list of utility links, login link
 *   row 2 — nav     : list of primary nav links, list of CTA links, search config
 *                     (search config = label text + a link to a query-index `.json`
 *                      and/or a link to a search results page, plus an optional icon)
 *
 * Deliberate omissions (measured evidence): no dropdown/megamenu machinery and no
 * `navOverBannerParent` hook — the source renders zero submenus, so none is rebuilt.
 * The source's separate `.mob-header` hamburger markup is alternate markup, not part of
 * this two-row model; small viewports scroll the rows instead (see header.css).
 */

import { getMetadata, decorateIcons } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

const SUGGESTION_LIMIT = 51; // measured: the source dropdown renders up to 51 results
const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 200;

/** @shared-candidate debounce — trailing-edge debouncer for type-ahead, resize and scroll handlers */
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/* Autoblocked headers arrive with one EMPTY row, so never test children.length. */
function hasRealContent(el) {
  return !!el && (!!el.textContent.trim() || !!el.querySelector('img, picture'));
}

/* Authors cannot set link targets in a document: cross-origin links open in a new tab,
   which is how the measured Login link behaves; rel is always hardened alongside. */
function normalizeLink(a) {
  a.classList.remove('button', 'primary', 'secondary', 'accent');
  if (!a.className) a.removeAttribute('class');
  const external = a.hostname && a.hostname !== window.location.hostname;
  if (external || a.getAttribute('target') === '_blank') {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  }
  return a;
}

function listOf(links, className) {
  const ul = document.createElement('ul');
  ul.className = className;
  links.forEach((a) => {
    const li = document.createElement('li');
    li.append(normalizeLink(a));
    ul.append(li);
  });
  return ul;
}

async function loadSource(block) {
  if (hasRealContent(block)) return block;
  const navMeta = getMetadata('nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';
  const fragment = await loadFragment(navPath);
  return fragment || document.createElement('div');
}

function pickRows(source) {
  const rows = [...source.children].filter(hasRealContent);
  if (rows.length >= 2) return { utility: rows[0], nav: rows[1] };
  const only = rows[0] || null;
  // a lone authored row is the utility bar when it carries the logo, otherwise the nav bar
  if (only && only.querySelector('img, picture')) return { utility: only, nav: null };
  return { utility: null, nav: only };
}

function barContainer(bar) {
  const container = document.createElement('div');
  container.className = 'header-container';
  bar.append(container);
  return container;
}

function buildUtility(row) {
  const bar = document.createElement('div');
  bar.className = 'header-utility';
  const container = barContainer(bar);
  if (!row) return bar;

  const image = row.querySelector('picture, img');
  if (image) {
    const logo = document.createElement('div');
    logo.className = 'header-logo';
    logo.append(image.closest('a') || image.closest('picture') || image);
    container.append(logo);
  }

  const quick = document.createElement('div');
  quick.className = 'header-quick-links';
  container.append(quick);

  const [utilityList] = row.querySelectorAll('ul');
  if (utilityList) {
    utilityList.className = 'header-links';
    utilityList.querySelectorAll('a').forEach(normalizeLink);
    quick.append(utilityList);
  }

  // whatever links survive the logo and the utility list are account actions (Login)
  const account = [...row.querySelectorAll('a')];
  if (account.length) quick.append(listOf(account, 'header-account'));
  return bar;
}

function searchLabel(row) {
  const clone = row.cloneNode(true);
  clone.querySelectorAll('a, picture, img, span.icon').forEach((el) => el.remove());
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

function createSuggestions(form, input, indexHref) {
  const dropdown = document.createElement('div');
  dropdown.className = 'header-search-dropdown';
  dropdown.id = 'searchbox-results';
  dropdown.hidden = true;
  const list = document.createElement('ul');
  dropdown.append(list);
  form.append(dropdown);
  input.setAttribute('aria-controls', dropdown.id);
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('autocomplete', 'off');

  let entries = null;
  const options = () => [...list.querySelectorAll('a')];
  const close = () => {
    dropdown.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    list.textContent = '';
  };

  async function index() {
    if (!entries) {
      try {
        const resp = await fetch(indexHref);
        const json = resp.ok ? await resp.json() : null;
        entries = ((json && json.data) || json || []).filter((e) => e && e.path);
      } catch (error) {
        entries = [];
      }
    }
    return entries;
  }

  async function render(query) {
    const data = await index();
    const needle = query.toLowerCase();
    const hits = data
      .filter((e) => `${e.title || ''} ${e.description || ''} ${e.path}`.toLowerCase().includes(needle))
      .slice(0, SUGGESTION_LIMIT);
    list.textContent = '';
    hits.forEach((hit) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = hit.path;
      a.textContent = hit.title || hit.path;
      li.append(a);
      list.append(li);
    });
    if (!hits.length) {
      close();
      return;
    }
    dropdown.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  input.addEventListener('input', debounce(() => {
    const query = input.value.trim();
    if (query.length < MIN_QUERY_LENGTH) close();
    else render(query);
  }, DEBOUNCE_MS));

  form.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close();
      input.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = options();
    if (!items.length) return;
    e.preventDefault();
    const current = items.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown' ? current + 1 : current - 1;
    items[((next % items.length) + items.length) % items.length].focus();
  });

  form.addEventListener('focusout', (e) => {
    if (!form.contains(e.relatedTarget)) close();
  });
  document.addEventListener('click', (e) => {
    if (!form.contains(e.target)) close();
  });

  return { first: () => options()[0] };
}

function buildSearch(row) {
  const links = [...row.querySelectorAll('a')];
  const indexLink = links.find((a) => (a.getAttribute('href') || '').includes('.json'));
  const pageLink = links.find((a) => a !== indexLink);
  const label = searchLabel(row);
  if ((!indexLink && !pageLink) || !label) {
    // Policy: a field with no backing index and no label is a placebo — ship nothing instead.
    // eslint-disable-next-line no-console
    console.warn('[header] search omitted: nav row needs label text plus a query-index (.json) or results-page link');
    return null;
  }

  const form = document.createElement('form');
  form.className = 'header-search';
  form.setAttribute('role', 'search');
  if (pageLink) {
    form.setAttribute('action', pageLink.getAttribute('href'));
    form.setAttribute('method', 'get');
  }

  const field = document.createElement('div');
  field.className = 'header-search-field';
  form.append(field);

  const labelEl = document.createElement('label');
  labelEl.className = 'header-search-label';
  labelEl.id = 'searchbox-label';
  labelEl.setAttribute('for', 'searchbox');
  labelEl.textContent = label; // sr-only, but a real <label> — never placeholder-only
  field.append(labelEl);

  const input = document.createElement('input');
  input.type = 'search';
  input.id = 'searchbox';
  input.name = 'q';
  input.placeholder = label;
  field.append(input);

  const button = document.createElement('button');
  button.type = 'submit';
  button.className = 'header-search-submit';
  button.setAttribute('aria-labelledby', labelEl.id);
  const iconSource = row.querySelector('span.icon, picture, img');
  // author-supplied icon wins; otherwise header.css draws the magnifier on the empty button
  if (iconSource) button.append(iconSource.closest('picture') || iconSource);
  field.append(button);

  const suggestions = indexLink ? createSuggestions(form, input, indexLink.getAttribute('href')) : null;
  form.addEventListener('submit', (e) => {
    if (form.hasAttribute('action')) return;
    e.preventDefault();
    const first = suggestions && suggestions.first();
    if (first) first.click();
  });
  return form;
}

function buildNav(row) {
  const nav = document.createElement('nav');
  nav.className = 'header-nav';
  const container = barContainer(nav);
  if (!row) return nav;

  // document order: the outer list is the primary menu, the next one (flat or nested) is the CTA list
  const lists = [...row.querySelectorAll('ul')];
  if (lists[0]) {
    lists[0].className = 'header-menu';
    lists[0].querySelectorAll('a').forEach(normalizeLink);
    container.append(lists[0]);
  }

  const actions = document.createElement('div');
  actions.className = 'header-actions';
  container.append(actions);

  if (lists[1]) {
    lists[1].className = 'header-cta';
    lists[1].querySelectorAll('a').forEach(normalizeLink);
    actions.append(lists[1]);
  }

  const search = buildSearch(row);
  if (search) actions.append(search);
  return nav;
}

/**
 * loads and decorates the header (utility bar + primary nav bar)
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  const source = await loadSource(block);
  const { utility, nav } = pickRows(source);
  // build first: the rows may live inside `block` itself when authored inline
  const utilityBar = buildUtility(utility);
  const navBar = buildNav(nav);
  block.textContent = '';
  block.append(utilityBar, navBar);
  decorateIcons(block);
}
