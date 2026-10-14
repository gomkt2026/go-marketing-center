import type { Locale } from '@/pages/public/copy';
import { en } from './en';
import { ja } from './ja';
import type { BriefingCopy } from './types';
import { zh } from './zh';

export type { BriefingCopy, SlideCopy } from './types';

export const BRIEFING_COPY: Record<Locale, BriefingCopy> = { zh, en, ja };
