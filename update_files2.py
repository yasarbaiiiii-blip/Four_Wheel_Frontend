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

export async function setSprayDuration(spray_duration_sec: number): Promise<SprayBasicResponse> {
  if (!Number.isFinite(spray_duration_sec) || spray_duration_sec < 0) {
    throw new Error("Spray duration must be a valid positive number.");
  }
  return apiPost<SprayBasicResponse>("/api/spray/duration", { spray_duration_sec });
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
  setSprayDuration,
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

    c = c.replace(
        'import { getSprayConfig, enableSpray, disableSpray, testSpray } from "../services/sprayConfigService";',
        'import { getSprayConfig, enableSpray, disableSpray, testSpray, setSprayDuration } from "../services/sprayConfigService";'
    )
    c = c.replace(
        'import { getSprayConfig, setSprayConfig } from "../services/sprayConfigService";',
        'import { getSprayConfig, enableSpray, disableSpray, testSpray, setSprayDuration } from "../services/sprayConfigService";'
    )

    new_test_save = """  // Spray Duration Save Handler
  const handleSaveDuration = async (duration: number) => {
    try {
      console.log("[Settings] Saving spray duration:", duration);
      const response = await setSprayDuration(duration);
      if (response.success) {
        setServoSprayDuration(duration);
        setSuccessMessage("Spray duration saved successfully");
        setTimeout(() => setSuccessMessage(""), 3000);
      } else {
        Alert.alert("Save Error", response.message || "Failed to save spray duration");
      }
      return response;
    } catch (error) {
      console.error("[Settings] Spray save error:", error);
      return {
        success: false,
        message: "Failed to save spray duration",
      };
    }
  };

  // Servo Test Handler
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

    test_save_regex = re.compile(r'  // Servo Test Handler.*?// Open Servo Config Modal: always re-fetch fresh config before showing', re.DOTALL)
    c = test_save_regex.sub(new_test_save, c)

    old_modal_usage_regex = re.compile(r'<\s*ServoConfigModal[^>]+onTest=\{handleServoTest\}[^>]*/>')
    new_modal = """<ServoConfigModal
          visible={showServoConfigModal}
          currentConfig={servoConfig}
          onClose={() => setShowServoConfigModal(false)}
          onTest={handleServoTest}
          onSave={handleSaveDuration}
        />"""
    c = old_modal_usage_regex.sub(new_modal, c)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(c)
    print("SettingsScreen.tsx updated.")

def update_ServoConfigModal():
    path = 'src/components/settings/ServoConfigModal.tsx'
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
  onSave: (duration: number) => Promise<{
    success: boolean;
    message?: string;
  }>;
  onTest: (duration: number) => Promise<{
    success: boolean;
    message?: string;
  }>;
}

export const ServoConfigModal: React.FC<ServoConfigModalProps> = ({
  visible,
  currentConfig,
  onClose,
  onSave,
  onTest,
}) => {
  const [sprayTimeText, setSprayTimeText] = useState(
    String(currentConfig.servo_spray_duration),
  );
  const [isTesting, setIsTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSprayTimeText(String(currentConfig.servo_spray_duration));
    setTestSuccess(false);
    setSaveSuccess(false);
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
      setTimeout(() => setTestSuccess(false), 2000);
    } catch (error) {
      Alert.alert("Test Error", error instanceof Error ? error.message : "Failed to test spray.");
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!onSave) return;
    const duration = parseDuration(sprayTimeText);
    if (duration === null) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const response = await onSave(duration);

      if (!response.success) {
        Alert.alert("Save Failed", response.message || "Failed to save spray duration.");
        return;
      }
      setSaveSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (error) {
      Alert.alert("Save Error", error instanceof Error ? error.message : "Failed to save spray duration.");
    } finally {
      setIsSaving(false);
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
              <Text style={styles.subtitle}>Test and save spray duration</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              disabled={isTesting || isSaving}
              style={styles.closeButton}
            >
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Spray Time</Text>
            <Text style={styles.infoText}>
              Set the duration in seconds for the spray test and operation.
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>SPRAY TIME (s)</Text>
            <Text style={styles.description}>
              Duration the spray will stay on (e.g. 0.5, 1.2).
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

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.actionButton, styles.testButton, testSuccess && styles.successButton]}
              onPress={handleTest}
              disabled={isTesting || isSaving}
            >
              {isTesting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.saveText}>
                  {testSuccess ? "✓ TEST PASSED" : "SPRAY TEST"}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.saveButton, saveSuccess && styles.successButton]}
              onPress={handleSave}
              disabled={isTesting || isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.saveText}>
                  {saveSuccess ? "✓ SAVED" : "SAVE"}
                </Text>
              )}
            </TouchableOpacity>
          </View>

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
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  testButton: {
    backgroundColor: "#4f46e5",
  },
  saveButton: {
    backgroundColor: "#059669",
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
