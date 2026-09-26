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

for (const platform of ["ios", "android"]) {
  test(`${platform}: exactly five stable tabs, matching labels/icons, and native stability settings preserved`, () => {
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
    for (const role of ["passenger", "driver", "both"]) {
      state.auth.user = { role };
      const elements = nodes(TabLayout());
      const screens = elements.filter((node) => node.type === "TabScreen");
      assert.deepEqual(
        screens.map((node) => node.props.name),
        ["index", "discover", "trips", "messages", "profile"],
      );
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
    "components/home/HomeHeader.tsx",
    "hooks/home/useHomeSheet.ts",
  ]) {
    assert.match(
      fs.readFileSync(path.join(__dirname, "..", filename), "utf8"),
      /router.push\('\/search'\)/,
    );
  }
  const layout = fs.readFileSync(
    path.join(__dirname, "../app/_layout.tsx"),
    "utf8",
  );
  assert.match(layout, /Stack.Screen name="search"/);
});
