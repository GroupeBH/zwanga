const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loader } = require("./helpers/loadTypeScript.cjs");
const { hookHarness } = require("./helpers/hookHarness.cjs");

const policy = loader()("features/navigation/accountTabPolicy.ts");
function nodes(tree) {
  if (tree == null || typeof tree === "boolean") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const native = (platform) => ({
  Platform: {
    OS: platform,
    select: (choices) => choices[platform] ?? choices.default,
  },
  StyleSheet: { create: (value) => value },
  View: "View",
  Text: "Text",
  TouchableOpacity: "Button",
  ScrollView: "Scroll",
  KeyboardAvoidingView: "Keyboard",
});

test("the second tab depends on driver capability, never identity verification, vehicles or a current ride", () => {
  for (const user of [
    null,
    undefined,
    { role: "passenger" },
    { role: "passenger", isDriver: true },
    { role: "admin" },
    {
      role: "passenger",
      identityVerified: true,
      vehicle: {},
      currentTripRole: "driver",
    },
  ]) {
    assert.equal(policy.usesServicesTab(user), false);
  }
  for (const user of [
    { role: "driver" },
    { role: "both" },
  ]) {
    assert.equal(policy.usesServicesTab(user), true);
    assert.equal(
      policy.usesServicesTab({ ...user, currentTripRole: "passenger" }),
      true,
    );
  }
});

test("account selector stays primitive across unrelated store updates and resets for another account", () => {
  const state = { auth: { user: { id: "driver", role: "both" } } };
  const selected = policy.selectUsesServicesTab(state);
  for (let i = 0; i < 50; i++) {
    assert.equal(
      policy.selectUsesServicesTab({
        ...state,
        location: { sequence: i },
        wallet: { balance: i },
      }),
      selected,
    );
  }
  assert.equal(
    policy.selectUsesServicesTab({
      auth: { user: { id: "passenger", role: "passenger" } },
    }),
    false,
  );
  assert.equal(policy.selectUsesServicesTab({ auth: { user: null } }), false);
  assert.equal(
    policy.selectUsesServicesTab({ auth: { user: { role: "driver" } } }),
    true,
  );
});

test("profile access keeps Services available to passengers, without KYC or subscription gating", () => {
  assert.equal(policy.getServicesEntryHref(true), "/(tabs)/discover");
  assert.equal(policy.getServicesEntryHref(false), "/services");
  const source = fs.readFileSync(
    path.join(__dirname, "../hooks/profile/useProfileController.ts"),
    "utf8",
  );
  assert.match(source, /getServicesEntryHref\(usesServices\)/);
  assert.match(source, /router.navigate\(href/);
});

test("earnings are a transport-driver tab, not a passenger flag or a temporary trip role", () => {
  for (const role of ['driver', 'both']) {
    for (const driverCategory of ['transport', 'private', null, undefined, 'unknown']) {
      const user = { role, driverCategory, currentTripRole: 'passenger' };
      assert.equal(policy.usesEarningsTab(user), driverCategory === 'transport');
      assert.equal(policy.selectUsesEarningsTab({ auth: { user } }), driverCategory === 'transport');
      assert.equal(policy.selectUsesTripSearchTab({ auth: { user } }), false);
    }
  }
  for (const user of [null, undefined, { role: 'admin', driverCategory: 'transport' },
    { role: 'passenger', driverCategory: 'transport', isDriver: true }]) {
    assert.equal(policy.usesEarningsTab(user), false);
    assert.equal(policy.selectUsesTripSearchTab({ auth: { user } }), user?.role === 'passenger');
  }
});

test("tab selectors react to category/account changes but not GPS or balance updates", () => {
  const user = { role: 'driver', driverCategory: 'transport' };
  for (let sequence = 0; sequence < 50; sequence++) {
    assert.equal(policy.selectUsesEarningsTab({ auth: { user }, location: { sequence } }), true);
  }
  user.driverCategory = 'private';
  assert.equal(policy.selectUsesEarningsTab({ auth: { user } }), false);
  user.role = 'passenger';
  assert.equal(policy.selectUsesTripSearchTab({ auth: { user } }), true);
  assert.equal(policy.selectUsesEarningsTab({ auth: { user: null } }), false);
  assert.equal(policy.selectUsesTripSearchTab({ auth: { user: null } }), false);
});

for (const platform of ["ios", "android"]) {
  test(`${platform}: five visible tabs with role-specific destinations, icons and unchanged native stability settings`, () => {
    const state = { auth: { user: { role: "passenger" } } };
    const Tabs = Object.assign(() => null, { Screen: "TabScreen" });
    const { default: TabLayout } = loader({
      "react-native": native(platform),
      "expo-router": { Tabs },
      "react-native-safe-area-context": {
        useSafeAreaInsets: () => ({ bottom: 24 }),
      },
      "@expo/vector-icons": { Ionicons: "Icon" },
      "@/components/OngoingTripBanner": { OngoingTripBanner: "RideBanner" },
      "@/store/hooks": { useAppSelector: (selector) => selector(state) },
      "@/store/selectors": { selectUnreadMessagesCount: () => 4 },
    })("app/(tabs)/_layout.tsx");
    for (const user of [
      { role: 'passenger' }, { role: 'passenger', driverCategory: 'transport' },
      { role: 'driver' }, { role: 'driver', driverCategory: 'private' },
      { role: 'driver', driverCategory: 'transport' }, { role: 'both' },
      { role: 'both', driverCategory: 'transport' },
    ]) {
      state.auth.user = user;
      const { role } = user;
      const earnings = policy.usesEarningsTab(user);
      const elements = nodes(TabLayout());
      const routes = elements.filter((node) => node.type === "TabScreen");
      const screens = routes.filter(node => node.props.options.href !== null);
      assert.deepEqual(
        screens.map((node) => node.props.name),
        ["index", "discover", earnings ? "earnings" : "trips", "messages", "profile"],
      );
      assert.deepEqual(routes.map(node => node.props.name), ['index', 'discover', 'trips', 'earnings', 'messages', 'profile']);
      assert.equal(screens[2].props.options.title, earnings ? 'Revenus' : role === 'passenger' ? 'Trajet' : 'Mes trajets');
      assert.equal(screens[2].props.options.href, earnings ? '/(tabs)/earnings' : role === 'passenger' ? '/search' : '/(tabs)/trips');
      for (const focused of [true, false]) {
        const thirdIcon = screens[2].props.options.tabBarIcon({ focused, color: '#000', size: 24 });
        assert.equal(nodes(thirdIcon).find(node => node.type === 'Icon').props.name,
          `${earnings ? 'wallet' : 'car'}${focused ? '' : '-outline'}`);
      }
      assert.equal(
        screens[1].props.options.title,
        role === "passenger" ? "Recherche" : "Services",
      );
      const icon = screens[1].props.options.tabBarIcon({
        focused: true,
        color: "#000",
        size: 24,
      });
      assert.equal(
        nodes(icon).find((node) => node.type === "Icon").props.name,
        role === "passenger" ? "search" : "briefcase",
      );
      const tabs = elements.find((node) => node.type === Tabs);
      assert.equal(tabs.props.initialRouteName, 'index');
      assert.equal(tabs.props.backBehavior, 'initialRoute');
      const tabBarStyle = Object.assign({}, ...tabs.props.screenOptions.tabBarStyle.filter(Boolean));
      assert.equal(tabBarStyle.borderTopLeftRadius ?? 0, 0);
      assert.equal(tabBarStyle.borderTopRightRadius ?? 0, 0);
      assert.equal(tabBarStyle.backgroundColor, '#FFFFFF');
      assert.equal(tabs.props.screenOptions.lazy, true);
      assert.equal(tabs.props.detachInactiveScreens, platform !== "android");
      assert.equal(
        tabs.props.screenOptions.freezeOnBlur,
        platform !== "android",
      );
      assert.equal(screens[0].props.options.freezeOnBlur, false);
      assert.equal(screens[3].props.options.freezeOnBlur, false);
      assert.equal(
        elements.filter((node) => node.type === "RideBanner").length,
        1,
      );
    }
  });

  test(`${platform}: earnings tab shares the real gains screen and exits after a category/account change`, () => {
    const state = { auth: { user: { role: 'driver', driverCategory: 'transport' } } };
    const { default: EarningsTab } = loader({
      'react-native': native(platform),
      'expo-router': { Redirect: 'Redirect' },
      '@react-navigation/bottom-tabs': { useBottomTabBarHeight: () => 92 },
      '@/store/hooks': { useAppSelector: selector => selector(state) },
      '../driver-earnings': { default: 'Earnings', __esModule: true },
    })('app/(tabs)/earnings.tsx');
    const tree = EarningsTab();
    assert.equal(tree.type, 'Earnings');
    assert.equal(tree.props.embedded, true);
    assert.equal(tree.props.bottomOverlay, platform === 'ios' ? 92 : 0);
    for (const user of [{ role: 'driver', driverCategory: 'private' }, { role: 'passenger' }, null]) {
      state.auth.user = user;
      const fallback = EarningsTab();
      assert.equal(fallback.type, 'Redirect', 'do not mount earnings queries for another role');
      assert.equal(fallback.props.href, '/(tabs)/trips');
    }
  });

  test(`${platform}: contextual content uses the same account selector and reserves only the overlay space`, () => {
    const state = { auth: { user: { role: "driver" } } };
    const { default: DiscoverTab } = loader({
      "react-native": native(platform),
      "@react-navigation/bottom-tabs": { useBottomTabBarHeight: () => 92 },
      "@/store/hooks": { useAppSelector: (selector) => selector(state) },
      "@/features/pro-services/ServicesScreen": {
        default: "Services",
        __esModule: true,
      },
      "../search": { default: "Search", __esModule: true },
    })("app/(tabs)/discover.tsx");
    assert.equal(DiscoverTab().type, "Services");
    state.auth.user = { role: "passenger" };
    const search = DiscoverTab();
    assert.equal(search.type, "Search");
    assert.equal(search.props.embedded, true);
    assert.equal(search.props.bottomOverlay, platform === "ios" ? 92 : 0);
  });
}

test("Services tab removes only the stack header/back control and keeps standalone forms safe", () => {
  const { ServiceLayout } = loader({
    "react-native": native("ios"),
    "@expo/vector-icons": { Ionicons: "Icon" },
    "expo-router": { Stack: { Screen: "StackScreen" }, router: {} },
    "react-native-safe-area-context": { SafeAreaView: "SafeArea" },
  })("features/pro-services/ServiceLayout.tsx");
  const tab = ServiceLayout({
    title: "Services pro",
    embedded: true,
    bottomOverlay: 92,
  });
  const full = ServiceLayout({ title: "Nouvelle demande", footer: "Submit" });
  assert.deepEqual(tab.props.edges, ["top", "left", "right"]);
  assert.equal(full.props.edges, undefined, "standalone keeps all safe edges");
  assert.equal(
    nodes(tab).filter((node) => node.type === "StackScreen").length,
    0,
  );
  assert.equal(
    nodes(tab).filter((node) => node.props?.accessibilityLabel === "Retour")
      .length,
    0,
  );
  assert.equal(
    nodes(full).filter((node) => node.type === "StackScreen").length,
    1,
  );
  assert.equal(
    nodes(full).filter((node) => node.props?.accessibilityLabel === "Retour")
      .length,
    1,
  );
  const tabScroll = nodes(tab).find((node) => node.type === "Scroll");
  const fullScroll = nodes(full).find((node) => node.type === "Scroll");
  assert.equal(
    tabScroll.props.contentContainerStyle[1].paddingBottom -
      fullScroll.props.contentContainerStyle[1].paddingBottom,
    92,
  );
  assert.ok(
    nodes(nodes(full).find((node) => node.type === "Keyboard")).includes(
      "Submit",
    ),
  );
});

test("Services reads still pause on blur/background and reuse the same catalogue for the standalone route", () => {
  const hooks = hookHarness();
  const calls = [];
  let active = true;
  const query = (endpoint) => (argument, options) => {
    calls.push({ endpoint, options });
    return {
      data: endpoint === "catalogue" ? [] : undefined,
      currentData: { items: [] },
    };
  };
  const { default: ServicesScreen } = loader({
    react: hooks.react,
    "expo-router": { router: { push() {} } },
    "react-native": native("android"),
    "@expo/vector-icons": { Ionicons: "Icon" },
    "@/hooks/useAppIsActive": { useScreenIsActive: () => active },
    "@/features/pro-services/ServiceLayout": {
      ServiceLayout: "Layout",
      ServiceButton: "Button",
      s: {},
    },
    "@/features/pro-services/ServiceCatalogue": {
      ServiceDirectory: "Directory",
      ServiceCaseLink: "Case",
    },
    "@/store/api/proServicesApi": {
      useGetMyProCasesQuery: query("cases"),
      useGetCurrentDocumentCaseQuery: query("currentCase"),
      useGetProOfferingsQuery: query("catalogue"),
    },
  })("features/pro-services/ServicesScreen.tsx");
  const render = () =>
    hooks.render(() => ServicesScreen({ embedded: true, bottomOverlay: 0 }));
  render();
  assert.deepEqual(calls.map(call => call.endpoint).sort(), ["cases", "catalogue", "currentCase"]);
  assert.ok(calls.every((call) => call.options.skip === false));
  active = false;
  calls.length = 0;
  render();
  assert.ok(calls.every((call) => call.options.skip === true));
  assert.ok(calls.every((call) => !call.options.pollingInterval));
  hooks.unmount();
  assert.match(
    fs.readFileSync(path.join(__dirname, "../app/services/index.tsx"), "utf8"),
    /features\/pro-services\/ServicesScreen/,
  );
});

test("public search stays unambiguous and separate from the home request actions", () => {
  assert.equal(
    fs.existsSync(path.join(__dirname, "../app/(tabs)/search.tsx")),
    false,
  );
  assert.ok(fs.existsSync(path.join(__dirname, "../app/search.tsx")));
  // Published trips remain reachable through discovery; the two main home
  // actions now create a request, as exercised in homeCompactLayout.test.js.
  assert.match(
    fs.readFileSync(path.join(__dirname, "../hooks/home/useHomeSheet.ts"), "utf8"),
    /router.push\('\/search'\)/,
  );
  const home = fs.readFileSync(
    path.join(__dirname, "../components/home/HomeTripsSheet.tsx"), "utf8",
  );
  assert.equal((home.match(/router.push\(getTripRequestCreateHref\(\{ entry: 'home' \}\)\)/g) || []).length, 2);
  const layout = fs.readFileSync(
    path.join(__dirname, "../components/ProtectedAppStack.tsx"),
    "utf8",
  );
  assert.match(layout, /Stack.Screen name="search"/);
  assert.match(layout, /Stack.Protected guard=\{hasSession\}/);
});
