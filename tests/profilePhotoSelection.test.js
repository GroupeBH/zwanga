const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const nodes = (tree, predicate) => {
  if (!tree || typeof tree !== 'object') return [];
  const children = tree.props?.children;
  return [...(predicate(tree) ? [tree] : []), ...[children].flat(Infinity).flatMap(child => nodes(child, predicate))];
};

function fixture(t) {
  const hooks = hookHarness();
  const io = { dialog: null, dialogs: [], focused: true, enabled: true, permission: true, gallery: 0, permissions: 0, prepared: [], hold: null };
  const showDialog = value => { io.dialog = value; io.dialogs.push(value); };
  const hideDialog = () => { io.dialog = null; };
  const load = loader({
    react: { ...React, ...hooks.react }, 'react-native': { ActivityIndicator: 'Spinner', Platform: { OS: 'android' } },
    '@react-navigation/native': { useIsFocused: () => io.focused },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog, hideDialog }) },
    '@/components/profile/ProfilePhotoCameraCapture': { ProfilePhotoCameraCapture: 'EmbeddedCamera' },
    'expo-image-picker': {
      requestMediaLibraryPermissionsAsync: async () => { io.permissions++; return { granted: io.permission }; },
      launchImageLibraryAsync: async options => { io.gallery++; assert.equal(options.allowsEditing, false); return { canceled: false, assets: [{ uri: 'file:///gallery.jpg' }] }; },
      launchCameraAsync: () => { throw Error('External camera must not launch'); },
    },
    '@/utils/profilePhoto': { prepareProfilePhoto: async uri => { io.prepared.push(uri); if (io.hold) await io.hold.promise; return 'file:///prepared.jpg'; } },
  });
  const { useProfilePhotoSelection } = load('hooks/profile/useProfilePhotoSelection.ts');
  const render = () => hooks.render(() => useProfilePhotoSelection({ enabled: io.enabled }));
  const press = async label => {
    const action = io.dialog.actions.find(a => a.label === label); assert.ok(action, label);
    if (action.autoClose !== false) hideDialog();
    action.onPress(); await flush();
  };
  t.after(() => hooks.unmount());
  return { hooks, io, render, press };
}

test('camera stays embedded, needs no gallery permission, prepares before preview and waits for confirmation', async t => {
  const e = fixture(t), chosen = e.render().choosePhoto();
  assert.equal(await e.render().choosePhoto(), null, 'double tap is synchronously rejected');
  await e.press('Caméra'); assert.equal(e.io.dialog.content.type, 'EmbeddedCamera');
  assert.equal(e.io.permissions, 0); assert.equal(e.io.gallery, 0);
  e.io.dialog.content.props.onCapture('file:///camera.jpg'); await flush();
  assert.deepEqual(e.io.prepared, ['file:///camera.jpg']);
  assert.equal(e.io.dialogs.some(d => d.content?.type === 'Spinner'), true);
  assert.equal(e.io.dialog.previewImageUri, 'file:///prepared.jpg');
  assert.equal(e.render().isSelecting, true);
  await e.press('Utiliser cette photo'); assert.equal(await chosen, 'file:///prepared.jpg');
  assert.equal(e.render().isSelecting, false);
});

test('gallery permission is requested only when chosen, cancellation never changes the photo', async t => {
  const e = fixture(t), chosen = e.render().choosePhoto();
  await e.press('Galerie'); assert.equal(e.io.permissions, 1); assert.equal(e.io.gallery, 1);
  assert.equal(e.io.dialog.previewImageUri, 'file:///prepared.jpg');
  await e.press('Annuler'); assert.equal(await chosen, null);
  e.io.permission = false;
  const denied = e.render().choosePhoto(); await e.press('Galerie');
  assert.equal(await denied, null); assert.equal(e.io.gallery, 1); assert.equal(e.io.dialog.title, 'Galerie non autorisée');
});

test('retaking replaces the preview; leaving a screen or cancelling processing rejects late results', async t => {
  const e = fixture(t), chosen = e.render().choosePhoto();
  await e.press('Caméra'); e.io.dialog.content.props.onCapture('file:///first.jpg'); await flush();
  await e.press('Reprendre la photo'); assert.equal(e.io.dialog.title, 'Photo de profil');
  await e.press('Caméra'); e.io.focused = false; e.render();
  assert.equal(await chosen, null); assert.equal(e.io.dialog, null);
  e.io.focused = true; e.io.hold = deferred();
  const next = e.render().choosePhoto({ uri: 'file:///delayed.jpg', source: 'gallery' });
  await flush(); await e.press('Annuler'); e.io.hold.resolve();
  assert.equal(await next, null); assert.equal(e.io.dialog, null);
});

test('signup changes only local state after confirmation and never calls a profile API', async t => {
  const hooks = hookHarness(), photos = [], pick = deferred();
  const { useSignupProfileActions } = loader({ react: hooks.react,
    '@/hooks/profile/useProfilePhotoSelection': { useProfilePhotoSelection: () => ({ choosePhoto: () => pick.promise, isSelecting: false }) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => false },
    '@/features/profile/profilePhotoRecovery': { claimPendingProfileImageUri: async () => null },
  })('hooks/auth/useSignupProfileActions.ts');
  t.after(() => hooks.unmount());
  const result = hooks.render(() => useSignupProfileActions({ setProfilePicture: uri => photos.push(uri) }));
  const selection = result.handleSelectProfilePicture(); assert.deepEqual(photos, []);
  pick.resolve('file:///confirmed.jpg'); await selection;
  assert.deepEqual(photos, ['file:///confirmed.jpg']);
});

