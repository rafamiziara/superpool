/**
 * "Abyss & Aurora" palette — keep in sync with global.css @theme.
 * Used for props that need raw color values (icons, navigation sceneStyle,
 * dynamic progress bars) where Tailwind classNames don't apply.
 */
export const palette = {
  abyss: '#060b16',
  surface: '#0c1526',
  raised: '#142138',
  veil: '#1c2b45',
  snow: '#f2f6fc',
  fog: '#94a6c4',
  mist: '#5c6e8c',
  mint: '#4ae3b5',
  mintDeep: '#0e3b31',
  amber: '#f7bb64',
  amberDeep: '#3d2c12',
  coral: '#ff7a7a',
  coralDeep: '#3d1a1e',
  iris: '#8b9dff',
  irisDeep: '#1e2547',
} as const
