/**
 * Whether to offer features meant only for development: the lighting debug style and the
 * styles' own options. True under the Vite dev server (and in tests), false in the built site.
 */
export const devFeatures: boolean = import.meta.env.DEV;
