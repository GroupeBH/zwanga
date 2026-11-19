import { Text, TextInput } from 'react-native';

const MAX_FONT_SIZE_MULTIPLIER = 2;

type ComponentWithDefaults = {
  defaultProps?: Record<string, unknown>;
};

/**
 * Support text up to 200%. Compact layouts must wrap/scroll instead of shrinking
 * essential copy. Only decorative badges and tab labels have local limits.
 */
export function configureFontScaling() {
  const textComponent = Text as unknown as ComponentWithDefaults;
  const inputComponent = TextInput as unknown as ComponentWithDefaults;

  textComponent.defaultProps = {
    ...textComponent.defaultProps,
    maxFontSizeMultiplier: MAX_FONT_SIZE_MULTIPLIER,
  };
  inputComponent.defaultProps = {
    ...inputComponent.defaultProps,
    maxFontSizeMultiplier: MAX_FONT_SIZE_MULTIPLIER,
  };
}
