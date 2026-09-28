import React, { useEffect, useState } from "react";
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
