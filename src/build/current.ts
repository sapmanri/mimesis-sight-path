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
  version: '2.54.0',
  number: 403,
  title: 'Becoming Byeoli',
  subtitle: '별이는 조금씩 별이가 되어갑니다',
};

export const BUILD_LABEL = `v${CURRENT_BUILD.version} · BUILD ${CURRENT_BUILD.number} · ${CURRENT_BUILD.title} — ${CURRENT_BUILD.subtitle}`;
