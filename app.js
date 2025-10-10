document.addEventListener('DOMContentLoaded', async () => {
  const chipCloud = document.querySelector('.chip-cloud');
  const cardList = document.querySelector('.card-list');
  const filterDialog = document.getElementById('filterDialog');
  const dialogSection = document.querySelector('.dialog__section');
  const dialogCloseBtn = filterDialog?.querySelector('.dialog__close');
  const dialogClearBtn = filterDialog?.querySelector('.dialog__footer .btn--text');
  const dialogShowSpotsBtn = filterDialog?.querySelector('.dialog__footer .btn:last-of-type');

  const res = await fetch('./data.json');
  const data = await res.json();
  const { categories, quickTagRules, places = [] } = data;
  const { pinned = [], distribution, total, fillStrategy } = quickTagRules;

  const categoryHeadings = {
    Flavor: 'What are you craving?',
    Vibe: 'What vibe or occasion are you after?',
    Drinks: 'Drinks to match?',
    Extras: 'Something extra?',
  };

  const placesWithIndex = places.map((place, index) => ({ ...place, order: index }));
  const selectedTags = new Set();
  const chipRegistry = new Map();
  const quickChipTags = new Set();
  const tagUsageCounts = new Map();

  places.forEach((place) => {
    if (!Array.isArray(place.tags)) return;
    place.tags.forEach((tag) => {
      const count = tagUsageCounts.get(tag) ?? 0;
      tagUsageCounts.set(tag, count + 1);
    });
  });

  const sortTagsForQuickList = (tags = []) => {
    const list = [...tags];
    if (fillStrategy === 'mostUsedThenAlpha') {
      return list.sort((a, b) => {
        const useDiff = (tagUsageCounts.get(b) ?? 0) - (tagUsageCounts.get(a) ?? 0);
        if (useDiff !== 0) return useDiff;
        return a.localeCompare(b, 'en', { sensitivity: 'base' });
      });
    }
    return list.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  };

  let clearFiltersBtn;

  const createSvg = (svgAttrs, pathAttrs) => {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    Object.entries(svgAttrs).forEach(([key, value]) => svg.setAttribute(key, value));
    const path = document.createElementNS(namespace, 'path');
    Object.entries(pathAttrs).forEach(([key, value]) => path.setAttribute(key, value));
    svg.appendChild(path);
    return svg;
  };

  const makeCardIcon = () =>
    createSvg(
      { class: 'card__icon', viewBox: '0 0 40 40', 'aria-hidden': 'true' },
      {
        d: 'M20 2.33301C27.1356 2.33325 34.3336 7.71347 34.334 16.666C34.334 22.8777 30.794 28.1154 27.3955 31.7266C25.684 33.5451 23.9746 34.9867 22.6943 35.9736C22.0537 36.4675 21.5174 36.8497 21.1396 37.1094C20.951 37.2391 20.801 37.3394 20.6973 37.4072C20.646 37.4408 20.6052 37.4665 20.5771 37.4844C20.5635 37.4932 20.5518 37.5009 20.5439 37.5059L20.5322 37.5137L20 36.666L20.5303 37.5146C20.2062 37.7171 19.7948 37.7169 19.4707 37.5146L20 36.666C19.5196 37.4346 19.4742 37.5071 19.4697 37.5137C19.469 37.5132 19.4669 37.5124 19.4658 37.5117C19.4635 37.5103 19.4599 37.5083 19.4561 37.5059C19.4483 37.5009 19.4377 37.4932 19.4238 37.4844C19.3957 37.4664 19.3545 37.4411 19.3027 37.4072C19.1991 37.3394 19.05 37.2391 18.8613 37.1094C18.4836 36.8497 17.9475 36.4677 17.3066 35.9736C16.0263 34.9867 14.3173 33.5454 12.6055 31.7266C9.20675 28.1154 5.66602 22.878 5.66602 16.666C5.66637 7.71341 12.8644 2.33317 20 2.33301ZM20 4.33301C13.8029 4.33317 7.66734 8.97705 7.66699 16.666C7.667 22.1206 10.7936 26.8843 14.0615 30.3564C15.6828 32.0791 17.3078 33.4496 18.5273 34.3896C19.1363 34.8591 19.6429 35.2203 19.9941 35.4619C19.996 35.4632 19.9981 35.4645 20 35.4658C20.002 35.4645 20.0048 35.4633 20.0068 35.4619C20.3582 35.2203 20.8649 34.8589 21.4736 34.3896C22.6931 33.4497 24.3175 32.0786 25.9385 30.3564C29.2063 26.8843 32.334 22.1204 32.334 16.666C32.3336 8.97712 26.1971 4.33325 20 4.33301ZM20 10.667C23.3137 10.667 26 13.3533 26 16.667C25.9998 19.9805 23.3136 22.667 20 22.667C16.6864 22.667 14.0002 19.9805 14 16.667C14 13.3533 16.6863 10.667 20 10.667ZM20 12.667C17.7909 12.667 16 14.4579 16 16.667C16.0002 18.876 17.791 20.667 20 20.667C22.209 20.667 23.9998 18.876 24 16.667C24 14.4579 22.2091 12.667 20 12.667Z',
        fill: '#D0E090',
      }
    );

  const makeLabelIcon = () =>
    createSvg(
      { class: 'label__icon', viewBox: '0 0 16 16', 'aria-hidden': 'true' },
      {
        d: 'M8.00008 2.66667C8.36827 2.66667 8.66675 2.96515 8.66675 3.33334V6.38998L10.8282 4.22852C11.0886 3.96817 11.5112 3.96817 11.7716 4.22852C12.0319 4.48887 12.0319 4.91153 11.7716 5.17188L9.61011 7.33334H12.6667C13.0349 7.33334 13.3334 7.63182 13.3334 8.00001C13.3334 8.3682 13.0349 8.66667 12.6667 8.66667H9.61011L11.7716 10.8281C12.0319 11.0885 12.0319 11.5111 11.7716 11.7715C11.5112 12.0318 11.0886 12.0318 10.8282 11.7715L8.66675 9.61003V12.6667C8.66675 13.0349 8.36827 13.3333 8.00008 13.3333C7.63189 13.3333 7.33342 13.0349 7.33342 12.6667V9.61003L5.17196 11.7715C4.91161 12.0318 4.48895 12.0318 4.2286 11.7715C3.96825 11.5111 3.96825 11.0885 4.2286 10.8281L6.39006 8.66667H3.33341C2.96522 8.66667 2.66675 8.3682 2.66675 8.00001C2.66675 7.63182 2.96522 7.33334 3.33341 7.33334H6.39006L4.2286 5.17188C3.96825 4.91153 3.96825 4.48887 4.2286 4.22852C4.48895 3.96817 4.91161 3.96817 5.17196 4.22852L7.33342 6.38998V3.33334C7.33342 2.96515 7.63189 2.66667 8.00008 2.66667Z',
        fill: '#B3D058',
      }
    );

  const makeChipIcon = () => {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    svg.setAttribute('class', 'chip__icon');
    svg.setAttribute('width', '25');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 25 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('aria-hidden', 'true');

    const rect = document.createElementNS(namespace, 'rect');
    rect.setAttribute('x', '0.5');
    rect.setAttribute('width', '24');
    rect.setAttribute('height', '24');
    rect.setAttribute('rx', '12');
    rect.setAttribute('fill', '#469D1A');

    const path = document.createElementNS(namespace, 'path');
    path.setAttribute(
      'd',
      'M15.7685 8.31738C16.1454 7.91364 16.7788 7.89175 17.1826 8.26855C17.5863 8.64538 17.6082 9.27886 17.2314 9.68262L11.6308 15.6826C11.4497 15.8766 11.1988 15.9901 10.9336 15.999C10.6681 16.0079 10.4096 15.9111 10.2158 15.7295L7.81639 13.4795C7.41353 13.1018 7.39292 12.4693 7.77049 12.0664C8.14817 11.6635 8.78065 11.6429 9.18357 12.0205L10.8525 13.584L15.7685 8.31738Z'
    );
    path.setAttribute('fill', '#FCFDF7');

    svg.append(rect, path);
    return svg;
  };

  const setChipState = (chip, isSelected) => {
    chip.classList.toggle('chip--selected', isSelected);
    chip.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    if (!chip._icon) return;
    const hasIcon = chip._icon.isConnected;
    if (isSelected && !hasIcon) {
      chip.prepend(chip._icon);
    } else if (!isSelected && hasIcon) {
      chip._icon.remove();
    }
  };

  const formatTagLabel = (value) => {
    if (typeof value !== 'string') return value;
    return value
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  const makeChip = (label) => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.type = 'button';
    chip.textContent = formatTagLabel(label);
    chip._icon = makeChipIcon();
    return chip;
  };

  const makeLabel = ({ title, description }) => {
    const label = document.createElement('span');
    label.className = 'label';
    if (description) label.title = description;
    label.appendChild(makeLabelIcon());
    label.appendChild(document.createTextNode(title));
    return label;
  };

  const makeCard = ({ name, mapsUrl, tags = [], labels = [], matchCount = 0, totalSelected = 0 }) => {
    const card = document.createElement('article');
    card.className = 'card';

  const header = document.createElement('header');
    header.className = 'card__header';

  const titleLink = document.createElement('a');
    titleLink.className = 'card__title';
    titleLink.href = mapsUrl;
    titleLink.target = '_blank';
    titleLink.rel = 'noopener';

  const icon = makeCardIcon();
    titleLink.appendChild(icon);
    titleLink.appendChild(document.createTextNode(name));

  header.appendChild(titleLink);

if (labels.length > 0) {
  header.appendChild(makeLabel(labels[0]));
}

    card.appendChild(header);

    const matchCountEl = document.createElement('span');
    matchCountEl.className = 'card__match-count';
    if (matchCount > 0 && totalSelected > 0) {
      matchCountEl.textContent = `${matchCount}/${totalSelected} matches`;
    }
    card.appendChild(matchCountEl);

    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'card__tags';

    const visibleTags = tags.slice(0, 3);
    visibleTags.forEach((tag) => {
      const tagEl = document.createElement('span');
      tagEl.className = 'card__tag';
      tagEl.textContent = formatTagLabel(tag);
      tagsWrap.appendChild(tagEl);
    });

    const extraCount = tags.length - visibleTags.length;
    if (extraCount > 0) {
      const countEl = document.createElement('span');
      countEl.className = 'tag--count';
      countEl.textContent = `+${extraCount}`;
      tagsWrap.appendChild(countEl);
    }

    card.appendChild(tagsWrap);
    return card;
  };

  const renderPlaces = () => {
    if (!cardList) return;

    const showMatches = selectedTags.size > 0;
    let results;

    if (!showMatches) {
      results = placesWithIndex.map((place) => ({ place, matchCount: 0 }));
    } else {
      results = placesWithIndex
        .map((place) => {
          const matchCount = place.tags.reduce(
            (count, tag) => count + (selectedTags.has(tag) ? 1 : 0),
            0
          );
          return { place, matchCount };
        })
        .filter(({ matchCount }) => matchCount > 0)
        .sort((a, b) => {
          if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
          return a.place.order - b.place.order;
        });
    }

    const fragment = document.createDocumentFragment();
    results.forEach(({ place, matchCount }) => {
      fragment.appendChild(
        makeCard({
          ...place,
          matchCount: showMatches ? matchCount : 0,
          totalSelected: showMatches ? selectedTags.size : 0,
        })
      );
    });

    cardList.innerHTML = '';
    cardList.appendChild(fragment);

    if (dialogShowSpotsBtn) {
      const resultsCount = results.length;
      if (showMatches) {
        const label = resultsCount === 1 ? 'Show 1 result' : `Show ${resultsCount} results`;
        dialogShowSpotsBtn.textContent = label;
      } else {
        dialogShowSpotsBtn.textContent = 'Show all spots';
      }
    }
  };

  const updateClearFiltersVisibility = () => {
    if (!clearFiltersBtn) return;
    clearFiltersBtn.style.display = selectedTags.size === 0 ? 'none' : 'block';
  };

  const openFilterDialog = () => {
    if (!filterDialog) return;
    if (typeof filterDialog.showModal === 'function') {
      filterDialog.showModal();
    } else {
      filterDialog.setAttribute('open', 'true');
    }
  };

  const closeFilterDialog = () => {
    if (!filterDialog) return;
    if (typeof filterDialog.close === 'function') {
      filterDialog.close();
    } else {
      filterDialog.removeAttribute('open');
    }
  };

  const updateChipsForTag = (tag) => {
    const chips = chipRegistry.get(tag);
    if (!chips) return;
    const isSelected = selectedTags.has(tag);
    chips.forEach((chip) => setChipState(chip, isSelected));
  };

  const clearAllFilters = () => {
    if (selectedTags.size === 0) return;
    selectedTags.clear();
    chipRegistry.forEach((chips) => {
      chips.forEach((chip) => setChipState(chip, false));
    });
    renderPlaces();
    updateClearFiltersVisibility();
  };

  const toggleTag = (tag) => {
    if (selectedTags.has(tag)) {
      selectedTags.delete(tag);
    } else {
      selectedTags.add(tag);
    }
    updateChipsForTag(tag);
    renderPlaces();
    updateClearFiltersVisibility();
  };

  const registerChip = (tag, chip) => {
    if (!chipRegistry.has(tag)) {
      chipRegistry.set(tag, new Set());
    }
    chipRegistry.get(tag).add(chip);
    chip.dataset.tag = tag;
    chip.addEventListener('click', () => toggleTag(tag));
    setChipState(chip, selectedTags.has(tag));
  };

  const renderDialogGroups = () => {
    if (!dialogSection) return;
    dialogSection.innerHTML = '';
    Object.entries(categories).forEach(([groupName, tags]) => {
      if (!Array.isArray(tags) || tags.length === 0) return;
      const group = document.createElement('div');
      group.className = 'dialog__group';

      const title = document.createElement('h3');
      title.className = 'dialog__group-title';
      title.textContent = categoryHeadings[groupName] ?? groupName;

      const chipsWrap = document.createElement('div');
      chipsWrap.className = 'dialog__chips';

      [...tags]
        .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
        .forEach((tag) => {
          const chip = makeChip(tag);
          registerChip(tag, chip);
          chipsWrap.appendChild(chip);
        });

      group.append(title, chipsWrap);
      dialogSection.appendChild(group);
    });
  };

  if (chipCloud) {
    const fragment = document.createDocumentFragment();
    const maxQuickTags = typeof total === 'number' && total > 0 ? total : Infinity;

    const addQuickChip = (tag) => {
      if (quickChipTags.has(tag)) return;
      if (quickChipTags.size >= maxQuickTags) return;
      quickChipTags.add(tag);
      const chip = makeChip(tag);
      registerChip(tag, chip);
      fragment.appendChild(chip);
    };

    for (const tag of pinned) {
      if (quickChipTags.size >= maxQuickTags) break;
      addQuickChip(tag);
    }

    for (const [group, count] of Object.entries(distribution ?? {})) {
      if (quickChipTags.size >= maxQuickTags) break;
      const list = sortTagsForQuickList(categories[group] ?? []).slice(0, count);
      for (const tag of list) {
        if (quickChipTags.size >= maxQuickTags) break;
        addQuickChip(tag);
      }
    }

    chipCloud.innerHTML = '';
    chipCloud.appendChild(fragment);

    const showFilters = document.createElement('button');
    showFilters.className = 'btn';
    showFilters.type = 'button';
    showFilters.textContent = 'Show all filters';
    if (filterDialog) {
      showFilters.addEventListener('click', () => {
        openFilterDialog();
      });
    }
    chipCloud.appendChild(showFilters);

    clearFiltersBtn = document.createElement('button');
    clearFiltersBtn.className = 'btn btn--text';
    clearFiltersBtn.type = 'button';
    clearFiltersBtn.textContent = 'Clear filters';
    clearFiltersBtn.style.display = 'none';
    clearFiltersBtn.style.margin = 'var(--space-lg) auto var(--space-xl)';
    clearFiltersBtn.addEventListener('click', clearAllFilters);
    chipCloud.insertAdjacentElement('afterend', clearFiltersBtn);
  }

  if (dialogSection) {
    renderDialogGroups();
  }

  if (dialogCloseBtn) {
    dialogCloseBtn.addEventListener('click', () => {
      closeFilterDialog();
    });
  }

  if (dialogClearBtn) {
    dialogClearBtn.addEventListener('click', () => {
      clearAllFilters();
    });
  }

  if (filterDialog) {
    filterDialog.addEventListener('click', (event) => {
      if (event.target === filterDialog) {
        closeFilterDialog();
      }
    });
  }

  if (dialogShowSpotsBtn) {
    dialogShowSpotsBtn.addEventListener('click', () => {
      closeFilterDialog();
    });
  }

  renderPlaces();
  updateClearFiltersVisibility();
});