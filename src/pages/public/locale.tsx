import { createContext, useContext, useEffect, useMemo, type ComponentProps, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { COPY, type Locale, type PublicCopy } from '@/pages/public/copy';

const LocaleContext = createContext<{ locale: Locale; path: string }>({ locale: 'zh', path: '/' });

export function parseLocale(pathname: string): { locale: Locale; path: string } {
  const match = pathname.match(/^\/(en|ja)(?=\/|$)/);
  if (!match) return { locale: 'zh', path: pathname || '/' };
  const rest = pathname.slice(match[0].length);
  return { locale: match[1] as Locale, path: rest || '/' };
}

export function withLocale(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (locale === 'zh') return clean;
  if (clean === '/') return `/${locale}`;
  return `/${locale}${clean}`;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { locale, path } = parseLocale(pathname);
  const value = useMemo(() => ({ locale, path }), [locale, path]);

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-Hant' : locale;
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function useCopy(): PublicCopy {
  return COPY[useLocale().locale];
}

export function useLocalPath() {
  const { locale } = useLocale();
  return (to: string) => withLocale(locale, to);
}

export function LocalLink({ to, ...rest }: { to: string } & Omit<ComponentProps<typeof Link>, 'to'>) {
  const href = useLocalPath();
  return <Link to={href(to)} {...rest} />;
}

const NUMBER_LOCALE: Record<Locale, string> = { zh: 'zh-TW', en: 'en-US', ja: 'ja-JP' };

export function useFormat() {
  const { locale } = useLocale();
  const tag = NUMBER_LOCALE[locale];
  return {
    locale,
    n(value: number) {
      return Math.round(value).toLocaleString(tag);
    },
    compact(value: number) {
      const n = Math.round(value);
      if (locale === 'en') {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
        if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k`;
        return String(n);
      }
      const man = locale === 'ja' ? '万' : '萬';
      if (n >= 10_000) {
        const v = n / 10_000;
        return `${v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}${man}`;
      }
      if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}千`;
      return String(n);
    },
    ym(iso: string) {
      return new Intl.DateTimeFormat(tag, { timeZone: 'Asia/Taipei', year: 'numeric', month: 'long' }).format(new Date(iso));
    },
    stamp(iso: string) {
      return new Intl.DateTimeFormat(tag, {
        timeZone: 'Asia/Taipei',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(iso));
    },
    when(iso: string) {
      return new Date(iso).toLocaleString(tag, {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    },
  };
}

export function taipeiMonth(date?: string): number {
  if (date && date.length >= 7) {
    const month = Number(date.slice(5, 7));
    if (month >= 1 && month <= 12) return month;
  }
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', month: 'numeric' }).format(new Date()));
}

const LANGS: { id: Locale; label: string }[] = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'EN' },
  { id: 'ja', label: '日本語' },
];

export function LanguageSwitch() {
  const { locale, path } = useLocale();
  const copy = useCopy();
  const navigate = useNavigate();
  const { search, hash } = useLocation();

  return (
    <div className="lp-lang" role="group" aria-label={copy.langGroup}>
      {LANGS.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={locale === item.id}
          onClick={() => {
            if (item.id === locale) return;
            const target = path === '/' ? '/welcome' : path;
            navigate(`${withLocale(item.id, target)}${search}${hash}`);
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
