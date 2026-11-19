import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faList,
  faMagnifyingGlass,
  faPlus,
  faTableCellsLarge,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { useRelationship } from '../../hooks/useRelationship';
import { listMemories, PAGE_SIZE } from '../../services/memories';
import { MemoryCard } from '../../components/memories/MemoryCard';
import { MEMORY_CATEGORIES } from '../../types';
import { errorMessage } from '../../lib/format';
import { BrandIcon } from '../../components/common/BrandIcon';

type SortOrder = 'newest' | 'oldest';
type ViewMode = 'grid' | 'list';

export default function MemoriesPage() {
  const { data: relationship } = useRelationship();
  const relationshipId = relationship?.id ?? '';

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<SortOrder>('newest');
  const [view, setView] = useState<ViewMode>('grid');

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const clearSearch = () => {
    setSearchInput('');
    setSearch('');
  };

  const query = useInfiniteQuery({
    queryKey: ['memories', relationshipId, { search, category, favoritesOnly, sort }],
    enabled: !!relationshipId,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      listMemories({
        relationshipId,
        page: pageParam,
        sort,
        search: search || undefined,
        category: category || undefined,
        favoritesOnly,
      }),
    getNextPageParam: (lastPage, allPages) => (lastPage.length === PAGE_SIZE ? allPages.length : undefined),
    // Keep the current results on screen while a new filter loads, instead of flashing empty.
    placeholderData: (previous) => previous,
  });

  const memories = query.data?.pages.flat() ?? [];
  const filtersActive = !!search || !!category || favoritesOnly;

  return (
    <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-semibold sm:text-4xl">Our Memories</h1>
          <p className="mt-1 flex items-center gap-2 text-mocha">
            All the little moments, in one place <BrandIcon className="text-sm text-rose" />
          </p>
        </div>

        <div className="flex w-full items-center gap-3 md:w-auto">
          <div className="relative min-w-0 flex-1 md:w-72 md:flex-none">
            <label htmlFor="memory-search" className="sr-only">Search memories</label>
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cocoa"
            />
            <input
              id="memory-search"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder="Search memories…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') clearSearch();
              }}
              className="input h-11 rounded-full py-0 pl-11 pr-11 [appearance:none] [&::-webkit-search-cancel-button]:hidden"
            />
            {searchInput && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={clearSearch}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-mocha transition hover:bg-blush/60"
              >
                <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="flex shrink-0 rounded-full bg-white p-1 shadow-sm" role="group" aria-label="View">
            <button
              type="button"
              aria-pressed={view === 'grid'}
              aria-label="Grid view"
              onClick={() => setView('grid')}
              className={`flex h-9 w-9 items-center justify-center rounded-full ${view === 'grid' ? 'bg-mocha text-white' : 'text-mocha'}`}
            >
              <FontAwesomeIcon icon={faTableCellsLarge} />
            </button>
            <button
              type="button"
              aria-pressed={view === 'list'}
              aria-label="List view"
              onClick={() => setView('list')}
              className={`flex h-9 w-9 items-center justify-center rounded-full ${view === 'list' ? 'bg-mocha text-white' : 'text-mocha'}`}
            >
              <FontAwesomeIcon icon={faList} />
            </button>
          </div>
        </div>
      </header>

      <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible" role="group" aria-label="Filter memories">
        <button type="button" className={`chip ${!category && !favoritesOnly ? 'chip-active' : ''}`} onClick={() => { setCategory(''); setFavoritesOnly(false); }}>
          All
        </button>
        <button type="button" aria-pressed={favoritesOnly} className={`chip ${favoritesOnly ? 'chip-active' : ''}`} onClick={() => setFavoritesOnly((v) => !v)}>
          <BrandIcon light={favoritesOnly} /> Favorites
        </button>
        {MEMORY_CATEGORIES.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={category === item}
            className={`chip ${category === item ? 'chip-active' : ''}`}
            onClick={() => setCategory(category === item ? '' : item)}
          >
            {item}
          </button>
        ))}
        <label htmlFor="sort" className="sr-only">Sort order</label>
        <select
          id="sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOrder)}
          className="chip ml-auto appearance-none pr-4"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {query.error && <p role="alert" className="text-sm text-espresso">{errorMessage(query.error)}</p>}

      {query.isLoading && <p className="handwritten animate-pulse text-2xl text-mocha">Gathering your memories…</p>}

      {!query.isLoading && memories.length === 0 && (
        <div className="card border border-dashed border-cocoa/40 p-12 text-center">
          <p className="font-heading text-2xl">
            {filtersActive ? 'Nothing matches those filters.' : 'No memories here yet.'}
          </p>
          <p className="mt-2 text-mocha">
            {filtersActive ? 'Try a different search or clear a filter.' : 'Start collecting your favorite moments together.'}
          </p>
          {!filtersActive && (
            <Link to="/memories/new" className="btn-primary mt-6">
              <FontAwesomeIcon icon={faPlus} /> Add a memory
            </Link>
          )}
        </div>
      )}

      {memories.length > 0 && (
        <div className={view === 'grid' ? 'grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4' : 'flex flex-col gap-4'}>
          {memories.map((memory) => (
            <MemoryCard key={memory.id} memory={memory} />
          ))}
        </div>
      )}

      {query.hasNextPage && (
        <div className="flex justify-center">
          <button type="button" className="btn-ghost" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? 'Loading…' : 'Show more memories'}
          </button>
        </div>
      )}
    </div>
  );
}