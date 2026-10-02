// LDBG landing page. Three jobs, each small:
//  1. Build the block rows out of the game's own skin atlases, and play the
//     line clears: once in the hero, once per chapter as it is read.
//  2. Fill in the numbers from stats.json (tools/landing/build_stats.mjs), and
//     count the live tallies up the first time they are seen.
//  3. The Armoury's inventory: every item, filterable, with a look-closer card.
// The page reads as a complete, correct document without any of it.
(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Atlas cells: I J L O S T Z, then the special blocks; 10 is garbage.
  const PIECE = { I: 0, J: 1, L: 2, O: 3, S: 4, T: 5, Z: 6, GARBAGE: 10 };

  function block(index, extra) {
    const cell = document.createElement('span');
    cell.className = 'blk' + (extra ? ' ' + extra : '');
    cell.style.setProperty('--i', index);
    return cell;
  }

  // A stable scatter of piece colours, so a row looks stacked rather than striped.
  function colourAt(column, row) {
    const n = Math.imul(column + 7, 2654435761) ^ Math.imul(row + 3, 40503);
    return Math.abs(n) % 7;
  }

  // --- Hero: an I piece drops into the gap, the row clears, loot rises ------
  //
  // The rows are built wider than the card can ever be -- wider than the screen
  // in either orientation -- and the card's own overflow clips them, so the
  // ground always reaches both edges whatever the width, the text zoom or the
  // phone's rotation. A row sized to the card measured once at load stopped
  // short on an iPhone (owner, 2026-10-01). Only the gap and the falling piece
  // depend on the card's width, and they are placed again whenever it changes.

  const heroState = { played: false, built: null };

  function heroCell(stack) {
    return parseFloat(getComputedStyle(stack).getPropertyValue('--cell')) || 44;
  }

  function buildHeroStack() {
    const stack = document.querySelector('.hero-stack');
    if (!stack) return null;
    const cell = heroCell(stack);
    const widest = Math.max(window.screen.width || 0, window.screen.height || 0, window.innerWidth, 2560);
    const columns = Math.ceil(widest / cell) + 2;
    const visible = Math.max(5, Math.ceil(stack.clientWidth / cell));
    // The gap sits under the open ground between the knight and the copy.
    const gapStart = Math.min(visible - 4, Math.max(0, Math.round(visible * 0.47)));
    const top = stack.querySelector('[data-row="top"]');
    const mid = stack.querySelector('[data-row="mid"]');
    const drop = stack.querySelector('.hero-drop');
    top.replaceChildren();
    mid.replaceChildren();
    for (let column = 0; column < columns; column++) {
      const inGap = column >= gapStart && column < gapStart + 4;
      top.append(inGap ? block(0, 'gap') : block(colourAt(column, 0)));
      mid.append(column === 2 || column === visible - 3 ? block(PIECE.GARBAGE) : block(colourAt(column, 1)));
    }
    if (!drop.childElementCount) drop.append(block(PIECE.I), block(PIECE.I), block(PIECE.I), block(PIECE.I));
    drop.style.left = gapStart * cell + 'px';
    const loot = stack.querySelector('.hero-loot');
    loot.style.left = Math.max(12, (gapStart - 1) * cell) + 'px';
    heroState.built = { width: stack.clientWidth, cell };
    return { stack, top, drop, cell };
  }

  // Rebuilt when the card's width or cell size changes: a resize, a rotation,
  // a phone crossing the breakpoint where the cells shrink. A row already
  // cleared stays cleared.
  function watchHeroStack(parts) {
    if (!parts || !('ResizeObserver' in window)) return;
    new ResizeObserver(() => {
      const width = parts.stack.clientWidth;
      const cell = heroCell(parts.stack);
      if (heroState.built && heroState.built.width === width && heroState.built.cell === cell) return;
      buildHeroStack();
    }).observe(parts.stack);
  }

  // The row cleared and what stood on it came down: a class, so the drop is
  // always one CURRENT cell, however the card has changed since.
  function settleHero(stack) {
    heroState.played = true;
    stack.closest('.hero').classList.add('hero-cleared');
  }

  function playHeroClear(parts) {
    if (!parts) return;
    const { stack, top, drop } = parts;
    const scene = document.querySelector('.hero-scene');
    if (reducedMotion || !drop.animate) {
      settleHero(stack);
      return;
    }
    const fall = drop.animate(
      [{ transform: 'translateY(-640px)' }, { transform: 'translateY(0)' }],
      { duration: 420, easing: 'cubic-bezier(0.55, 0, 1, 1)', fill: 'forwards' }
    );
    fall.onfinish = () => {
      const cell = heroCell(stack);
      const flash = document.createElement('div');
      flash.style.cssText = `position:absolute;left:0;right:0;top:0;height:${cell}px;background:#fff8e6;pointer-events:none`;
      stack.append(flash);
      flash.animate([{ opacity: 0 }, { opacity: 0.95, offset: 0.25 }, { opacity: 0 }], { duration: 380, easing: 'ease-out', fill: 'forwards' })
        .onfinish = () => flash.remove();
      const collapse = [{ transform: 'scaleY(1)', opacity: 1 }, { transform: 'scaleY(0)', opacity: 0 }];
      const timing = { duration: 240, delay: 200, easing: 'ease-in', fill: 'forwards' };
      const rowGoes = top.animate(collapse, timing);
      drop.animate(collapse, timing).onfinish = () => {
        stack.classList.add('played');
        // What stood on the row comes down with it, as rows above a clear do.
        const comesDown = scene.animate(
          [{ transform: 'translateY(0)' }, { transform: `translateY(${cell}px)` }],
          { duration: 170, easing: 'cubic-bezier(0.55, 0, 1, 1)', fill: 'forwards' }
        );
        comesDown.onfinish = () => {
          settleHero(stack);
          // The class holds the result now; the animations' frozen pixel
          // values would not follow a later resize.
          for (const animation of [fall, rowGoes, comesDown]) animation.cancel();
        };
      };
    };
  }

  // --- Chapters: each clears a line when it is read -------------------------

  function buildClearRows() {
    document.querySelectorAll('.clearrow').forEach((row, chapter) => {
      const gap = 1 + (chapter * 2) % 4;
      for (let column = 0; column < 5; column++) {
        row.append(column === gap ? block(0, 'gap') : block(colourAt(column, chapter + 4)));
      }
      const drop = block(PIECE.T, 'drop');
      drop.style.gridColumn = gap + 1;
      drop.style.gridRow = 1;
      row.append(drop);
    });
    const chapters = document.querySelectorAll('.chapter');
    if (!('IntersectionObserver' in window)) {
      chapters.forEach((chapter) => chapter.classList.add('cleared'));
      return;
    }
    const watcher = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('cleared');
        watcher.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -35% 0px' });
    chapters.forEach((chapter) => watcher.observe(chapter));
  }

  // --- The Farm's board -------------------------------------------------------

  // Bottom row first. '.' is empty, '#' garbage, a letter is that piece, and a
  // row marked '*' is the one being cleared.
  const FARM_BOARD = [
    '#ZZ#T#OO##',
    'SSLLTTOOJJ',
    '*IIII.....',
    'ZZSTTTLOOJ',
    '.SSLLL.OOJ',
    '......T...',
  ];

  function buildBoard() {
    const board = document.querySelector('[data-board="farm"]');
    if (!board) return;
    const rows = FARM_BOARD.slice().reverse();
    rows.unshift('..........', '..........');
    for (const text of rows) {
      const clearing = text.startsWith('*');
      const line = clearing ? 'IIIITTTLLJ' : text;
      for (const char of line) {
        if (char === '.') board.append(block(0, 'empty'));
        else if (char === '#') board.append(block(PIECE.GARBAGE));
        else board.append(block(PIECE[char], clearing ? 'glow' : ''));
      }
    }
  }

  // --- Skins --------------------------------------------------------------------

  const SKINS = [
    ['chalk', 'Chalk', 0], ['toybox', 'Toybox', 0], ['gemstone', 'Gemstone', 10],
    ['neon', 'Neon Arcade', 20], ['stained_glass', 'Stained Glass', 30],
    ['runestone', 'Runestone', 40], ['celestial', 'Celestial', 50],
  ];

  function buildSkins() {
    const list = document.querySelector('.skin-rows');
    if (!list) return;
    for (const [id, name, level] of SKINS) {
      const item = document.createElement('li');
      const strip = document.createElement('span');
      strip.className = 'strip';
      strip.style.setProperty('--skin', `url(ui/skins/${id}.svg)`);
      for (let piece = 0; piece < 7; piece++) strip.append(block(piece));
      const label = document.createElement('span');
      label.textContent = name;
      const gate = document.createElement('span');
      gate.className = 'lvreq';
      gate.textContent = level ? `Lv ${level}` : 'Free';
      item.append(strip, label, gate);
      list.append(item);
    }
  }

  // --- Numbers ------------------------------------------------------------------

  function lookup(stats, path) {
    return path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), stats);
  }

  function withDerived(stats) {
    const content = stats.content || {};
    const live = stats.live || {};
    content.regulars = (content.enemies || 0) - (content.bosses || 0);
    // Farm Solo, Versus and Dark; Story, Endless, Co-op Endless and Dark;
    // the Garbage Man; the Arena.
    content.modes = 9;
    live.bossesSlain = Object.values(live.bossKills || {}).reduce((sum, value) => sum + value, 0);
    return stats;
  }

  const format = (value) => Math.round(value).toLocaleString('en-US');

  function countUp(element, target) {
    if (reducedMotion || target < 10) {
      element.textContent = format(target);
      return;
    }
    const started = performance.now();
    const duration = 900;
    const step = (now) => {
      const t = Math.min(1, (now - started) / duration);
      element.textContent = format(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function applyStats(stats) {
    const counted = [];
    document.querySelectorAll('[data-count]').forEach((element) => {
      const value = lookup(stats, element.dataset.count);
      if (typeof value !== 'number') return;
      element.textContent = format(value);
      // The live tallies and the big tiles count up once, when first seen:
      // they are the numbers the page wants read.
      if (element.closest('.tally, .inside')) counted.push([element, value]);
    });
    document.querySelectorAll('[data-kills]').forEach((element) => {
      const value = (stats.live && stats.live.bossKills || {})[element.dataset.kills];
      if (typeof value === 'number') element.textContent = format(value);
    });
    const readAt = stats.live && stats.live.readAt;
    const when = document.querySelector('[data-read-at]');
    if (readAt && when) {
      when.dateTime = readAt;
      when.textContent = new Date(readAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    if (!('IntersectionObserver' in window)) return;
    const watcher = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        watcher.unobserve(entry.target);
        const pair = counted.find(([element]) => element === entry.target);
        if (pair) countUp(pair[0], pair[1]);
      }
    }, { threshold: 0.6 });
    counted.forEach(([element]) => {
      element.textContent = '0';
      watcher.observe(element);
    });
  }

  function applyLevels(items) {
    const byId = new Map(items.map((item) => [item.id, item]));
    document.querySelectorAll('[data-level-of]').forEach((element) => {
      const levels = element.dataset.levelOf.split(',').map((id) => byId.get(id.trim())).filter(Boolean).map((item) => item.level);
      if (levels.length) element.textContent = `Lv ${Math.max(...levels)}`;
    });
  }

  // --- Inventory ----------------------------------------------------------------

  const TYPE_NAMES = { material: 'Material', consumable: 'Food', weapon: 'Weapon', armor: 'Armour', accessory: 'Jewellery', quest: 'Quest item' };

  function buildInventory(items) {
    const root = document.querySelector('[data-inventory]');
    if (!root) return;
    const grid = root.querySelector('.inventory-grid');
    const tip = root.querySelector('.item-tip');
    const count = root.querySelector('[data-inventory-count]');
    const tabs = root.querySelectorAll('.tab');

    function show(filter) {
      const shown = items.filter((item) => filter === 'all'
        || item.type === filter
        || (filter === 'material' && (item.type === 'consumable' || item.type === 'quest')));
      grid.replaceChildren(...shown.map((item) => {
        const slot = document.createElement('li');
        slot.className = 'slot';
        slot.tabIndex = 0;
        slot.style.setProperty('--rarity', `var(--${item.rarity})`);
        slot.dataset.id = item.id;
        const image = document.createElement('img');
        image.src = `img/items/${item.icon}`;
        image.alt = item.name;
        image.loading = 'lazy';
        image.width = 128;
        image.height = 128;
        slot.append(image);
        return slot;
      }));
      count.textContent = shown.length;
      hideTip();
    }

    function showTip(slot) {
      const item = items.find((entry) => entry.id === slot.dataset.id);
      if (!item) return;
      tip.style.setProperty('--tip-rarity', `var(--${item.rarity})`);
      tip.style.setProperty('--tip-name', item.rarity === 'common'
        ? 'var(--text)' : `color-mix(in srgb, var(--${item.rarity}) 30%, var(--text))`);
      tip.innerHTML = '';
      const name = document.createElement('b');
      name.textContent = item.name;
      const line = document.createElement('span');
      const rarity = document.createElement('span');
      rarity.className = 'rarity';
      rarity.textContent = item.rarity;
      line.append(rarity, ` ${TYPE_NAMES[item.type] || ''}`);
      tip.append(name, line);
      if (item.level > 1) tip.append(document.createElement('br'), `Wear from level ${item.level}`);
      tip.hidden = false;
      const box = root.getBoundingClientRect();
      const at = slot.getBoundingClientRect();
      let left = at.left - box.left + at.width / 2 - tip.offsetWidth / 2;
      left = Math.max(0, Math.min(left, box.width - tip.offsetWidth));
      tip.style.left = left + 'px';
      tip.style.top = (at.top - box.top - tip.offsetHeight - 8) + 'px';
    }

    function hideTip() { tip.hidden = true; }

    grid.addEventListener('mouseover', (event) => {
      const slot = event.target.closest('.slot');
      if (slot) showTip(slot);
    });
    grid.addEventListener('mouseleave', hideTip);
    grid.addEventListener('focusin', (event) => {
      const slot = event.target.closest('.slot');
      if (slot) showTip(slot);
    });
    grid.addEventListener('focusout', hideTip);
    grid.addEventListener('click', (event) => {
      const slot = event.target.closest('.slot');
      if (slot) showTip(slot);
    });
    tabs.forEach((tab) => tab.addEventListener('click', () => {
      tabs.forEach((other) => other.setAttribute('aria-selected', String(other === tab)));
      show(tab.dataset.filter);
    }));
    show('all');
  }

  // --- Start ----------------------------------------------------------------------

  const heroParts = buildHeroStack();
  watchHeroStack(heroParts);
  buildClearRows();
  buildBoard();
  buildSkins();
  // The clear is only worth watching once the two figures standing on the row
  // are drawn; the rest of the page may still be loading.
  const figures = Array.from(document.querySelectorAll('.hero-scene img'));
  const drawn = Promise.all(figures.map((image) => (image.decode ? image.decode() : Promise.resolve()).catch(() => {})));
  const patience = new Promise((resolve) => setTimeout(resolve, 2500));
  Promise.race([drawn, patience]).then(() => setTimeout(() => playHeroClear(heroParts), 450));

  fetch('stats.json', { cache: 'no-cache' })
    .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
    .then((stats) => applyStats(withDerived(stats)))
    .catch(() => { /* The numbers written into the page stand. */ });

  // Recently Added: the first four entries of news.json, newest first.
  fetch('news.json', { cache: 'no-cache' })
    .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
    .then((news) => {
      const list = document.querySelector('[data-news]');
      if (!list || !Array.isArray(news.entries)) return;
      list.replaceChildren(...news.entries.slice(0, 4).map((entry) => {
        const item = document.createElement('li');
        const when = document.createElement('time');
        when.dateTime = entry.date;
        when.textContent = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        const title = document.createElement('b');
        title.textContent = entry.title;
        item.append(when, title, ' ' + entry.text);
        return item;
      }));
    })
    .catch(() => { /* The list written into the page stands. */ });

  fetch('items.json')
    .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
    .then((items) => {
      applyLevels(items);
      buildInventory(items);
    })
    .catch(() => {
      const caption = document.querySelector('.inventory-caption');
      if (caption) caption.textContent = 'The item list could not be loaded.';
    });
})();
