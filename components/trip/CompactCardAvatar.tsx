import { styles } from './CompactTripCard.styles';
import React from 'react';
import { Image, Text, View } from 'react-native';

type Props = { name: string; uri?: string | null };

/** Initials remain behind the image while it loads, or if loading fails. */
export const CompactCardAvatar = React.memo(function CompactCardAvatar({ name, uri }: Props) {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map(part => part[0]).join('').toUpperCase() || 'ZW';
  const photoUri = uri?.trim();
  return (
    <View style={styles.avatar} accessible={false} importantForAccessibility="no-hide-descendants">
      <Text style={styles.avatarInitials}>{initials}</Text>
      {photoUri ? (
        <Image
          key={photoUri}
          source={{ uri: photoUri }}
          style={styles.avatarPhoto}
          resizeMode="cover"
          resizeMethod="resize"
          fadeDuration={0}
          accessible={false}
        />
      ) : null}
    </View>
  );
});
