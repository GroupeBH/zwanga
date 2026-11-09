import { useState } from 'react';
import { Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native';
import { requestTotalInputHint, requestTotalPrice, requestUnitPriceInput } from '@/features/trip-request/requestPriceDisplay';

/** UI-only adapter: input is a total, the unchanged parent/controller stores a unit price. */
export function RequestTotalBudgetInput({ pricePerSeat, seats, onChangePricePerSeat, style, hintStyle }: {
  pricePerSeat: string; seats: number; onChangePricePerSeat: (value: string) => void;
  style?: StyleProp<TextStyle>; hintStyle?: StyleProp<TextStyle>;
}) {
  const [draft, setDraft] = useState<{ unit: string; seats: number; text: string } | null>(null);
  const value = draft?.unit === pricePerSeat && draft.seats === seats ? draft.text
    : String(requestTotalPrice(pricePerSeat, seats) ?? '');
  const hint = requestTotalInputHint(value, seats);
  return <View>
    <TextInput style={style} keyboardType="decimal-pad" placeholder="Prix total en FC"
      accessibilityLabel="Prix total du trajet en francs congolais" value={value} maxLength={13}
      onChangeText={text => {
        const normalized = text.replace(',', '.');
        const unit = requestUnitPriceInput(normalized, seats);
        setDraft({ unit, seats, text: normalized });
        onChangePricePerSeat(unit);
      }} />
    {!!hint && <Text style={hintStyle} accessibilityLiveRegion="polite">{hint}</Text>}
  </View>;
}
