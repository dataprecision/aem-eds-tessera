/*
 * header block — site header (fragment scope)
 *
 * CONFLICT (spec.visualSpec vs spec.computedStyle): visualSpec describes a ~76px solid white
 * header; computedStyle measures 84px with a transparent root (white came from a fixed
 * campaign <img> plate). computedStyle wins — root stays transparent at var(--nav-height),
 * .nav-wrapper paints white + bottom divider, theme plate dropped.
 *
 * Content model (authored rows, key + value) — also compatible with the /nav fragment
 * (positional: brand, sections, tools, locale):
 *   brand    | logo link + image
 *   sections | nested <ul> — one level of dropdown only
 *   tools    | <ul> of utility links (consumer corner, recharge, login)
 *   locale   | <ul> of locale-prefixed links, rendered as a native <select>
 */

import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

// media query match that indicates mobile/tablet width
const isDesktop = window.matchMedia('(min-width: 900px)');

const PART_KEYS = ['brand', 'sections', 'tools', 'locale'];

/**
 * top level nav items, for both the fragment markup and authored block rows
 * @param {Element} navSections the nav sections container
 */
function getNavSectionItems(navSections) {
  if (!navSections) return [];
  return navSections.querySelectorAll(':scope .default-content-wrapper > ul > li, :scope > ul > li');
}

/**
 * Sets the open/closed state of a single dropdown, keeping aria in sync
 * @param {Element} item the top level <li>
 * @param {Boolean} open whether the dropdown should be open
 */
function setDropState(item, open) {
  item.setAttribute('aria-expanded', open ? 'true' : 'false');
  const trigger = item.querySelector(':scope > .nav-drop-trigger');
  if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  const list = item.querySelector(':scope > .nav-drop-list');
  if (list) list.setAttribute('aria-hidden', open ? 'false' : 'true');
}

/**
 * Toggles all nav sections
 * @param {Element} sections The container element
 * @param {Boolean} expanded Whether the element should be expanded or collapsed
 */
function toggleAllNavSections(sections, expanded = false) {
  if (!sections) return;
  const open = expanded === true || expanded === 'true';
  getNavSectionItems(sections).forEach((section) => setDropState(section, open));
}

function closeOnEscape(e) {
  if (e.code !== 'Escape') return;
  const nav = document.getElementById('nav');
  if (!nav) return;
  const navSections = nav.querySelector('.nav-sections');
  if (!navSections) return;
  const navSectionExpanded = navSections.querySelector('[aria-expanded="true"]');
  if (navSectionExpanded && isDesktop.matches) {
    toggleAllNavSections(navSections);
    const trigger = navSectionExpanded.querySelector('.nav-drop-trigger');
    (trigger || navSectionExpanded).focus();
  } else if (!isDesktop.matches) {
    // eslint-disable-next-line no-use-before-define
    toggleMenu(nav, navSections);
    const button = nav.querySelector('.nav-hamburger button');
    if (button) button.focus();
  }
}

function closeOnFocusLost(e) {
  const nav = e.currentTarget;
  if (nav.contains(e.relatedTarget)) return;
  const navSections = nav.querySelector('.nav-sections');
  if (!navSections) return;
  const navSectionExpanded = navSections.querySelector('[aria-expanded="true"]');
  if (navSectionExpanded && isDesktop.matches) {
    toggleAllNavSections(navSections, false);
  } else if (!isDesktop.matches) {
    // eslint-disable-next-line no-use-before-define
    toggleMenu(nav, navSections, false);
  }
}

/**
 * Toggles the entire nav
 * @param {Element} nav The container element
 * @param {Element} navSections The nav sections within the container element
 * @param {*} forceExpanded Optional param to force nav expand behavior when not null
 */
function toggleMenu(nav, navSections, forceExpanded = null) {
  const expanded = forceExpanded !== null ? !forceExpanded : nav.getAttribute('aria-expanded') === 'true';
  const button = nav.querySelector('.nav-hamburger button');
  document.body.style.overflowY = (expanded || isDesktop.matches) ? '' : 'hidden';
  nav.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  // mobile menu shows every section as an open accordion, desktop keeps them collapsed
  toggleAllNavSections(navSections, !(expanded || isDesktop.matches));
  if (button) button.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');

  // enable menu collapse on escape keypress
  if (!expanded || isDesktop.matches) {
    window.addEventListener('keydown', closeOnEscape);
    nav.addEventListener('focusout', closeOnFocusLost);
  } else {
    window.removeEventListener('keydown', closeOnEscape);
    nav.removeEventListener('focusout', closeOnFocusLost);
  }
}

/**
 * Reads the nav parts, either from authored block rows or from the nav fragment sections
 * @param {Element} container block or fragment
 */
function readParts(container) {
  const parts = {};
  [...container.children].forEach((row, i) => {
    const cells = [...row.children];
    let key = PART_KEYS[i];
    let content = cells.length === 1 ? cells[0] : row;
    if (cells.length > 1) {
      const label = cells[0].textContent.trim().toLowerCase();
      if (PART_KEYS.includes(label)) {
        key = label;
        [, content] = cells;
      }
    }
    if (key && !parts[key]) parts[key] = content;
  });
  return parts;
}

