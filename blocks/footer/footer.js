import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

/*
 * Footer — dark six-column grid (5 link columns + Locate-a-Dealer / Follow us),
 * copyright band and legal row, with a CSS/JS accordion on mobile driven by the
 * SAME markup (source duplicated every list into a hidden .foot-mob copy: dropped).
 * FIXes applied over source: real <ul><li>, real <form> + native pattern validation
 * with inline error (no SweetAlert2), rel="noopener noreferrer" on the 4 social
 * links, hover/focus-visible affordances, decorative art as aria-hidden img.
 */

const DESKTOP_QUERY = '(min-width: 900px)';
const NEW_TAB_HINT = 'opens in a new tab';
const DEALER_ERROR = 'Please enter a valid 6-digit pincode';

let columnId = 0;

function srOnly(text) {
  const span = document.createElement('span');
  span.className = 'footer-sr-only';
  span.textContent = text;
  return span;
}

function mediaOf(img) {
  return img.closest('picture') || img;
}

/* decorative art must never be announced (acceptance: alt="" + aria-hidden) */
function decorativeImage(img, className) {
  const media = mediaOf(img);
  media.classList.add(className);
  img.setAttribute('alt', '');
  img.setAttribute('aria-hidden', 'true');
  img.setAttribute('loading', 'lazy');
  return media;
}

function textParagraph(cell) {
  return [...cell.querySelectorAll('p, div')]
    .find((el) => !el.querySelector('img') && el.textContent.trim());
}

function buildLinkList(cell, className) {
  const list = document.createElement('ul');
  list.className = className;
  cell.querySelectorAll('a').forEach((a) => {
    a.classList.remove('button', 'primary', 'secondary', 'accent');
    const li = document.createElement('li');
    li.append(a);
    list.append(li);
  });
  return list;
}

function buildLinkColumn(title, cell) {
  columnId += 1;
  const id = `footer-column-${columnId}`;
  const column = document.createElement('div');
  column.className = 'footer-column';

  const heading = document.createElement('h4');
  heading.className = 'footer-column-title';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'footer-column-toggle';
  toggle.setAttribute('aria-controls', id);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.textContent = title;
  heading.append(toggle);

  const list = buildLinkList(cell, 'footer-links');
  list.id = id;

  const rule = document.createElement('hr');
  rule.className = 'footer-column-rule';

  column.append(heading, list, rule);
  return column;
}

function buildDealer(title, cell) {
  const wrapper = document.createElement('div');
  wrapper.className = 'footer-dealer';

  const heading = document.createElement('h4');
  heading.className = 'footer-column-title footer-column-title-static';
  heading.textContent = title;

  const pin = [...cell.querySelectorAll('img')].find((img) => !img.closest('a'));
  const action = cell.querySelector('a');
  const arrow = action ? action.querySelector('img') : null;
  const labelSource = textParagraph(cell);
  const placeholder = labelSource ? labelSource.textContent.trim() : 'Enter Pincode';
  const destination = action && action.getAttribute('href') && !action.getAttribute('href').startsWith('javascript') ? action.getAttribute('href') : '';

  const form = document.createElement('form');
  form.className = 'footer-dealer-form';
  form.setAttribute('novalidate', 'novalidate');

  if (pin) form.append(decorativeImage(pin, 'footer-dealer-icon'));

  const label = document.createElement('label');
  label.className = 'footer-sr-only';
  label.setAttribute('for', 'footer-pincode');
  label.textContent = placeholder;

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'footer-pincode';
  input.name = 'pincode';
  input.className = 'footer-dealer-input';
  input.setAttribute('inputmode', 'numeric');
  input.setAttribute('pattern', '[0-9]{6}');
  input.setAttribute('maxlength', '6');
  input.setAttribute('minlength', '6');
  input.setAttribute('autocomplete', 'postal-code');
  input.required = true;
  input.placeholder = placeholder;
  input.setAttribute('aria-describedby', 'footer-pincode-error');

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'footer-dealer-submit';
  if (arrow) submit.append(decorativeImage(arrow, 'footer-dealer-arrow'));
  submit.append(srOnly('Find a dealer'));

  form.append(label, input, submit);

  const error = document.createElement('p');
  error.className = 'footer-dealer-error';
  error.id = 'footer-pincode-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  error.textContent = DEALER_ERROR;

  input.addEventListener('input', () => {
    const digits = input.value.replace(/[^0-9]/g, '');
    if (digits !== input.value) input.value = digits;
    if (!error.hidden && input.checkValidity()) {
      error.hidden = true;
      input.removeAttribute('aria-invalid');
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!input.checkValidity()) {
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    error.hidden = true;
    input.removeAttribute('aria-invalid');
    // FLAG-TO-CONTENT-OWNER: source POSTed to /api/Subscriber/PinCodeDetail (401 for
    // guests) — the API call is omitted; navigate to the authored dealer page instead.
    if (destination) {
      const separator = destination.includes('?') ? '&' : '?';
      window.location.href = `${destination}${separator}pincode=${encodeURIComponent(input.value)}`;
    }
  });

  const rule = document.createElement('hr');
  rule.className = 'footer-dealer-rule';

  wrapper.append(heading, form, error, rule);
  return wrapper;
}

function buildSocial(title, cell) {
  const wrapper = document.createElement('div');
  wrapper.className = 'footer-social';

  const heading = document.createElement('h4');
  heading.className = 'footer-column-title footer-column-title-static';
  heading.textContent = title;

  const list = document.createElement('ul');
  list.className = 'footer-social-list';

  cell.querySelectorAll('a').forEach((a) => {
    const label = a.textContent.trim();
    const img = a.querySelector('img');
    a.classList.remove('button', 'primary', 'secondary', 'accent');
    a.classList.add('footer-social-link');
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    if (img) decorativeImage(img, 'footer-social-icon');
    [...a.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .forEach((node) => node.remove());
    if (label) a.append(srOnly(label));
    a.append(srOnly(NEW_TAB_HINT));
    const li = document.createElement('li');
    li.append(a);
    list.append(li);
  });

  wrapper.append(heading, list);
  return wrapper;
}

function buildBrand(cell) {
  const wrapper = document.createElement('div');
  wrapper.className = 'footer-brand';
  const img = cell.querySelector('img');
  if (img) {
    const media = mediaOf(img);
    media.classList.add('footer-logo');
    img.setAttribute('loading', 'lazy');
    wrapper.append(media);
  }
  const source = textParagraph(cell);
  const copyright = document.createElement('p');
  copyright.className = 'footer-copyright';
  copyright.textContent = source ? source.textContent.trim() : '';
  wrapper.append(copyright);
  return wrapper;
}

function buildLegal(cell) {
  const nav = document.createElement('nav');
  nav.className = 'footer-legal';
  nav.setAttribute('aria-label', 'Legal');
  // REPLICATE-AS-IS: every legal link (incl. external Trade Partners) stays same-tab.
  nav.append(buildLinkList(cell, 'footer-legal-list'));
  return nav;
}

function setupAccordion(scope) {
  const toggles = [...scope.querySelectorAll('.footer-column-toggle')];
  if (!toggles.length) return;
  const desktop = window.matchMedia(DESKTOP_QUERY);

  const listOf = (btn) => scope.querySelector(`#${btn.getAttribute('aria-controls')}`);

  const sync = () => {
    toggles.forEach((btn) => {
      const list = listOf(btn);
      btn.disabled = desktop.matches;
      btn.setAttribute('aria-expanded', desktop.matches ? 'true' : 'false');
      if (list) list.hidden = !desktop.matches;
    });
  };

  toggles.forEach((btn) => {
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      const list = listOf(btn);
      if (list) list.hidden = expanded;
    });
  });

  desktop.addEventListener('change', sync);
  sync();
}

