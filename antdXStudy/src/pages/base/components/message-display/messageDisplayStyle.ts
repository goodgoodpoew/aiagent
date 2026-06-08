import { theme } from 'antd';
import type { CSSProperties } from 'react';

type MessageDisplayStyle = CSSProperties & Record<`--${string}`, string | number>;

export function useMessageDisplayStyle(): MessageDisplayStyle {
  const { token } = theme.useToken();

  return {
    '--ai-message-display-gap': `${token.marginXS}px`,
    '--ai-message-display-inline-gap': `${token.marginXXS}px`,
    '--ai-message-display-border': token.colorBorderSecondary,
    '--ai-message-display-fill': token.colorFillTertiary,
    '--ai-message-display-text-secondary': token.colorTextSecondary,
    '--ai-message-display-radius': `${token.borderRadiusSM}px`,
    '--ai-message-display-font-size-sm': `${token.fontSizeSM}px`,
    '--ai-message-display-padding-x': `${token.paddingXXS}px`,
    '--ai-message-display-padding-y': `${token.paddingXXS / 2}px`,
  };
}
