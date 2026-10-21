/** Shared colors for the two Home reference layouts. */
// Option A, slightly darker than #D9480F so white button labels exceed 4.5:1.
import { ACTION_COLORS } from '@/constants/actionColors';
const ACTION_ORANGE = ACTION_COLORS.orange;

export const HOME_DASHBOARD_COLORS = {
  ink: '#201D1A', muted: '#625D58', rust: ACTION_ORANGE, orange: ACTION_ORANGE,
  green: ACTION_COLORS.green, greenInk: '#2F6B4F', paleGreen: '#E7F5ED',
  blue: ACTION_COLORS.blue, line: '#E7E1DB', warm: '#FFFBF7', pale: '#F3F0EB', price: '#FFEDD5',
  positionOrange: '#FF6B35',
};
