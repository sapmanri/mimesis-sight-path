export type BuildInfo = {
  version: string;
  number: number;
  title: string;
  subtitle: string;
};

/**
 * The single source of truth for the visible build label.
 * Future builds update this file instead of patching App.tsx.
 */
export const CURRENT_BUILD: BuildInfo = {
  version: '2.55.0',
  number: 404,
  title: 'Living Motion',
  subtitle: '발이 움직일 때만 세계를 걷습니다',
};

export const BUILD_LABEL = `v${CURRENT_BUILD.version} · BUILD ${CURRENT_BUILD.number} · ${CURRENT_BUILD.title} — ${CURRENT_BUILD.subtitle}`;
