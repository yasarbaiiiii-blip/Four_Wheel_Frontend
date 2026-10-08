import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  EMPTY_RTK_PROFILE_FORM,
  buildRtkProfileCreateRequest,
  buildRtkProfileUpdateRequest,
  editorNeedsTlsDisabledConfirmation,
  editorWarnsForcedStop,
  profileToEditorForm,
  validateRtkProfileForm,
  type RtkProfileEditorForm,
} from "../../adapters/rtkProfileFormAdapter";
import type { RtkDesiredState, RtkProfile } from "../../types/rtk";
import { colors } from "../../theme/colors";

interface Props {
  mode: "create" | "edit" | "idle";
  profile: RtkProfile | null;
  activeProfileId: number | null;
  desiredState: RtkDesiredState | null;
  busy?: boolean;
  disabled?: boolean;
  disabledReason?: string | null;
  canStart?: boolean;
  canStop?: boolean;
  canDelete?: boolean;
  onCreate: (dto: ReturnType<typeof buildRtkProfileCreateRequest>) => Promise<unknown>;
  onUpdate: (
    id: number,
    dto: ReturnType<typeof buildRtkProfileUpdateRequest>,
  ) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  onActivate: (id: number) => Promise<unknown>;
  onClearActive: () => Promise<unknown>;
  onStart: () => Promise<unknown>;
  onStop: () => Promise<unknown>;
}

