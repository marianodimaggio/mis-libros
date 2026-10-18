import { forwardRef, useState, type ButtonHTMLAttributes } from 'react';
import { coverUrlFor } from '../lib/covers';
import { authorSurname } from '../lib/query';
import { spineLook } from '../lib/spine';
import { STATUS_LABEL, type Book } from '../lib/types';

interface SpineProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  book: Book;
  selected?: boolean;
  selectable?: boolean;
}

export const Spine = forwardRef<HTMLButtonElement, SpineProps>(function Spine({ book, selected, selectable, ...rest }, ref) {
  const look = spineLook(book);
  const titleSize = look.width < 30 ? 11 : look.width < 40 ? 12.5 : 14;
  const surname = authorSurname(book.author);
  return (
    <button
      ref={ref}
      type="button"
      data-spine={book.id}
      className="spine"
      style={{ width: look.width, height: look.height, background: look.bg, color: look.ink }}
      aria-label={`${book.title}, de ${book.author}. ${STATUS_LABEL[book.status]}${book.owned ? ', poseído' : ''}`}
      aria-pressed={selectable ? Boolean(selected) : undefined}
      {...rest}
    >
      {look.bands >= 1 && <span className="spine-band" style={{ top: 14 }} />}
      {look.bands === 2 && <span className="spine-band" style={{ bottom: 14 }} />}
      {book.status === 'reading' && <span className="spine-ribbon" />}
      <span className="spine-text" aria-hidden="true">
        <span
          className={`spine-title ${look.serif ? 'font-display font-semibold' : 'font-sans font-medium'}`}
          style={{ fontSize: look.serif ? titleSize + 1.5 : titleSize }}
        >
          {book.title}
        </span>
        {look.width >= 30 && <span className="spine-author">{surname}</span>}
      </span>
    </button>
  );
});

/** Tapa generada: mismo color que el lomo, para que el libro sea reconocible en todas las vistas. */
export function GeneratedCover({ book, size = 'lg' }: { book: Book; size?: 'sm' | 'lg' }) {
  const look = spineLook(book);
  if (size === 'sm') {
    return (
      <div className="h-full w-full rounded-[2px]" style={{ background: look.bg }} aria-hidden="true">
        <div className="h-full w-[3px] bg-black/25" />
      </div>
    );
  }
  return (
    <div
      className="relative flex h-full w-full flex-col justify-between gap-2 overflow-hidden rounded-[3px] py-4 pr-3 pl-5"
      style={{ background: look.bg, color: look.ink }}
      aria-hidden="true"
    >
      <div className="absolute inset-y-0 left-0 w-3 bg-black/25" />
      <span className="h-px w-10 bg-current opacity-40" />
      <p className="font-display line-clamp-5 text-xl leading-tight font-medium break-words">{book.title}</p>
      <p className="line-clamp-2 text-xs opacity-80">{book.author}</p>
    </div>
  );
}

interface CoverProps {
  book: Book;
  autoCovers: boolean;
  size?: 'sm' | 'lg';
  className?: string;
}

export function Cover({ book, autoCovers, size = 'lg', className = '' }: CoverProps) {
  const url = coverUrlFor(book, autoCovers);
  const [failed, setFailed] = useState<string | null>(null);
  const show = url && failed !== url;
  return (
    <div className={`overflow-hidden rounded-[3px] shadow-[0_6px_18px_rgb(0_0_0/0.35)] ${className}`}>
      {show ? (
        <img
          src={url}
          alt={size === 'lg' ? `Tapa de ${book.title}` : ''}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setFailed(url)}
        />
      ) : (
        <GeneratedCover book={book} size={size} />
      )}
    </div>
  );
}
