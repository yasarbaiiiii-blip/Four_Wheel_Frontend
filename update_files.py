import re
import sys

def update_sprayConfigService():
    path = 'src/services/sprayConfigService.ts'
    new_content = """import { PX4_SPRAY } from "../config/px4Endpoints";
import { apiGet, apiPost } from "./apiClient";

export interface SprayConfig {
  available: boolean;
  status_age_sec?: number | null;
  press_pwm_us: number | null;
  release_pwm_us: number | null;
  press_value?: number | null;
  release_value?: number | null;
  spray_duration_sec?: number | null;
  controller_state?: string | null;
  ready?: boolean;
  fault_latched?: boolean;
  fault_reason?: string | null;
  config_request_id?: string | null;
  config_result?: string | null;
  config_reason?: string | null;
  pwm_min_us?: number;
  pwm_max_us?: number;
}

export interface SprayConfigResponse {
  success: boolean;
  message?: string;
  config: SprayConfig;
}

export interface SprayBasicResponse {
  success: boolean;
  message?: string;
}

export async function getSprayConfig(): Promise<SprayConfigResponse> {
  return apiGet<SprayConfigResponse>(PX4_SPRAY.CONFIG);
}

export async function enableSpray(): Promise<SprayBasicResponse> {
  return apiPost<SprayBasicResponse>(PX4_SPRAY.ENABLE, {});
}

export async function disableSpray(): Promise<SprayBasicResponse> {
  return apiPost<SprayBasicResponse>(PX4_SPRAY.DISABLE, {});
}

export async function testSpray(spray_duration_sec: number): Promise<SprayBasicResponse> {
  if (!Number.isFinite(spray_duration_sec) || spray_duration_sec < 0) {
    throw new Error("Spray duration must be a valid positive number.");
  }
  return apiPost<SprayBasicResponse>(PX4_SPRAY.TEST, { spray_duration_sec });
}

export default {
  getSprayConfig,
  enableSpray,
  disableSpray,
  testSpray,
};
"""
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("sprayConfigService.ts updated.")

def update_SettingsScreen():
    path = 'src/screens/SettingsScreen.tsx'
    with open(path, 'r', encoding='utf-8') as f:
        c = f.read()

    # 1. Imports
    c = c.replace(
        'import { getSprayConfig, setSprayConfig } from "../services/sprayConfigService";',
        'import { getSprayConfig, enableSpray, disableSpray, testSpray } from "../services/sprayConfigService";'
    )

    # 2. handleServoEnabledToggle
    old_toggle = """  const handleServoEnabledToggle = async (enabled: boolean) => {
    setIsLoadingServo(true);
    try {
      const response = await services.updateMissionServoConfig({
        servo_enabled: enabled,
      });
      if (response.success) {"""
    new_toggle = """  const handleServoEnabledToggle = async (enabled: boolean) => {
    setIsLoadingServo(true);
    try {
      const response = enabled ? await enableSpray() : await disableSpray();
      if (response.success) {"""
    c = c.replace(old_toggle, new_toggle)

    # 3. Replace handleServoTest and handleServoSave
    test_save_regex = re.compile(r'  // Servo Test Handler\s*const handleServoTest.*?// Open Servo Config Modal: always re-fetch fresh config before showing', re.DOTALL)
    new_test_save = """  // Servo Test Handler
  const handleServoTest = async (duration: number) => {
    try {
      console.log("[Settings] Testing spray config duration:", duration);
      const response = await testSpray(duration);
      console.log("[Settings] Test response:", response);
      return response;
    } catch (error) {
      console.error("[Settings] Spray test error:", error);
      return {
        success: false,
        message: "Failed to test spray",
      };
    }
  };

  // Open Servo Config Modal: always re-fetch fresh config before showing"""
    c = test_save_regex.sub(new_test_save, c)

    # 4. JSX Status Badge replacement
    old_badge = """                <View
                  style={[
                    styles.statusBadge,
                    servoEnabled ? styles.statusBadgeOn : styles.statusBadgeOff,
                  ]}
                >
                  <Text style={styles.statusBadgeText}>
                    {servoEnabled ? "AVAILABLE" : "OFFLINE"}
                  </Text>
                </View>"""
    new_badge = """                <Switch
                  value={servoEnabled}
                  onValueChange={handleServoEnabledToggle}
                  disabled={isLoadingServo}
                  trackColor={{ false: "#4a5568", true: "#10b981" }}
                  thumbColor={servoEnabled ? "#ffffff" : "#d1d5db"}
                />"""
    c = c.replace(old_badge, new_badge)

    # 5. JSX Modal replacement
    old_modal = """        {/* Servo Configuration Modal */}
        <ServoConfigModal
          visible={showServoConfigModal}
          currentConfig={servoConfig}
          onClose={() => setShowServoConfigModal(false)}
          onTest={handleServoTest}
          onSave={handleServoSave}
        />"""
    new_modal = """        {/* Servo Configuration Modal */}
        <ServoConfigModal
          visible={showServoConfigModal}
          currentConfig={servoConfig}
          onClose={() => setShowServoConfigModal(false)}
          onTest={handleServoTest}
        />"""
    c = c.replace(old_modal, new_modal)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(c)
    print("SettingsScreen.tsx updated.")

