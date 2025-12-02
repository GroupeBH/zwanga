# Google Play Store - ACTIVITY_RECOGNITION Permission Declaration

## Recommended Response

**If your app does NOT use ACTIVITY_RECOGNITION permission:**

```
Our app does not use the android.permission.ACTIVITY_RECOGNITION permission. 
We do not detect or track user physical activities such as walking, running, 
cycling, or vehicle movement. 

The app uses the Accelerometer sensor (via expo-sensors) solely for device 
stability detection during the KYC (Know Your Customer) identity verification 
process. This sensor data is used locally on the device to determine when the 
camera is stable enough to automatically capture clear photos of identity 
documents. The accelerometer data is not stored, transmitted, or used for any 
activity recognition purposes.

If this permission appears in your app's manifest, it may be due to a 
dependency. Please ensure it is removed from your AndroidManifest.xml file.
```

---

## If You Need to Remove the Permission

If `ACTIVITY_RECOGNITION` is being added by a dependency and you don't need it:

1. **Check your AndroidManifest.xml** (after building):
   ```xml
   <!-- Remove this if present -->
   <uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />
   ```

2. **In Expo/React Native**, you can explicitly exclude it in `app.config.js`:
   ```javascript
   android: {
     permissions: [
       // List only the permissions you actually need
       "CAMERA",
       "READ_EXTERNAL_STORAGE",
       "WRITE_EXTERNAL_STORAGE",
       "ACCESS_FINE_LOCATION",
       "ACCESS_COARSE_LOCATION",
       "POST_NOTIFICATIONS",
       // Do NOT include ACTIVITY_RECOGNITION
     ],
   }
   ```

3. **Or use `blockedPermissions`** to explicitly block it:
   ```javascript
   android: {
     blockedPermissions: [
       "android.permission.ACTIVITY_RECOGNITION"
     ],
   }
   ```

---

## Current App Sensor Usage

### What the app actually uses:

1. **Accelerometer** (via `expo-sensors`)
   - **Purpose**: Detect device stability during KYC document capture
   - **Location**: `components/KycWizardModal.tsx`
   - **Usage**: Local processing only, no data stored or transmitted
   - **Permission**: No special permission required (Accelerometer is not a protected permission)

2. **Location Services** (via `expo-location`)
   - **Purpose**: Find nearby trips, track user location for ride-sharing
   - **Permission**: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`

3. **Camera** (via `expo-camera`)
   - **Purpose**: Capture KYC documents and profile pictures
   - **Permission**: `CAMERA`

### What the app does NOT use:

- ❌ Activity Recognition (walking, running, cycling detection)
- ❌ Step counting
- ❌ Physical activity tracking
- ❌ Motion-based activity classification

---

## Technical Details

### Accelerometer vs Activity Recognition

- **Accelerometer**: Measures device acceleration in 3 axes (x, y, z). Used for device orientation, shake detection, stability detection. **No permission required.**

- **Activity Recognition**: Uses machine learning to classify user activities (walking, running, in vehicle, etc.). **Requires `ACTIVITY_RECOGNITION` permission.**

Your app uses the Accelerometer for device stability detection, which is fundamentally different from Activity Recognition.

---

## For Google Play Console

When filling out the permission declaration form:

1. **Question**: "Does your app use ACTIVITY_RECOGNITION?"
   - **Answer**: **No**

2. **If asked to explain** (in case it appears in manifest):
   - Use the recommended response above
   - Clarify that you use Accelerometer, not Activity Recognition
   - State that the permission should not be in your manifest

3. **If the permission is detected**:
   - Check which dependency is adding it
   - Remove it from AndroidManifest.xml
   - Rebuild and resubmit

---

## Verification Steps

1. Build your Android APK/AAB
2. Extract and check `AndroidManifest.xml`
3. Search for `ACTIVITY_RECOGNITION`
4. If found, identify which dependency added it
5. Remove it or update the dependency

---

## Summary

**Your app does NOT use ACTIVITY_RECOGNITION permission.** 

If Google Play is asking about it, respond that:
- The app does not use this permission
- The app only uses Accelerometer for device stability detection during KYC
- No activity recognition or physical activity tracking is performed
- The permission should not appear in your app's manifest