async function getNavParts(block) {
  if (block.children.length) return readParts(block);
  const navMeta = getMetadata('nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';
  const fragment = await loadFragment(navPath);
  return fragment ? readParts(fragment) : {};
}

function buildBrand(content) {
  const brand = document.createElement('div');
  brand.className = 'nav-brand';
  if (!content) return brand;
  while (content.firstElementChild) brand.append(content.firstElementChild);
  const brandLink = brand.querySelector('.button');
  if (brandLink) {
    brandLink.className = '';
    const buttonContainer = brandLink.closest('.button-container');
    if (buttonContainer) buttonContainer.className = '';
  }
  return brand;
}

function triggerLabel(item, link) {
  if (link) return link.textContent.trim();
  const clone = item.cloneNode(true);
  clone.querySelectorAll('ul').forEach((list) => list.remove());
  return clone.textContent.trim();
}

/**
 * Decorates a single top level nav item, converting dead/href-less anchors into
 * real buttons and wiring hover + click + keyboard opening (page-wide fix).
 * @param {Element} item the top level <li>
 * @param {Element} sections the nav sections container
 */
function decorateNavItem(item, sections) {
  const list = item.querySelector(':scope > ul');
  const link = item.querySelector(':scope > a');
  item.classList.add('nav-item');

  if (!list) {
    if (link) link.classList.add('nav-link');
    return;
  }

  item.classList.add('nav-drop');
  list.classList.add('nav-drop-list');
  list.setAttribute('role', 'list');

  const label = triggerLabel(item, link);
  const href = link ? link.getAttribute('href') : null;

  // a real destination on the trigger stays reachable as the first item of the panel
  if (href && href !== '#') {
    const known = [...list.querySelectorAll('a')].some((a) => a.getAttribute('href') === href);
    if (!known) {
      const first = document.createElement('li');
      const firstLink = document.createElement('a');
      firstLink.href = href;
      firstLink.textContent = label;
      first.append(firstLink);
      list.prepend(first);
    }
  }

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'nav-drop-trigger';
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.textContent = label;

  if (link) {
    link.replaceWith(trigger);
  } else {
    [...item.childNodes].forEach((node) => {
      if (node !== list) node.remove();
    });
    item.prepend(trigger);
  }

  // dropdown items: an <li> without a link is a non clickable group label
  list.querySelectorAll(':scope > li').forEach((child) => {
    if (child.querySelector('a')) child.classList.add('nav-drop-item');
    else child.classList.add('nav-drop-title');
  });

  setDropState(item, false);

  trigger.addEventListener('click', () => {
    const open = item.getAttribute('aria-expanded') === 'true';
    toggleAllNavSections(sections);
    setDropState(item, !open);
  });

  item.addEventListener('mouseenter', () => {
    if (!isDesktop.matches) return;
    toggleAllNavSections(sections);
    setDropState(item, true);
  });

  item.addEventListener('mouseleave', () => {
    if (isDesktop.matches) setDropState(item, false);
  });

  item.addEventListener('focusin', () => {
    if (!isDesktop.matches) return;
    toggleAllNavSections(sections);
    setDropState(item, true);
  });
}

function buildSections(content) {
  const sections = document.createElement('div');
  sections.className = 'nav-sections';
  if (!content) return sections;
  content.classList.add('default-content-wrapper');
  sections.append(content);
  const list = sections.querySelector('ul');
  if (list) list.classList.add('nav-menu');
  getNavSectionItems(sections).forEach((item) => decorateNavItem(item, sections));
  return sections;
}

function localeFromHref(href) {
  if (!href) return '';
  const path = href.replace(/^https?:\/\/[^/]+/, '');
  const [segment] = path.split('/').filter(Boolean);
  return segment && !segment.includes('.') ? segment : '';
}

/**
 * Renders the authored locale link list as a native select. Changing it performs a
 * full page navigation to the locale prefixed path (matches source behaviour).
 * @param {Element} content the authored locale cell
 */
function buildLanguageSelect(content) {
  const links = content ? [...content.querySelectorAll('a')] : [];
  if (!links.length) return null;

  const container = document.createElement('div');
  container.className = 'nav-language';

  const select = document.createElement('select');
  select.id = 'LanguageNavigator';
  select.className = 'nav-language-select';
  select.setAttribute('aria-label', 'Select language');

  const codes = [];
  links.forEach((link) => {
    const code = localeFromHref(link.getAttribute('href')) || 'en';
    codes.push(code);
    const option = document.createElement('option');
    option.value = code;
    option.textContent = link.textContent.trim();
    select.append(option);
  });

  const [defaultCode] = codes;
  const current = codes.find((code) => window.location.pathname.startsWith(`/${code}/`));
  select.value = current || defaultCode;

  select.addEventListener('change', (e) => {
    const code = e.target.value;
    const segments = window.location.pathname.split('/').filter(Boolean);
    if (codes.includes(segments[0])) segments.shift();
    const rest = `/${segments.join('/')}`;
    const target = code === defaultCode ? rest : `/${code}${rest}`;
    window.location.assign(`${target}${window.location.search}${window.location.hash}`);
  });

  container.append(select);
  return container;
}

/**
 * Login control: opens a slide-in panel, never navigates.
 * TODO(content owner): the source panel collects VC no. / OTP / Google sign-in. No endpoint
 * was supplied, so the panel ships with a link to the existing account page only.
 * @param {String} href account destination
 * @param {String} label authored label
 */
function buildLoginControl(href, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'dishtv-LoginBtn';
  button.className = 'nav-login-button';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'nav-login-panel');
  const icon = document.createElement('span');
  icon.className = 'nav-login-icon';
  icon.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'nav-login-label';
  text.textContent = label;
  button.append(icon, text);

  const panel = document.createElement('div');
  panel.className = 'nav-login-panel';
  panel.id = 'nav-login-panel';
  panel.setAttribute('aria-hidden', 'true');

  const dialog = document.createElement('div');
  dialog.className = 'nav-login-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', label);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'nav-login-close';
  close.setAttribute('aria-label', 'Close');

  const title = document.createElement('p');
  title.className = 'nav-login-title';
  title.textContent = 'Login';

  const copy = document.createElement('p');
  copy.className = 'nav-login-copy';
  copy.textContent = 'Sign in to manage your account, packs and recharges.';

  const cta = document.createElement('a');
  cta.className = 'button accent nav-login-cta';
  cta.href = href;
  cta.textContent = 'Continue to my account';

  dialog.append(close, title, copy, cta);
  panel.append(dialog);

  const onKeydown = (e) => {
    // eslint-disable-next-line no-use-before-define
    if (e.code === 'Escape') closePanel();
  };

  function closePanel() {
    panel.setAttribute('aria-hidden', 'true');
    button.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('login-popup-open');
    document.body.style.overflowY = '';
    window.removeEventListener('keydown', onKeydown);
    button.focus();
  }

  function openPanel() {
    panel.setAttribute('aria-hidden', 'false');
    button.setAttribute('aria-expanded', 'true');
    document.body.classList.add('login-popup-open');
    document.body.style.overflowY = 'hidden';
    window.addEventListener('keydown', onKeydown);
    close.focus();
  }

  button.addEventListener('click', () => {
    if (panel.getAttribute('aria-hidden') === 'false') closePanel();
    else openPanel();
  });
  close.addEventListener('click', closePanel);
  panel.addEventListener('click', (e) => {
    if (e.target === panel) closePanel();
  });

  return { button, panel };
}

