import { Text, TextInput } from 'react-native';

const MAX_FONT_SIZE_MULTIPLIER = 1.15;

type ComponentWithDefaults = {
  defaultProps?: Record<string, unknown>;
};

/**
 * Keep iOS accessibility text useful without letting fixed mobile cards break
 * at the largest Dynamic Type settings.
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
