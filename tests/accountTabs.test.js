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

test("account tab presentation depends on server driver role, never identity verification, vehicles or a current ride", () => {
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
    assert.equal(policy.usesDriverTabLabels(user), false);
  }
  for (const user of [
    { role: "driver" },
    { role: "both" },
  ]) {
    assert.equal(policy.usesDriverTabLabels(user), true);
    assert.equal(
      policy.usesDriverTabLabels({ ...user, currentTripRole: "passenger" }),
      true,
    );
  }
});

test("account selector stays primitive across unrelated store updates and resets for another account", () => {
  const state = { auth: { user: { id: "driver", role: "both" } } };
  const selected = policy.selectUsesDriverTabLabels(state);
  for (let i = 0; i < 50; i++) {
    assert.equal(
      policy.selectUsesDriverTabLabels({
        ...state,
        location: { sequence: i },
        wallet: { balance: i },
      }),
      selected,
    );
  }
  assert.equal(
    policy.selectUsesDriverTabLabels({
      auth: { user: { id: "passenger", role: "passenger" } },
    }),
    false,
  );
  assert.equal(policy.selectUsesDriverTabLabels({ auth: { user: null } }), false);
  assert.equal(
    policy.selectUsesDriverTabLabels({ auth: { user: { role: "driver" } } }),
    true,
  );
});

test("profile access keeps the standalone Services entry available to every role", () => {
  assert.equal(policy.getServicesEntryHref(), "/services");
  const source = fs.readFileSync(
    path.join(__dirname, "../hooks/profile/useProfileController.ts"),
    "utf8",
  );
  assert.match(source, /router\.push\(getServicesEntryHref\(\)\)/);
});

for (const platform of ["ios", "android"]) {
  test(`${platform}: five visible tabs including Services for both roles, with native stability settings preserved`, () => {
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
    for (const role of ["passenger", "driver", "both", "passenger"]) {
      state.auth.user = { role };
      const elements = nodes(TabLayout());
      const screens = elements.filter((node) => node.type === "TabScreen");
      assert.deepEqual(
        screens.map((node) => node.props.name),
        ["index", "discover", "trips", "messages", "profile"],
      );
      const visible = screens.filter(node => node.props.options.href !== null);
      assert.deepEqual(visible.map(node => node.props.name), ['index', 'discover', 'trips', 'messages', 'profile']);
      assert.deepEqual(visible.map(node => node.props.options.title),
        ['Accueil', 'Services', role === 'passenger' ? 'Trajets' : 'Mes trajets', 'Messages', 'Profil']);
      for (const focused of [false, true]) {
        const icons = visible.map(screen => nodes(screen.props.options.tabBarIcon({ focused, color: '#66615B', size: 24 })));
        assert.deepEqual(icons.map(icon => icon.find(node => node.type === 'Icon').props.name),
          ['home-outline', 'briefcase-outline', 'car-outline', 'chatbubble-outline', 'person-outline']);
        assert.ok(icons.every(icon => icon.find(node => node.type === 'Icon').props.color === (focused ? '#BC4008' : '#66615B')));
        assert.ok(icons[3].some(node => node.type === 'Text' && node.props.children === 4), 'unread badge preserved');
      }
      const tabs = elements.find((node) => node.type === Tabs);
      assert.equal(tabs.props.initialRouteName, 'index');
      assert.equal(tabs.props.backBehavior, 'initialRoute');
      const tabBarStyle = Object.assign({}, ...tabs.props.screenOptions.tabBarStyle.filter(Boolean));
      assert.equal(tabBarStyle.borderTopLeftRadius ?? 0, 0);
      assert.equal(tabBarStyle.borderTopRightRadius ?? 0, 0);
      assert.equal(tabBarStyle.backgroundColor, '#FFFFFF');
      assert.equal(tabBarStyle.elevation, 0);
      assert.equal(tabBarStyle.shadowOpacity, 0);
      assert.ok(tabBarStyle.paddingBottom >= 24, 'safe area is preserved');
      assert.ok(tabs.props.screenOptions.tabBarItemStyle.minHeight >= 44);
      assert.equal(tabs.props.screenOptions.tabBarLabelPosition, 'below-icon');
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

  test(`${platform}: Services content no longer depends on account role and reserves only the overlay space`, () => {
    const { default: DiscoverTab } = loader({
      "react-native": native(platform),
      "@react-navigation/bottom-tabs": { useBottomTabBarHeight: () => 92 },
      "@/store/hooks": { useAppSelector: () => { throw new Error('Services must not depend on driver role'); } },
      "@/features/pro-services/ServicesScreen": {
        default: "Services",
        __esModule: true,
      },
    })("app/(tabs)/discover.tsx");
    const services = DiscoverTab();
    assert.equal(services.type, "Services");
    assert.equal(services.props.embedded, true);
    assert.equal(services.props.bottomOverlay, platform === "ios" ? 92 : 0);
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
    "react-native": native("android"),
    "@expo/vector-icons": { Ionicons: "Icon" },
    "@/hooks/useAppIsActive": { useScreenIsActive: () => active },
    "@/features/pro-services/ServiceLayout": {
      ServiceLayout: "Layout",
      ServiceButton: "Button",
      s: {},
    },
    "@/features/pro-services/ServiceCatalogue": {
      OpenService: "Service",
      ServiceCaseLink: "Case",
      UpcomingServices: "Future",
    },
    "@/store/api/proServicesApi": {
      useGetMyProCasesQuery: query("cases"),
      useGetProOfferingsQuery: query("catalogue"),
    },
  })("features/pro-services/ServicesScreen.tsx");
  const render = () =>
    hooks.render(() => ServicesScreen({ embedded: true, bottomOverlay: 0 }));
  render();
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

test("public search stays unambiguous and the home search links are unchanged", () => {
  assert.equal(
    fs.existsSync(path.join(__dirname, "../app/(tabs)/search.tsx")),
    false,
  );
  assert.ok(fs.existsSync(path.join(__dirname, "../app/search.tsx")));
  for (const filename of [
    "components/home/HomeDashboardActions.tsx",
    "hooks/home/useHomeSheet.ts",
  ]) {
    assert.match(
      fs.readFileSync(path.join(__dirname, "..", filename), "utf8"),
      /router\.push\([^)]*'\/search'/,
    );
  }
  const layout = fs.readFileSync(
    path.join(__dirname, "../components/ProtectedAppStack.tsx"),
    "utf8",
  );
  assert.match(layout, /Stack.Screen name="search"/);
  assert.match(layout, /Stack.Protected guard=\{hasSession\}/);
});