export const RtkProfileEditor: React.FC<Props> = ({
  mode,
  profile,
  activeProfileId,
  desiredState,
  busy = false,
  disabled = false,
  disabledReason,
  canStart = false,
  canStop = false,
  canDelete = false,
  onCreate,
  onUpdate,
  onDelete,
  onActivate,
  onClearActive,
  onStart,
  onStop,
}) => {
  const [form, setForm] = useState<RtkProfileEditorForm>(EMPTY_RTK_PROFILE_FORM);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errors, setErrors] = useState<ReturnType<typeof validateRtkProfileForm>>({});

  useEffect(() => {
    if (mode === "edit" && profile) {
      setForm(profileToEditorForm(profile));
      setErrors({});
      return;
    }
    if (mode === "create") {
      setForm(EMPTY_RTK_PROFILE_FORM);
      setErrors({});
    }
  }, [mode, profile]);

  const title = useMemo(() => {
    if (mode === "create") return "Create profile";
    if (mode === "edit" && profile) return `Edit ${profile.name}`;
    return "Select or create a profile";
  }, [mode, profile]);

  const setField = <K extends keyof RtkProfileEditorForm>(
    key: K,
    value: RtkProfileEditorForm[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const confirmTlsIfNeeded = async (): Promise<boolean> => {
    if (!editorNeedsTlsDisabledConfirmation(form.tls_mode, profile?.tls_mode)) {
      return true;
    }
    return new Promise((resolve) => {
      Alert.alert(
        "Disable TLS?",
        "Credentials will be sent over plaintext NTRIP. REQUIRED TLS is the secure default.",
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Use plaintext", style: "destructive", onPress: () => resolve(true) },
        ],
      );
    });
  };

  const confirmForcedStopIfNeeded = async (
    patch: ReturnType<typeof buildRtkProfileUpdateRequest>,
  ): Promise<boolean> => {
    if (!profile || !editorWarnsForcedStop(patch, profile, activeProfileId, desiredState)) {
      return true;
    }
    return new Promise((resolve) => {
      Alert.alert(
        "Stop RTK to apply?",
        "This change is runtime-significant. The backend will force the active profile to STOPPED.",
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Save and stop", style: "destructive", onPress: () => resolve(true) },
        ],
      );
    });
  };

  const handleSave = async () => {
    const nextErrors = validateRtkProfileForm(form, mode === "create" ? "create" : "edit");
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    if (!(await confirmTlsIfNeeded())) {
      return;
    }
    if (mode === "create") {
      await onCreate(buildRtkProfileCreateRequest(form));
      return;
    }
    if (mode === "edit" && profile) {
      const patch = buildRtkProfileUpdateRequest(form, profile);
      if (!(await confirmForcedStopIfNeeded(patch))) {
        return;
      }
      await onUpdate(profile.id, patch);
    }
  };

  const handleDelete = () => {
    if (!profile) return;
    Alert.alert("Delete profile?", `${profile.name} will be removed from the rover.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void onDelete(profile.id);
        },
      },
    ]);
  };

  if (mode === "idle") {
    return (
      <View style={styles.idle}>
        <Text style={styles.idleTitle}>No profile selected</Text>
        <Text style={styles.idleBody}>
          Choose a backend profile or create one. Mission Progress never sends
          NTRIP credentials.
        </Text>
      </View>
    );
  }

  const controlsDisabled = disabled || busy;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {disabledReason ? <Text style={styles.reason}>{disabledReason}</Text> : null}
      {profile && profile.id === activeProfileId ? (
        <View style={styles.activeBannerContainer}>
          <View style={styles.activeBanner}>
            <View style={styles.activeDot} />
            <Text style={styles.activeBannerText}>
              ACTIVE PROFILE — Currently streaming RTK corrections
            </Text>
          </View>
          <View style={styles.defaultBanner}>
            <Text style={styles.defaultBannerText}>
              ★ DEFAULT PROFILE — Automatically used on rover boot
            </Text>
          </View>
        </View>
      ) : null}

      <ScrollView style={styles.form} contentContainerStyle={styles.formContent}>
        <Field
          label="Name"
          value={form.name}
          onChange={(value) => setField("name", value)}
          error={errors.name}
          editable={!controlsDisabled}
        />
        <Field
          label="Caster host"
          value={form.caster_host}
          onChange={(value) => setField("caster_host", value)}
          error={errors.caster_host}
          autoCapitalize="none"
          editable={!controlsDisabled}
        />
        <Field
          label="Port"
          value={form.caster_port}
          onChange={(value) => setField("caster_port", value)}
          error={errors.caster_port}
          keyboardType="numeric"
          editable={!controlsDisabled}
        />
        <Field
          label="Mountpoint"
          value={form.mountpoint}
          onChange={(value) => setField("mountpoint", value)}
          error={errors.mountpoint}
          autoCapitalize="none"
          editable={!controlsDisabled}
        />
        <Field
          label="Username"
          value={form.username}
          onChange={(value) => setField("username", value)}
          error={errors.username}
          autoCapitalize="none"
          editable={!controlsDisabled}
        />
        <Field
          label={mode === "create" ? "Password" : "Password (leave blank to keep)"}
          value={form.password}
          onChange={(value) => setField("password", value)}
          error={errors.password}
          autoCapitalize="none"
          secureTextEntry
          editable={!controlsDisabled}
        />

        <Text style={styles.label}>TLS</Text>
        <View style={styles.tlsRow}>
          <Pressable
            disabled={controlsDisabled}
            onPress={() => setField("tls_mode", "REQUIRED")}
            style={[
              styles.tlsButton,
              form.tls_mode === "REQUIRED" && styles.tlsSelected,
            ]}
          >
            <Text style={styles.tlsText}>REQUIRED</Text>
          </Pressable>
          <Pressable
            disabled={controlsDisabled}
            onPress={() => setField("tls_mode", "DISABLED")}
            style={[
              styles.tlsButton,
              form.tls_mode === "DISABLED" && styles.tlsDanger,
            ]}
          >
            <Text style={styles.tlsText}>DISABLED</Text>
          </Pressable>
        </View>
        {form.tls_mode === "DISABLED" ? (
          <Text style={styles.warn}>
            DISABLED sends NTRIP credentials over plaintext. Confirm before saving.
          </Text>
        ) : null}

        <View style={styles.switchRow}>
          <Text style={styles.label}>Enabled</Text>
          <Switch
            value={form.enabled}
            onValueChange={(value) => setField("enabled", value)}
            disabled={controlsDisabled}
          />
        </View>

        <Pressable
          onPress={() => setShowAdvanced((value) => !value)}
          style={styles.advancedToggle}
        >
          <Text style={styles.advancedText}>
            {showAdvanced ? "Hide advanced" : "Advanced"}
          </Text>
        </Pressable>

        {showAdvanced ? (
          <View style={styles.advanced}>
            <View style={styles.switchRow}>
              <Text style={styles.label}>GGA / VRS</Text>
              <Switch
                value={form.gga_enabled}
                onValueChange={(value) => setField("gga_enabled", value)}
                disabled={controlsDisabled}
              />
            </View>
            <Field
              label="GGA interval (s)"
              value={form.gga_interval_sec}
              onChange={(value) => setField("gga_interval_sec", value)}
              error={errors.gga_interval_sec}
              keyboardType="decimal-pad"
              editable={!controlsDisabled}
            />
            <Field
              label="GGA max age (s)"
              value={form.gga_max_age_sec}
              onChange={(value) => setField("gga_max_age_sec", value)}
              error={errors.gga_max_age_sec}
              keyboardType="decimal-pad"
              editable={!controlsDisabled}
            />
            <Field
              label="Connect timeout (s)"
              value={form.connect_timeout_sec}
              onChange={(value) => setField("connect_timeout_sec", value)}
              error={errors.connect_timeout_sec}
              keyboardType="decimal-pad"
              editable={!controlsDisabled}
            />
            <Field
              label="Socket timeout (s)"
              value={form.socket_timeout_sec}
              onChange={(value) => setField("socket_timeout_sec", value)}
              error={errors.socket_timeout_sec}
              keyboardType="decimal-pad"
              editable={!controlsDisabled}
            />
            <Field
              label="Healthy age (s)"
              value={form.healthy_age_sec}
              onChange={(value) => setField("healthy_age_sec", value)}
              error={errors.healthy_age_sec}
              keyboardType="decimal-pad"
              editable={!controlsDisabled}
            />
            <Field
              label="Stale reconnect (s)"
              value={form.stale_reconnect_sec}
              onChange={(value) => setField("stale_reconnect_sec", value)}
              error={errors.stale_reconnect_sec}
              keyboardType="decimal-pad"
              editable={!controlsDisabled}
            />
            <Field
              label="Reconnect delay (s)"
              value={form.reconnect_delay_sec}
              onChange={(value) => setField("reconnect_delay_sec", value)}
              error={errors.reconnect_delay_sec}
              keyboardType="decimal-pad"
              editable={!controlsDisabled}
            />
            <Field
              label="First data timeout (s)"
              value={form.first_data_timeout_sec}
              onChange={(value) => setField("first_data_timeout_sec", value)}
              error={errors.first_data_timeout_sec}
              keyboardType="decimal-pad"
              editable={!controlsDisabled}
            />
            <Field
              label="Max RTCM frame bytes"
              value={form.max_mavros_rtcm_frame_bytes}
              onChange={(value) => setField("max_mavros_rtcm_frame_bytes", value)}
              error={errors.max_mavros_rtcm_frame_bytes}
              keyboardType="numeric"
              editable={!controlsDisabled}
            />
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          onPress={() => void handleSave()}
          disabled={controlsDisabled}
          style={[styles.action, styles.save, controlsDisabled && styles.disabled]}
        >
          <Text style={styles.actionText}>{mode === "create" ? "Create" : "Save"}</Text>
        </Pressable>
        {profile ? (
          <Pressable
            onPress={() => void onActivate(profile.id)}
            disabled={controlsDisabled || profile.id === activeProfileId}
            style={[
              styles.action,
              profile.id === activeProfileId ? styles.defaultActive : styles.secondary,
              (controlsDisabled || profile.id === activeProfileId) && styles.disabled,
            ]}
          >
            <View style={styles.buttonContent}>
              {profile.id === activeProfileId ? (
                <View style={styles.buttonActiveDot} />
              ) : null}
              <Text
                style={[
                  styles.actionText,
                  profile.id !== activeProfileId && styles.secondaryText,
                ]}
              >
                {profile.id === activeProfileId ? "★ Default (Active)" : "Set as Default"}
              </Text>
            </View>
          </Pressable>
        ) : null}
        {profile && profile.id === activeProfileId ? (
          <Pressable
            onPress={() => void onClearActive()}
            disabled={controlsDisabled}
            style={[styles.action, styles.clearBtn, controlsDisabled && styles.disabled]}
          >
            <Text style={styles.clearBtnText}>Clear Default</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => void onStart()}
          disabled={!canStart || controlsDisabled}
          style={[
            styles.action,
            styles.save,
            (!canStart || controlsDisabled) && styles.disabled,
          ]}
        >
          <Text style={styles.actionText}>Start</Text>
        </Pressable>
        <Pressable
          onPress={() => void onStop()}
          disabled={!canStop || controlsDisabled}
          style={[
            styles.action,
            styles.stop,
            (!canStop || controlsDisabled) && styles.disabled,
          ]}
        >
          <Text style={styles.actionText}>Stop</Text>
        </Pressable>
        {profile ? (
          <Pressable
            onPress={handleDelete}
            disabled={!canDelete || controlsDisabled}
            style={[
              styles.action,
              styles.stop,
              (!canDelete || controlsDisabled) && styles.disabled,
            ]}
          >
            <Text style={styles.actionText}>Delete</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  editable?: boolean;
  autoCapitalize?: "none" | "sentences";
  keyboardType?: "default" | "numeric" | "decimal-pad";
  secureTextEntry?: boolean;
}> = ({
  label,
  value,
  onChange,
  error,
  editable = true,
  autoCapitalize = "sentences",
  keyboardType = "default",
  secureTextEntry,
}) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChange}
      editable={editable}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      keyboardType={keyboardType}
      secureTextEntry={secureTextEntry}
      style={styles.input}
      placeholderTextColor="#94A3B8"
    />
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minWidth: 320,
    backgroundColor: "#FFFFFF",
  },
  idle: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#FFFFFF",
  },
  idleTitle: {
    color: "#10244B",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
  },
  idleBody: {
    color: "#526B93",
    textAlign: "center",
    lineHeight: 20,
    fontSize: 13,
  },
  title: {
    color: "#10244B",
    fontSize: 16,
    fontWeight: "800",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  reason: {
    color: "#D97706",
    paddingHorizontal: 16,
    paddingTop: 4,
    fontSize: 12,
  },
  activeBannerContainer: {
    marginHorizontal: 14,
    marginBottom: 10,
    gap: 6,
  },
  activeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#E6F8F1",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#16B980",
  },
  activeBannerText: {
    color: "#059669",
    fontSize: 12,
    fontWeight: "800",
  },
  defaultBanner: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  defaultBannerText: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "700",
  },
  form: {
    flex: 1,
  },
  formContent: {
    padding: 16,
    paddingBottom: 28,
    gap: 10,
  },
  field: {
    gap: 4,
  },
  label: {
    color: "#526B93",
    fontSize: 12,
    fontWeight: "700",
  },
  input: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DDE8F7",
    backgroundColor: "#F8FAFC",
    color: "#10244B",
    paddingHorizontal: 12,
    fontSize: 14,
  },
  error: {
    color: "#EF4444",
    fontSize: 12,
  },
  tlsRow: {
    flexDirection: "row",
    gap: 8,
  },
  tlsButton: {
    minHeight: 46,
    flex: 1,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#DDE8F7",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  tlsSelected: {
    borderColor: "#16B980",
    backgroundColor: "#E6F8F1",
  },
  tlsDanger: {
    borderColor: "#EF4444",
    backgroundColor: "#FEE2E2",
  },
  tlsText: {
    color: "#10244B",
    fontWeight: "800",
  },
  warn: {
    color: "#D97706",
    fontSize: 12,
    lineHeight: 18,
  },
  switchRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  advancedToggle: {
    minHeight: 40,
    justifyContent: "center",
  },
  advancedText: {
    color: "#1475EE",
    fontWeight: "700",
    fontSize: 13,
  },
  advanced: {
    gap: 10,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#DDE8F7",
  },
  action: {
    minHeight: 42,
    minWidth: 96,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  buttonActiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
  },
  save: {
    backgroundColor: "#1475EE",
  },
  secondary: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  secondaryText: {
    color: "#1E293B",
  },
  clearBtn: {
    backgroundColor: "#FFF1F2",
    borderWidth: 1,
    borderColor: "#FECDD3",
  },
  clearBtnText: {
    color: "#E11D48",
    fontWeight: "800",
    fontSize: 13,
  },
  stop: {
    backgroundColor: "#EF4444",
  },
  actionText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
  },
  defaultActive: {
    backgroundColor: "#16B980",
  },
  disabled: {
    opacity: 0.45,
  },
});
