import { AUDIO_PLAYLIST } from '../constants/playlist';

/**
 * Validate if an audio key is in the allowed playlist
 * @param audioKey - The audio file key (e.g., "audio/guide_line.mp3")
 * @returns true if the audio key is allowed, false otherwise
 */
export function isValidAudioKey(audioKey: string): boolean {
  return AUDIO_PLAYLIST.some(track => track.audioKey === audioKey);
}

/**
 * Validate if a cover key is in the allowed playlist
 * @param coverKey - The cover image key (e.g., "cover/falling_flowers.png")
 * @returns true if the cover key is allowed, false otherwise
 */
export function isValidCoverKey(coverKey: string): boolean {
  return AUDIO_PLAYLIST.some(track => track.coverKey === coverKey);
}

/**
 * Validate multiple audio keys
 * @param audioKeys - Array of audio file keys
 * @returns Object with valid status and invalid keys if any
 */
export function validateAudioKeys(audioKeys: string[]): {
  valid: boolean;
  invalidKeys: string[];
} {
  const invalidKeys = audioKeys.filter(key => !isValidAudioKey(key));
  return {
    valid: invalidKeys.length === 0,
    invalidKeys,
  };
}

/**
 * Get all valid audio keys from the playlist
 * @returns Array of all allowed audio keys
 */
export function getAllowedAudioKeys(): string[] {
  return AUDIO_PLAYLIST.map(track => track.audioKey);
}

/**
 * Get all valid cover keys from the playlist
 * @returns Array of all allowed cover keys
 */
export function getAllowedCoverKeys(): string[] {
  return AUDIO_PLAYLIST
    .filter(track => track.coverKey)
    .map(track => track.coverKey!);
}
