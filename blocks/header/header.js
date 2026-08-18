/*
 * header block — site header (fragment scope)
 *
 * CONFLICT (spec.visualSpec vs spec.computedStyle): visualSpec describes a ~76px solid white
 * header; computedStyle measures 84px with a transparent root (the white came from a fixed
 * campaign <img> plate). computedStyle wins — root stays transparent at var(--nav-height),
 * .nav-wrapper paints white + bottom divider, the blank.png/'holi-image' theme plate is dropped.
 *
 * Content model (authored rows, key + value) — also compatible with the /nav fragment
 * (positional: brand, sections, tools, locale):
 *   brand    | logo link + image (animated GIF is fine, e.g. ind-gif02.gif)
 *   sections | nested <ul> — exactly one level of dropdown
 *   tools    | list of utility entries (CONSUMER CORNER, INSTANT RECHARGE, LOGIN)
 *   locale   | list of 9 locale pairs (`hi-in | HINDI (हिंदी)`, `en/ENGLISH`, or locale-prefixed links)
 *
 * FLAG-TO-CONTENT-OWNER: the source LOGIN flyout (VC no. / OTP / Google sign-in) is sibling
 * markup outside the header. This block only toggles the login trigger state (body class
 * `login-popup-open` + `header:login-toggle` event); it never builds a login panel.
 */

import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

// media query match that indicates mobile/tablet width
const isDesktop = window.matchMedia('(min-width: 900px)');

const PART_KEYS = ['brand', 'sections', 'tools', 'locale'];
const DEFAULT_LOCALE = 'en';
const NEW_TAB_HINT = /opens in a new tab/i;
const NEW_TAB_SUFFIX = /\s*\(?\s*opens in a new tab\s*\)?\s*$/i;
// `hi-in | HINDI (हिंदी)`, `en/ENGLISH`, `ta-in TAMIL( தமிழ்)`
const LOCALE_PAIR = /^\s*([a-z]{2}(?:-[a-z]{2})?)\s*(?:[|:,/–—-]\s*|\s+)(.+?)\s*$/i;

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

/**
 * FRAGMENT AUTOBLOCK TRAP: scripts.js builds this block with buildBlock('header', ''), so the
 * block always arrives with one EMPTY row. Never test block.children.length — test for content.
 * @param {Element} block the header block
 */
function hasAuthoredContent(block) {
  if (block.querySelector('img, picture, a, ul, ol, select')) return true;
  return !!block.textContent.trim();
}

