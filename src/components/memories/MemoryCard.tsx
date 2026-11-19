import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendar, faCamera } from '@fortawesome/free-solid-svg-icons';
import type { Memory } from '../../types';
import { formatDate } from '../../lib/format';
import { SignedMedia } from './SignedMedia';
import { BrandIcon } from '../common/BrandIcon';

export function MemoryCard({ memory }: { memory: Memory }) {
  const media = [...(memory.memory_media ?? [])].sort((a, b) => a.display_order - b.display_order);
  const cover = media.find((item) => item.is_cover) ?? media[0];

  return (
    <Link
      to={`/memories/${memory.id}`}
      className="group flex flex-col rounded-[1.75rem] bg-white p-3 shadow-polaroid transition duration-300 hover:-translate-y-0.5"
    >
      <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-blush">
        {cover ? (
          <SignedMedia
            path={cover.storage_path}
            mediaType={cover.media_type}
            alt={memory.title}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-cocoa">
            <FontAwesomeIcon icon={faCamera} className="text-3xl" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-start justify-between gap-2 px-1 pb-1">
        <div className="min-w-0">
          <h3 className="truncate font-heading text-lg font-semibold text-espresso">{memory.title}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-mocha">
            <FontAwesomeIcon icon={faCalendar} aria-hidden="true" />
            {formatDate(memory.memory_date)}
          </p>
        </div>
        <BrandIcon
          className={`mt-1 ${memory.is_favorite ? '' : 'opacity-40'}`}
          aria-label={memory.is_favorite ? 'Favorite' : 'Not a favorite'}
        />
      </div>
    </Link>
  );
}
