import { FormModal as Modal } from '@/components/forms/FormLayout';
import { TICKET_CATEGORIES, TICKET_CATEGORY_LABELS } from '@/components/support/supportData';
import { styles } from '@/components/support/supportStyles';
import { Colors } from '@/constants/styles';
import type { SupportTicketCategory } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface SupportTicketModalProps {
  showTicketModal: boolean;
  handleCloseTicketModal: () => void;
  ticketSubject: string;
  setTicketSubject: React.Dispatch<React.SetStateAction<string>>;
  ticketCategory: SupportTicketCategory;
  setTicketCategory: React.Dispatch<React.SetStateAction<SupportTicketCategory>>;
  ticketMessage: string;
  setTicketMessage: React.Dispatch<React.SetStateAction<string>>;
  isCreatingTicket: boolean;
  handleSubmitTicket: () => Promise<void>;
}

export function SupportTicketModal({
  showTicketModal,
  handleCloseTicketModal,
  ticketSubject,
  setTicketSubject,
  ticketCategory,
  setTicketCategory,
  ticketMessage,
  setTicketMessage,
  isCreatingTicket,
  handleSubmitTicket,
}: SupportTicketModalProps) {
  return (
    <Modal
      visible={showTicketModal}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleCloseTicketModal}
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={handleCloseTicketModal}>
            <Ionicons name="close" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Créer un ticket</Text>
          <View style={styles.modalSpacer} />
        </View>

        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Expliquez simplement votre besoin</Text>
            <Text style={styles.formSubtitle}>
              Quelques mots suffisent. Nous utiliserons votre message pour vous répondre plus vite.
            </Text>

            <View style={styles.formSection}>
              <Text style={styles.inputLabel}>Sujet</Text>
              <TextInput
                style={styles.textInput}
                value={ticketSubject}
                onChangeText={setTicketSubject}
                placeholder="Ex : mon paiement n'apparaît pas"
                placeholderTextColor={Colors.gray[400]}
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.inputLabel}>Type de problème</Text>
              <View style={styles.typeGrid}>
                {TICKET_CATEGORIES.map((category) => {
                  const isSelected = ticketCategory === category;

                  return (
                    <TouchableOpacity
                      key={category}
                      style={[styles.typeChip, isSelected && styles.typeChipActive]}
                      onPress={() => setTicketCategory(category)}
                    >
                      <Text
                        style={[
                          styles.typeChipText,
                          isSelected && styles.typeChipTextActive,
                        ]}
                      >
                        {TICKET_CATEGORY_LABELS[category]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.inputLabel}>Votre message</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={ticketMessage}
                onChangeText={setTicketMessage}
                placeholder="Décrivez ce qui se passe, quand cela arrive et ce que vous avez déjà essayé."
                placeholderTextColor={Colors.gray[400]}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
            </View>

            <TouchableOpacity
              style={[
                styles.submitButton,
                (isCreatingTicket || !ticketSubject.trim() || !ticketMessage.trim()) &&
                  styles.submitButtonDisabled,
              ]}
              disabled={isCreatingTicket || !ticketSubject.trim() || !ticketMessage.trim()}
              onPress={handleSubmitTicket}
            >
              {isCreatingTicket ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <>
                  <Text style={styles.submitButtonText}>Envoyer ma demande</Text>
                  <Ionicons name="send" size={18} color={Colors.white} />
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