test('authenticated photo updates only after server success; late responses cannot update a new account', async t => {
  for (const switchAccount of [false, true]) {
    const hooks = hookHarness(), upload = deferred(), actions = [], dialogs = [];
    let session = 1, uploads = 0, selections = 0;
    const trigger = () => { uploads++; return { unwrap: () => upload.promise }; };
    const choosePhoto = async () => { selections++; return 'file:///confirmed.jpg'; };
    const { useProfilePhoto } = loader({ react: hooks.react,
      '@/features/profile/profilePhotoRecovery': { claimPendingProfileImageUri: async () => null },
      '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: value => dialogs.push(value) }) },
      '@/store/api/zwangaApi': { useUpdateUserMutation: () => [trigger, { isLoading: false }] },
      '@/store/hooks': { useAppDispatch: () => action => actions.push(action) },
      '@/store/slices/authSlice': { updateUser: value => value },
      '@/services/tokenSession': { getTokenSessionVersion: () => session },
      '@/hooks/useAppIsActive': { useScreenIsActive: () => false },
      './profile/useProfilePhotoSelection': { useProfilePhotoSelection: () => ({ choosePhoto, isSelecting: false }) },
    })('hooks/useProfilePhoto.ts');
    t.after(() => hooks.unmount());
    const result = hooks.render(() => useProfilePhoto());
    const first = result.changeProfilePhoto({ nativeEvent: {} }); await flush();
    assert.equal(await result.changeProfilePhoto(), false); assert.equal(uploads, 1); assert.equal(selections, 1);
    assert.equal(actions.length, 0);
    if (switchAccount) session++;
    upload.resolve({ profilePicture: 'https://example.test/avatar.jpg' });
    assert.equal(await first, !switchAccount); assert.equal(actions.length, switchAccount ? 0 : 1);
    assert.equal(dialogs.length, switchAccount ? 0 : 1);
  }
});

test('camera ignores a late capture after backgrounding and cannot capture twice in the same frame', async t => {
  const hooks = hookHarness(), listeners = new Set(), photo = deferred(), captured = [];
  const state = { currentState: 'active', addEventListener: (_name, cb) => { listeners.add(cb); return { remove: () => listeners.delete(cb) }; } };
  const { ProfilePhotoCameraCapture } = loader({ react: { ...React, ...hooks.react },
    'react-native': { AppState: state, View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: v => v } },
    'expo-camera': { CameraView: 'Camera', useCameraPermissions: () => [{ granted: true }, async () => {}] },
    '@expo/vector-icons': { Ionicons: 'Icon' }, '@/utils/profilePhoto': { chooseProfilePictureSize: () => '1024x1024' },
  })('components/profile/ProfilePhotoCameraCapture.tsx');
  t.after(() => hooks.unmount());
  const render = () => hooks.render(() => ProfilePhotoCameraCapture({ onCapture: uri => captured.push(uri) }));
  let calls = 0;
  const camera = nodes(render(), n => n.type === 'Camera')[0];
  camera.props.ref({ getAvailablePictureSizesAsync: async () => ['1024x1024'], takePictureAsync: () => { calls++; return photo.promise; } });
  await camera.props.onCameraReady();
  const buttons = nodes(render(), n => n.type === 'Button');
  const first = buttons[1].props.onPress(), second = buttons[1].props.onPress(); assert.equal(calls, 1);
  state.currentState = 'background'; listeners.forEach(cb => cb('background'));
  assert.equal(nodes(render(), n => n.type === 'Camera').length, 0);
  photo.resolve({ uri: 'file:///late.jpg' }); await Promise.all([first, second]);
  assert.deepEqual(captured, []);
  hooks.unmount(); assert.equal(listeners.size, 0);
});

test('changing the profile photo does not overwrite unsaved fields when the summary refreshes', async t => {
  const hooks = hookHarness();
  let user = { id: 'test-user', firstName: 'Test', lastName: 'Example', phone: '+243000000000', gender: null };
  const Screen = loader({ react: { ...React, ...hooks.react },
    '../features/screen-styles/app/edit-profile/index': { styles: {} },
    '@/hooks/useProfilePhoto': { useProfilePhoto: () => ({ changeProfilePhoto: async () => true }) },
    '@/store/api/userApi': { useGetProfileSummaryQuery: () => ({ data: { user }, refetch() {} }),
      useGetKycStatusQuery: () => ({ data: {} }), useUpdateUserMutation: () => [() => {}, {}] },
    '@/store/hooks': { useAppDispatch: () => () => {} }, '@/store/slices/authSlice': { updateUser() {} },
    '@/components/GenderSelector': { GenderSelector: 'Gender' },
    'expo-router': { useRouter: () => ({ back() {} }) }, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/utils/reanimated': { __esModule: true, default: { View: 'AnimatedView' }, FadeInDown: { delay: () => ({}) } },
    'react-native-safe-area-context': { SafeAreaView: 'Safe' },
    'react-native': { StyleSheet: { create: v => v }, ActivityIndicator: 'Spinner', Modal: 'Modal', ScrollView: 'Scroll', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', View: 'View' },
  })('app/edit-profile.tsx').default;
  t.after(() => hooks.unmount());
  const render = () => hooks.render(() => Screen());
  render();
  const firstName = nodes(render(), n => n.type === 'Input' && n.props.value === 'Test')[0];
  assert.ok(firstName); firstName.props.onChangeText('In progress');
  user = { ...user, profilePicture: 'https://example.test/new.jpg' }; render();
  assert.ok(nodes(render(), n => n.type === 'Input' && n.props.value === 'In progress').length);
  user = { ...user, id: 'another-test-user', firstName: 'New account' }; render();
  assert.equal(nodes(render(), n => n.type === 'Input' && n.props.value === 'In progress').length, 0);
  assert.ok(nodes(render(), n => n.type === 'Input' && n.props.value === 'New account').length);
});
