import { Colors } from '@/constants/styles';
import { styles } from '@/features/profile/ProfileMenu.styles';
import type { useProfileController } from '@/hooks/profile/useProfileController';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Text,
  TouchableOpacity,
  View
} from 'react-native';

type Props = Pick<ReturnType<typeof useProfileController>,
  | 'menuItems'
  | 'router'
>;

export function ProfileMenu({
  menuItems,
  router,
}: Props) {
  return (<View style={styles.menuContainer}>
    <View style={styles.menuCard}>
      {menuItems.map((item, index) => (
        <TouchableOpacity
          key={index}
          style={[styles.menuItem, index !== menuItems.length - 1 && styles.menuItemBorder]}
          onPress={() => {
            if ((item as any).onPress) {
              (item as any).onPress();
            } else if (item.route) {
              router.push(item.route as any);
            }
          }}
        >
          <View style={styles.menuIcon}>
            <Ionicons name={item.icon as any} size={20} color={Colors.gray[600]} />
          </View>
          <Text style={styles.menuText}>{item.label}</Text>
          <View style={styles.menuRight}>
            {(item as any).badge !== undefined && (item as any).badge > 0 && (
              <View
                style={[
                  styles.menuBadge,
                  {
                    backgroundColor: (item as any).badgeColor || Colors.primary,
                  },
                ]}
              >
                <Text style={styles.menuBadgeText}>{(item as any).badge}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
          </View>
        </TouchableOpacity>
      ))}
    </View>
  </View>);
}
