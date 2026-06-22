import type { CSSProperties } from 'react'
import {
  blockBackgroundColorValues,
  textColorValues,
} from '../../domain/colors'
import type { TextBlockStyle } from '../../domain/types'

export { blockBackgroundColorValues, textColorValues }

export function getTextInputStyle(textStyle: TextBlockStyle): CSSProperties | undefined {
  const style: CSSProperties = {}

  if (textStyle.textColor) {
    style.color = textColorValues[textStyle.textColor]
  }

  if (textStyle.textAlign) {
    style.textAlign = textStyle.textAlign
  }

  return Object.keys(style).length > 0 ? style : undefined
}

export function getTextBackgroundStyle(textStyle: TextBlockStyle): CSSProperties | undefined {
  if (!textStyle.backgroundColor) {
    return undefined
  }

  return {
    backgroundColor: blockBackgroundColorValues[textStyle.backgroundColor],
  }
}
