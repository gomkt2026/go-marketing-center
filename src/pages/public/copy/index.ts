import { en } from './en';
import { ja } from './ja';
import { zh, type PublicCopy } from './zh';

export type { PublicCopy };
export type Locale = 'zh' | 'en' | 'ja';

export const COPY: Record<Locale, PublicCopy> = { zh, en, ja };