def update_ServoConfigModal():
    path = 'src/components/settings/ServoConfigModal.tsx'
    with open(path, 'r', encoding='utf-8') as f:
        c = f.read()

    # Rewrite the whole file since we are removing fields
    new_content = """import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface ServoConfig {
  servo_channel: number;
  servo_pwm_on: number;
  servo_pwm_off: number;
  servo_delay_before: number;
  servo_spray_duration: number;
  servo_delay_after: number;
  servo_enabled: boolean;
}

interface ServoConfigModalProps {
  visible: boolean;
  currentConfig: ServoConfig;
  onClose: () => void;
  onTest?: (duration: number) => Promise<{
    success: boolean;
    message?: string;
    status?: string;
  }>;
}

export const ServoConfigModal: React.FC<ServoConfigModalProps> = ({
  visible,
  currentConfig,
  onClose,
  onTest,
}) => {
  const [sprayTimeText, setSprayTimeText] = useState(
    String(currentConfig.servo_spray_duration),
  );
  const [isTesting, setIsTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSprayTimeText(String(currentConfig.servo_spray_duration));
    setTestSuccess(false);
  }, [visible, currentConfig.servo_spray_duration]);

  const parseDuration = (text: string): number | null => {
    const value = Number.parseFloat(text);
    if (!Number.isFinite(value) || value < 0) {
      Alert.alert("Invalid Spray Time", "Spray Time must be a valid positive number.");
      return null;
    }
    return value;
  };

  const adjustTime = (
    currentText: string,
    setter: (value: string) => void,
    amount: number,
  ) => {
    const current = Number.parseFloat(currentText);
    const safeCurrent = Number.isFinite(current) ? current : 0;
    const next = Math.max(0, safeCurrent + amount);
    setter(next.toFixed(1));
  };

  const handleTest = async () => {
    if (!onTest) return;
    const duration = parseDuration(sprayTimeText);
    if (duration === null) return;

    setIsTesting(true);
    setTestSuccess(false);

    try {
      const response = await onTest(duration);

      if (!response.success) {
        Alert.alert("Test Failed", response.message || "Failed to test spray.");
        return;
      }
      setTestSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (error) {
      Alert.alert("Test Error", error instanceof Error ? error.message : "Failed to test spray.");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Spray Servo Configuration</Text>
              <Text style={styles.subtitle}>Test spray functionality</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              disabled={isTesting}
              style={styles.closeButton}
            >
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Spray Time</Text>
            <Text style={styles.infoText}>
              Set the duration in seconds for the spray test.
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>SPRAY TIME (s)</Text>
            <Text style={styles.description}>
              Duration the spray will stay on during the test (e.g. 0.5, 1.2).
            </Text>
            <View style={styles.inputRow}>
              <TouchableOpacity
                style={styles.adjustButton}
                onPress={() => adjustTime(sprayTimeText, setSprayTimeText, -0.1)}
              >
                <Text style={styles.adjustText}>−</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                value={sprayTimeText}
                onChangeText={(text) => setSprayTimeText(text.replace(/[^0-9.]/g, ""))}
                keyboardType="decimal-pad"
                maxLength={4}
              />
              <TouchableOpacity
                style={styles.adjustButton}
                onPress={() => adjustTime(sprayTimeText, setSprayTimeText, 0.1)}
              >
                <Text style={styles.adjustText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, testSuccess && styles.successButton]}
            onPress={handleTest}
            disabled={isTesting}
          >
            {isTesting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.saveText}>
                {testSuccess ? "✓ TEST PASSED" : "SPRAY TEST"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  container: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#111827",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  title: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "700",
  },
  subtitle: {
    color: "#94a3b8",
    marginTop: 4,
    fontSize: 12,
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    color: "#cbd5e1",
    fontSize: 20,
  },
  infoBox: {
    backgroundColor: "#172033",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  infoTitle: {
    color: "#67e8f9",
    fontWeight: "700",
    marginBottom: 6,
  },
  infoText: {
    color: "#cbd5e1",
    fontSize: 13,
    marginTop: 3,
  },
  field: {
    marginBottom: 18,
  },
  label: {
    color: "#ffffff",
    fontWeight: "700",
    marginBottom: 4,
  },
  description: {
    color: "#94a3b8",
    fontSize: 12,
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  adjustButton: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#475569",
  },
  adjustText: {
    color: "#ffffff",
    fontSize: 24,
  },
  input: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#475569",
    backgroundColor: "#0f172a",
    color: "#ffffff",
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
  },
  saveButton: {
    minHeight: 50,
    borderRadius: 11,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },
  successButton: {
    backgroundColor: "#059669",
  },
  saveText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 15,
  },
});

export default ServoConfigModal;
"""
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("ServoConfigModal.tsx updated.")

if __name__ == '__main__':
    update_sprayConfigService()
    update_SettingsScreen()
    update_ServoConfigModal()
