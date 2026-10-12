jest.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
  TouchableOpacity: "TouchableOpacity",
  Switch: "Switch",
  Modal: "Modal",
  ScrollView: "ScrollView",
  ActivityIndicator: "ActivityIndicator",
  StatusBar: "StatusBar",
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "android" },
  UIManager: {},
  LayoutAnimation: {
    configureNext: jest.fn(),
    Presets: { easeInEaseOut: {} },
  },
  Alert: { alert: jest.fn() },
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock("../../context/RoverContext", () => ({
  useRover: jest.fn(() => ({
    telemetry: { mission: {}, state: {}, global: {} },
    services: {},
    connectionState: "disconnected",
  })),
}));

jest.mock("../../hooks/useAuth", () => ({
  useAuth: jest.fn(() => ({
    logout: jest.fn(),
    session: null,
  })),
}));

jest.mock("../../hooks/useSprayActuator", () => ({
  useSprayActuator: jest.fn(() => ({
    refreshConfig: jest.fn(),
    isDirty: false,
    discardDraft: jest.fn(),
    commitSpraySettings: jest.fn(),
  })),
}));

jest.mock("../../components/settings/SprayActuatorCard", () => ({
  SprayActuatorCard: () => null,
}));

jest.mock("../../components/settings/RoverIconPicker", () => ({
  RoverIconPicker: () => null,
}));

jest.mock("../../components/settings/ParamBrowserModal", () => ({
  ParamBrowserModal: () => null,
}));

jest.mock("../../components/missionreport/RTKInjectionScreen", () => ({
  RTKInjectionScreen: () => null,
}));

jest.mock("../../components/shared/Toast", () => ({
  Toast: () => null,
}));

jest.mock("../../components/shared/AppIcon", () => ({
  AppIcon: () => null,
}));

jest.mock("../../services/obstacleService", () => ({
  getObstacleStatus: jest.fn(),
  setObstacleConfig: jest.fn(),
}));

jest.mock("../../services/missionApi", () => ({
  getMissionStatus: jest.fn(),
  saveMissionDefaults: jest.fn(),
  setMissionMarkingTool: jest.fn(),
}));

import {
  ENABLE_MAVLINK_PARAMS,
  SETTINGS_CATEGORIES,
  ALL_SETTINGS_CATEGORIES,
} from "../SettingsScreen";

describe("SettingsScreen Categories Configuration", () => {
  it("disables MAVLink params in the field build", () => {
    expect(ENABLE_MAVLINK_PARAMS).toBe(false);
  });

  it("contains exactly the 6 expected visible categories and excludes mavlink", () => {
    const visibleCategoryIds = SETTINGS_CATEGORIES.map((cat) => cat.id);
    const expectedCategoryIds = ["rtk", "mission", "obstacle", "voice", "led", "appearance"];

    expect(visibleCategoryIds).toEqual(expectedCategoryIds);
    expect(SETTINGS_CATEGORIES.length).toBe(6);
    expect(visibleCategoryIds).not.toContain("mavlink");
  });

  it("retains mavlink in ALL_SETTINGS_CATEGORIES for future re-enablement", () => {
    const allCategoryIds = ALL_SETTINGS_CATEGORIES.map((cat) => cat.id);
    expect(allCategoryIds).toContain("mavlink");
    expect(ALL_SETTINGS_CATEGORIES.length).toBe(7);
  });
});
