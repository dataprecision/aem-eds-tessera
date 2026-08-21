/*
 * product-offer — three-part product row:
 *   [media column]  [content column + CTA]  [offer column + blinking line + CTA]
 *
 * Authoring shapes accepted (defensive per AGENTS.md):
 *   - one row with three cells   (canonical, matches columns/ authoring)
 *   - three rows with one cell   (contentModelShape rows: image / content / offer)
 * Both are normalised to three sibling columns directly under the block, so the
 * width/divider CSS keys off role classes rather than :nth-child.
 *
 * Conflict resolved: contentModelShape describes three rows, spec.domSlice shows
 * one row of three columns — domSlice wins on facts, the row form is tolerated.
 */

/**
 * @shared-candidate isExternalHref — origin comparison for an anchor, safe on
 * relative/hash/mailto hrefs; every block that decorates author links needs it.
 */
function isExternalHref(anchor) {
  try {
    const url = new URL(anchor.getAttribute('href'), window.location.href);
    return url.protocol.startsWith('http') && url.origin !== window.location.origin;
  } catch (e) {
    return false;
  }
}

/* A column that holds imagery and nothing else is the media column. */
function isMediaColumn(col) {
  return !!col.querySelector('picture, img') && !col.textContent.trim();
}

/* Flatten whichever authoring shape arrived into a flat list of column cells. */
function collectColumns(block) {
  const rows = [...block.children];
  if (rows.length === 1) return [...rows[0].children];
  return rows.flatMap((row) => [...row.children]);
}

/* Measured: the product image is never a link and has no hover affordance. */
function unwrapMediaLink(col) {
  col.querySelectorAll('a').forEach((a) => {
    if (a.querySelector('picture, img')) a.replaceWith(...a.childNodes);
  });
}

function decorateCtas(col) {
  col.querySelectorAll('a[href]').forEach((a) => {
    a.classList.add('button', 'accent');
    const p = a.closest('p');
    if (p && p.textContent.trim() === a.textContent.trim()) {
      p.classList.add('button-wrapper');
    }
    // Fix per page-wide policy: new-tab links always carry rel="noopener noreferrer".
    if (isExternalHref(a)) a.setAttribute('target', '_blank');
    if (a.getAttribute('target') === '_blank') a.setAttribute('rel', 'noopener noreferrer');
    // Measured: the source markup carries target="" on the same-tab CTA — drop the empty attr.
    if (a.getAttribute('target') === '') a.removeAttribute('target');
  });
}

/*
 * Offer line convention: inside the offer column, the last paragraph that is not
 * a CTA is the blinking offer line. It stays plain text — never a link (measured:
 * no href, no onclick, cursor:auto, reveals nothing on click).
 */
function decorateOfferLine(col) {
  const line = [...col.querySelectorAll(':scope > p')]
    .filter((p) => !p.querySelector('a[href]'))
    .pop();
  if (line) line.classList.add('product-offer-line');
}

export default function decorate(block) {
  const columns = collectColumns(block).filter((col) => col.nodeType === 1);
  if (!columns.length) return;
  block.replaceChildren(...columns);

  const media = columns.find(isMediaColumn);
  const [content, offer] = columns.filter((col) => col !== media);

  if (media) {
    media.classList.add('product-offer-media');
    unwrapMediaLink(media);
  }
  if (content) {
    content.classList.add('product-offer-content');
    decorateCtas(content);
  }
  if (offer) {
    offer.classList.add('product-offer-offer');
    decorateOfferLine(offer);
    decorateCtas(offer);
  }

  // Columns beyond the third (author added a cell) still render as plain columns.
  columns
    .filter((col) => ![media, content, offer].includes(col))
    .forEach((col) => col.classList.add('product-offer-extra'));
}