function rowsOf(root) {
  const nested = root.querySelector('.footer');
  const scope = nested && nested !== root ? nested : root;
  return [...scope.children].filter((el) => el.children.length >= 2);
}

function decorateFooterContent(root) {
  if (root.querySelector('.footer-columns')) return;
  const rows = rowsOf(root);
  if (!rows.length) return;

  const inner = document.createElement('div');
  inner.className = 'footer-inner';
  const columns = document.createElement('div');
  columns.className = 'footer-columns';
  const aside = document.createElement('div');
  aside.className = 'footer-column footer-aside';
  const bottom = document.createElement('div');
  bottom.className = 'footer-bottom';

  let shape = null;
  let brand = null;
  let legal = null;

  rows.forEach((row) => {
    const cells = [...row.children];
    const key = cells[0].textContent.trim();
    const content = cells[1] || document.createElement('div');
    switch (key.toLowerCase()) {
      case 'decoration': {
        const img = content.querySelector('img');
        if (img) shape = decorativeImage(img, 'footer-shape');
        break;
      }
      case 'locate a dealer':
        aside.append(buildDealer(key, content));
        break;
      case 'follow us':
        aside.append(buildSocial(key, content));
        break;
      case 'copyright':
        brand = buildBrand(content);
        break;
      case 'legal':
        legal = buildLegal(content);
        break;
      default:
        columns.append(buildLinkColumn(key, content));
    }
  });

  if (aside.children.length) columns.append(aside);
  if (shape) inner.append(shape);
  inner.append(columns);
  if (brand) bottom.append(brand);
  if (brand || legal) {
    const divider = document.createElement('hr');
    divider.className = 'footer-divider';
    bottom.append(divider);
  }
  if (legal) bottom.append(legal);
  if (bottom.children.length) inner.append(bottom);

  root.textContent = '';
  root.append(inner);
  setupAccordion(inner);
}

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  const footer = document.createElement('div');

  if (block.children.length) {
    // inline authored footer (drafts/test content) — no fragment round-trip
    while (block.firstElementChild) footer.append(block.firstElementChild);
  } else {
    // load footer as fragment (retained mount point — do not regress)
    const footerMeta = getMetadata('footer');
    const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
    const fragment = await loadFragment(footerPath);
    if (fragment) {
      while (fragment.firstElementChild) footer.append(fragment.firstElementChild);
    }
  }

  block.textContent = '';
  block.append(footer);

  decorateFooterContent(footer);
}