async function getNavParts(block) {
  if (hasAuthoredContent(block)) return readParts(block);
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

/**
 * Clean label of a top level item — the sr-only "opens in a new tab" hint is never part of it
 * @param {Element} item the top level <li>
 * @param {Element} link the top level anchor, if any
 */
function triggerLabel(item, link) {
  const source = link || item;
  const clone = source.cloneNode(true);
  clone.querySelectorAll('ul, ol').forEach((list) => list.remove());
  clone.querySelectorAll('span').forEach((span) => {
    if (NEW_TAB_HINT.test(span.textContent)) span.remove();
  });
  return clone.textContent.replace(NEW_TAB_SUFFIX, '').trim();
}

/**
 * Preserves (or re-creates) the source's sr-only "opens in a new tab" span on a trigger.
 * Authors express it either as target="_blank" on the label link or as a trailing
 * "(opens in a new tab)" in the label text.
 * @param {Element} trigger the button element
 * @param {Element} link the original anchor, if any
 */
function applyNewTabHint(trigger, link) {
  let hint = [...trigger.querySelectorAll('span')].find((s) => NEW_TAB_HINT.test(s.textContent));

  if (!hint) {
    const textNode = [...trigger.childNodes]
      .find((node) => node.nodeType === Node.TEXT_NODE && NEW_TAB_HINT.test(node.textContent));
    if (textNode) textNode.textContent = textNode.textContent.replace(NEW_TAB_SUFFIX, '');
    const newTab = !!textNode || (link && link.getAttribute('target') === '_blank');
    if (newTab) {
      hint = document.createElement('span');
      hint.textContent = 'opens in a new tab';
      trigger.append(hint);
    }
  }

  if (hint) hint.className = 'nav-sr-only';
}

/**
 * Decorates a single top level nav item. Href-less labels (MODIFY MY PACK, GET A CONNECTION)
 * become real button-role triggers with aria-expanded instead of dead anchors, and hover +
 * click + keyboard all open the single dropdown level.
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
      if (link.getAttribute('target')) firstLink.target = link.getAttribute('target');
      first.append(firstLink);
      list.prepend(first);
    }
  }

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'nav-drop-trigger';
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');

  if (link) {
    // move the label nodes so authored spans (e.g. the sr-only hint) survive the upgrade
    while (link.firstChild) trigger.append(link.firstChild);
    link.replaceWith(trigger);
  } else {
    [...item.childNodes].forEach((node) => {
      if (node !== list) {
        trigger.append(node);
      }
    });
    item.prepend(trigger);
  }

  if (!trigger.textContent.trim()) trigger.textContent = label;
  applyNewTabHint(trigger, link);

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
 * Picks the authored entries of a content cell, preferring list items over rows over paragraphs
 * @param {Element} content the authored cell
 */
function contentEntries(content) {
  if (!content) return [];
  const listItems = [...content.querySelectorAll('li')];
  if (listItems.length) return listItems;
  const rows = [...content.querySelectorAll('tr')];
  if (rows.length) return rows;
  const paragraphs = [...content.querySelectorAll('p')];
  if (paragraphs.length) return paragraphs;
  const children = [...content.children];
  return children.length ? children : [content];
}

/**
 * Reads the 9 locale pairs. Accepts locale prefixed links, two cell rows, or `code | LABEL` text.
 * @param {Element} content the authored locale cell
 */
function parseLocaleOptions(content) {
  const options = [];
  const seen = new Set();
  const add = (code, label) => {
    const value = (code || '').trim().toLowerCase();
    const text = (label || '').trim();
    if (!value || !text || seen.has(value)) return;
    seen.add(value);
    options.push({ code: value, label: text });
  };

  contentEntries(content).forEach((entry) => {
    const link = entry.querySelector ? entry.querySelector('a') : null;
    if (link) {
      add(localeFromHref(link.getAttribute('href')) || DEFAULT_LOCALE, link.textContent);
      return;
    }
    const cells = entry.children ? [...entry.children].filter((c) => c.textContent.trim()) : [];
    if (cells.length >= 2) {
      add(cells[0].textContent, cells[1].textContent);
      return;
    }
    const match = entry.textContent.match(LOCALE_PAIR);
    if (match) add(match[1], match[2]);
  });

  return options;
}

/**
 * Renders the authored locale list as a native <select> (matches the source #LanguageNavigator).
 * Changing it performs a real full page navigation to the locale prefixed path.
 * @param {Element} content the authored locale cell
 */
function buildLanguageSelect(content) {
  const options = parseLocaleOptions(content);
  if (!options.length) return null;

  const container = document.createElement('div');
  container.className = 'nav-language';

  const select = document.createElement('select');
  select.id = 'LanguageNavigator';
  select.className = 'nav-language-select';
  select.setAttribute('aria-label', 'Select language');

  options.forEach(({ code, label }) => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = label;
    select.append(option);
  });

  const codes = options.map(({ code }) => code);
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
 * Login control: a trigger only. It never navigates and never builds a panel — it flips
 * aria-expanded, toggles the body class the site login panel listens for, and emits
 * `header:login-toggle` so out-of-block markup can react.
 * @param {String} href optional account destination, exposed to listeners
 * @param {String} label authored label
 */
function buildLoginControl(href, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'dishtv-LoginBtn';
  button.className = 'nav-login-button';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-haspopup', 'dialog');
  if (href) button.dataset.loginHref = href;

  const icon = document.createElement('span');
  icon.className = 'nav-login-icon';
  icon.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'nav-login-label';
  text.textContent = label;
  button.append(icon, text);

  const setState = (open) => {
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('login-popup-open', open);
    document.dispatchEvent(new CustomEvent('header:login-toggle', {
      detail: { open, href: href || '' },
    }));
  };

  const onKeydown = (e) => {
    if (e.code !== 'Escape') return;
    if (button.getAttribute('aria-expanded') !== 'true') return;
    setState(false);
    window.removeEventListener('keydown', onKeydown);
    button.focus();
  };

  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    setState(open);
    if (open) window.addEventListener('keydown', onKeydown);
    else window.removeEventListener('keydown', onKeydown);
  });

  return button;
}

/**
 * Utility area: CONSUMER CORNER and INSTANT RECHARGE stay plain links (no modal in the source),
 * LOGIN becomes the trigger button, and the locale list becomes the native select.
 * @param {Element} toolsContent authored tools cell
 * @param {Element} localeContent authored locale cell
 */
function buildTools(toolsContent, localeContent) {
  const tools = document.createElement('div');
  tools.className = 'nav-tools';
  const primary = document.createElement('div');
  primary.className = 'nav-tools-primary';
  const secondary = document.createElement('div');
  secondary.className = 'nav-tools-secondary';
  tools.append(primary, secondary);

  let hasLogin = false;
  contentEntries(toolsContent).forEach((entry) => {
    const link = entry.tagName === 'A' ? entry : entry.querySelector('a');
    const label = (link || entry).textContent.trim();
    if (!label) return;
    const href = link ? link.getAttribute('href') || '' : '';

    if (/login|sign in|my-account/i.test(`${label} ${href}`)) {
      if (hasLogin) return;
      hasLogin = true;
      secondary.append(buildLoginControl(href, label || 'LOGIN'));
      return;
    }
    if (!link) return;

    link.classList.add('nav-tools-link');
    if (/recharge/i.test(label)) {
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

  return tools;
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
  const tools = buildTools(parts.tools, parts.locale);

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
}
