export const appAccentThemeOptions = [
  { value: 'blue_gray', label: '蓝灰' },
  { value: 'teal', label: '青绿' },
  { value: 'violet', label: '紫罗兰' },
  { value: 'rose', label: '玫瑰' },
  { value: 'amber', label: '琥珀' },
  { value: 'forest', label: '森林' },
] as const

export type AppAccentTheme = (typeof appAccentThemeOptions)[number]['value']

export function normalizeAppAccentTheme(value: unknown): AppAccentTheme {
  return appAccentThemeOptions.some((theme) => theme.value === value)
    ? (value as AppAccentTheme)
    : 'blue_gray'
}
