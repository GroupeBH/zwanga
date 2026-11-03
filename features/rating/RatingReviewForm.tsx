import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '@/constants/styles';
import { styles } from '../screen-styles/app/rate/detail';
import { styles as ux } from './ratingExperience.styles';

type Props = {
  rating: number; setRating: (rating: number) => void; getRatingText: () => string;
  selectedTags: string[]; toggleTag: (id: string) => void;
  rateTags: { id: string; label: string; icon: string }[];
  comment: string; setComment: (value: string) => void; disabled: boolean;
};

export function RatingReviewForm({ rating, setRating, getRatingText, selectedTags, toggleTag,
  rateTags, comment, setComment, disabled }: Props) {
  const [expanded, setExpanded] = useState(false);
  return <View>
    <Text accessibilityRole="header" style={ux.ratingTitle}>Comment s’est passé le trajet ?</Text>
    <Text style={ux.ratingHint}>Touchez une étoile pour donner une note.</Text>
    <View style={ux.stars}>
      {[1, 2, 3, 4, 5].map(star => <TouchableOpacity key={star} style={ux.star}
        accessibilityRole="radio" accessibilityLabel={`${star} sur 5`}
        accessibilityState={{ checked: rating === star, disabled }} disabled={disabled}
        onPress={() => setRating(star)}>
        <Ionicons name={star <= rating ? 'star' : 'star-outline'} size={36}
          color={star <= rating ? Colors.secondary : Colors.gray[600]} />
      </TouchableOpacity>)}
    </View>
    <Text accessibilityLiveRegion="polite" style={ux.score}>
      {rating > 0 ? `${rating}/5 · ${getRatingText()}` : 'Aucune note sélectionnée'}
    </Text>
    {rating > 0 && <>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded, disabled }} disabled={disabled}
        style={ux.detailsToggle} onPress={() => setExpanded(value => !value)}>
        <Text style={ux.detailsLabel}>Ajouter un détail (facultatif)</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.gray[700]} />
      </TouchableOpacity>
      {expanded && <>
        <View style={styles.tagsContainer}>
          <Text style={styles.tagsTitle}>Les points appréciés</Text>
          <View style={styles.tagsList}>
            {rateTags.map(tag => {
              const selected = selectedTags.includes(tag.id);
              return <TouchableOpacity key={tag.id} accessibilityRole="checkbox"
                accessibilityState={{ checked: selected, disabled }} disabled={disabled}
                style={[styles.tag, selected && styles.tagActive, { marginRight: Spacing.sm, marginBottom: Spacing.sm }]}
                onPress={() => toggleTag(tag.id)}>
                <Ionicons name={tag.icon as React.ComponentProps<typeof Ionicons>['name']} size={16}
                  color={selected ? Colors.white : Colors.gray[600]} />
                <Text style={[styles.tagText, selected && styles.tagTextActive]}>{tag.label}</Text>
              </TouchableOpacity>;
            })}
          </View>
        </View>
        <View style={styles.commentContainer}>
          <Text style={styles.commentTitle}>Votre commentaire</Text>
          <TextInput style={styles.commentInput} placeholder="Ce qui s’est bien passé ou pourrait être amélioré…"
            accessibilityLabel="Commentaire facultatif sur le trajet" placeholderTextColor={Colors.gray[600]}
            multiline textAlignVertical="top" value={comment} onChangeText={setComment} editable={!disabled} maxLength={500} />
          <Text style={styles.commentCounter}>{comment.length}/500</Text>
        </View>
      </>}
    </>}
  </View>;
}
