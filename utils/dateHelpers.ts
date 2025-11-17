/**
 * Utilitaires pour gérer les dates au format ISO string
 * Dans Redux, nous stockons les dates en tant que strings ISO pour la sérialisation
 */

/**
 * Formate une date ISO en heures et minutes (HH:MM)
 * @param isoString - Date au format ISO string
 * @returns String formaté "HH:MM"
 */
export function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Formate une date ISO en date complète (JJ/MM/AAAA)
 * @param isoString - Date au format ISO string
 * @returns String formaté "JJ/MM/AAAA"
 */
export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Formate une date ISO en date et heure (JJ/MM/AAAA HH:MM)
 * @param isoString - Date au format ISO string
 * @returns String formaté "JJ/MM/AAAA HH:MM"
 */
export function formatDateTime(isoString: string): string {
  return `${formatDate(isoString)} ${formatTime(isoString)}`;
}

/**
 * Retourne une date relative (ex: "Il y a 5 minutes", "Dans 2 heures")
 * @param isoString - Date au format ISO string
 * @returns String formaté relatif
 */
export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 0) {
    // Dans le passé
    const absDiffMinutes = Math.abs(diffMinutes);
    if (absDiffMinutes < 1) {
      return 'À l\'instant';
    } else if (absDiffMinutes < 60) {
      return `Il y a ${absDiffMinutes} minute${absDiffMinutes > 1 ? 's' : ''}`;
    } else if (absDiffMinutes < 1440) {
      const hours = Math.floor(absDiffMinutes / 60);
      return `Il y a ${hours} heure${hours > 1 ? 's' : ''}`;
    } else {
      const days = Math.floor(absDiffMinutes / 1440);
      return `Il y a ${days} jour${days > 1 ? 's' : ''}`;
    }
  } else {
    // Dans le futur
    if (diffMinutes < 1) {
      return 'Maintenant';
    } else if (diffMinutes < 60) {
      return `Dans ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
    } else if (diffMinutes < 1440) {
      const hours = Math.floor(diffMinutes / 60);
      return `Dans ${hours} heure${hours > 1 ? 's' : ''}`;
    } else {
      const days = Math.floor(diffMinutes / 1440);
      return `Dans ${days} jour${days > 1 ? 's' : ''}`;
    }
  }
}

/**
 * Calcule la durée entre deux dates ISO
 * @param startIsoString - Date de début
 * @param endIsoString - Date de fin
 * @returns String formaté "Xh Ymin"
 */
export function formatDuration(startIsoString: string, endIsoString: string): string {
  const start = new Date(startIsoString);
  const end = new Date(endIsoString);
  const diffMs = end.getTime() - start.getTime();
  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}min`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${minutes}min`;
  }
}

/**
 * Convertit une date ISO en objet Date
 * @param isoString - Date au format ISO string
 * @returns Objet Date
 */
export function parseISODate(isoString: string): Date {
  return new Date(isoString);
}

/**
 * Vérifie si une date est aujourd'hui
 * @param isoString - Date au format ISO string
 * @returns true si c'est aujourd'hui
 */
export function isToday(isoString: string): boolean {
  const date = new Date(isoString);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

/**
 * Vérifie si une date est dans le passé
 * @param isoString - Date au format ISO string
 * @returns true si c'est dans le passé
 */
export function isPast(isoString: string): boolean {
  const date = new Date(isoString);
  return date.getTime() < Date.now();
}

/**
 * Vérifie si une date est dans le futur
 * @param isoString - Date au format ISO string
 * @returns true si c'est dans le futur
 */
export function isFuture(isoString: string): boolean {
  const date = new Date(isoString);
  return date.getTime() > Date.now();
}

