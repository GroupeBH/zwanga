import { styles } from '../screen-styles/app/trip/detail/index';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Modal, TouchableOpacity, View } from 'react-native';

interface TripImageModalProps {
  imageModalVisible: boolean;
  setImageModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  selectedImageUri: string | null;
}

export function TripImageModal({
  imageModalVisible,
  setImageModalVisible,
  selectedImageUri,
}: TripImageModalProps) {
  return (
    <Modal
      visible={imageModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setImageModalVisible(false)}
    >
      <View style={styles.imageModalOverlay}>
        <TouchableOpacity
          style={styles.imageModalCloseButton}
          onPress={() => setImageModalVisible(false)}
        >
          <Ionicons name="close" size={32} color={Colors.white} />
        </TouchableOpacity>
        {selectedImageUri && (
          <Image
            source={{ uri: selectedImageUri }}
            style={styles.imageModalImage}
            resizeMode="contain"
          />
        )}
      </View>
    </Modal>
  );
}
