// The wiki's search: one small index (media/search.json, written by
// build_wiki.mjs) matched as you type. Without JavaScript the category pages
// list everything.
(() => {
  const input = document.querySelector('.search input');
  if (!input) return;
  const list = input.parentElement.querySelector('.search-results');
  const root = input.dataset.root || './';
  let index = null;
  const load = () => (index ? Promise.resolve(index)
    : fetch(input.dataset.index).then((response) => response.json()).then((rows) => (index = rows)).catch(() => (index = [])));

  const fold = (text) => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, '');
  function matches(query) {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return index
      .map((row) => {
        const title = fold(row.title);
        if (!words.every((word) => title.includes(word) || fold(row.id).includes(word))) return null;
        const score = (title.startsWith(words[0]) ? 0 : 1) + title.length / 100;
        return { row, score };
      })
      .filter(Boolean).sort((a, b) => a.score - b.score).slice(0, 12).map((hit) => hit.row);
  }

  function render(target, rows) {
    target.innerHTML = '';
    for (const row of rows) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = root + row.url;
      link.textContent = row.title;
      const kind = document.createElement('small');
      kind.textContent = row.kind;
      link.append(kind);
      item.append(link);
      target.append(item);
    }
  }

  input.addEventListener('input', async () => {
    await load();
    const rows = matches(input.value);
    render(list, rows);
    list.hidden = rows.length === 0;
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') list.hidden = true;
  });
  input.form.addEventListener('submit', async (event) => {
    await load();
    const first = matches(input.value)[0];
    if (first) {
      event.preventDefault();
      location.href = root + first.url;
    }
  });
  document.addEventListener('click', (event) => {
    if (!input.parentElement.contains(event.target)) list.hidden = true;
  });

  const page = document.getElementById('search-page-results');
  const query = new URLSearchParams(location.search).get('q');
  if (page && query) {
    input.value = query;
    load().then(() => render(page, matches(query)));
  }

  // Sortable tables: click a heading to sort by it.
  for (const table of document.querySelectorAll('table.sortable')) {
    table.querySelectorAll('thead th').forEach((heading, column) => {
      heading.addEventListener('click', () => {
        const body = table.tBodies[0];
        const rows = [...body.rows];
        const up = heading.dataset.dir !== 'up';
        heading.dataset.dir = up ? 'up' : 'down';
        const value = (row) => {
          const cell = row.cells[column];
          const sort = cell?.dataset.sort;
          if (sort !== undefined) return Number(sort);
          const text = cell?.textContent.trim() ?? '';
          const numeric = Number(text.replace(/[^0-9.]/g, ''));
          return text && /^[0-9.,–×\s]+/.test(text) ? numeric : text.toLowerCase();
        };
        rows.sort((a, b) => {
          const x = value(a);
          const y = value(b);
          const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
          return up ? order : -order;
        });
        body.append(...rows);
      });
    });
  }
})();