function buildTools(toolsContent, localeContent) {
  const tools = document.createElement('div');
  tools.className = 'nav-tools';
  const primary = document.createElement('div');
  primary.className = 'nav-tools-primary';
  const secondary = document.createElement('div');
  secondary.className = 'nav-tools-secondary';
  tools.append(primary, secondary);

  let loginPanel = null;
  const links = toolsContent ? [...toolsContent.querySelectorAll('a')] : [];
  links.forEach((link) => {
    const label = link.textContent.trim();
    const href = link.getAttribute('href') || '';
    link.classList.add('nav-tools-link');
    if (/login|sign in|my-account/i.test(`${label} ${href}`)) {
      const login = buildLoginControl(href || '/my-account.html', label || 'LOGIN');
      secondary.append(login.button);
      loginPanel = login.panel;
    } else if (/recharge/i.test(label)) {
      link.classList.add('nav-recharge');
      secondary.append(link);
    } else if (/consumer/i.test(label)) {
      link.classList.add('nav-consumer');
      primary.append(link);
    } else {
      secondary.append(link);
    }
  });

  const language = buildLanguageSelect(localeContent);
  if (language) primary.append(language);

  return { element: tools, loginPanel };
}

/**
 * loads and decorates the header, mainly the nav
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  const parts = await getNavParts(block);

  const nav = document.createElement('nav');
  nav.id = 'nav';
  nav.setAttribute('aria-label', 'Main menu');

  const brand = buildBrand(parts.brand);
  const navSections = buildSections(parts.sections);
  const { element: tools, loginPanel } = buildTools(parts.tools, parts.locale);

  // hamburger for mobile
  const hamburger = document.createElement('div');
  hamburger.classList.add('nav-hamburger');
  hamburger.innerHTML = `<button type="button" aria-controls="nav" aria-label="Open navigation">
      <span class="nav-hamburger-icon"></span>
    </button>`;
  hamburger.addEventListener('click', () => toggleMenu(nav, navSections));

  nav.append(hamburger, brand, navSections, tools);
  nav.setAttribute('aria-expanded', 'false');
  // prevent mobile nav behavior on window resize
  toggleMenu(nav, navSections, isDesktop.matches);
  isDesktop.addEventListener('change', () => toggleMenu(nav, navSections, isDesktop.matches));

  block.textContent = '';
  const navWrapper = document.createElement('div');
  navWrapper.className = 'nav-wrapper';
  navWrapper.append(nav);
  block.append(navWrapper);
  if (loginPanel) block.append(loginPanel);
}
