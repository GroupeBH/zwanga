import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import { versionParts, type InstalledApp } from './updatePolicy';

/** Read the installed binary, never the newer OTA manifest's version. No new native dependency. */
export function readInstalledApp(): InstalledApp | null {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  try {
    const native = requireOptionalNativeModule<{
      applicationId?: string; nativeApplicationVersion?: string; nativeBuildVersion?: string;
    }>('ExpoApplication');
    if (native?.applicationId !== (Platform.OS === 'ios' ? 'com.biso.zwanga' : 'com.zwanga') || !versionParts(native.nativeApplicationVersion) || !versionParts(native.nativeBuildVersion)) return null;
    return { platform: Platform.OS, version: native.nativeApplicationVersion!, build: native.nativeBuildVersion! };
  } catch { return null; }
}
