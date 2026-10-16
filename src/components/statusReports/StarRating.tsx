import React from 'react';
import { Star } from 'lucide-react';
import clsx from 'clsx';

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: 'sm' | 'md';
  readOnly?: boolean;
}

/** Reusable 1-5 star rating. Read-only display or interactive input depending on onChange. */
export default function StarRating({ value, onChange, size = 'sm', readOnly = false }: StarRatingProps) {
  const starSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const interactive = !readOnly && !!onChange;

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          onClick={() => onChange && onChange(star)}
          className={clsx(interactive && 'cursor-pointer hover:scale-110 transition-transform', !interactive && 'cursor-default')}
        >
          <Star
            className={clsx(starSize, star <= value ? 'fill-[#ff7f00] text-[#ff7f00]' : 'fill-transparent text-gray-300')}
          />
        </button>
      ))}
    </div>
  );
}
