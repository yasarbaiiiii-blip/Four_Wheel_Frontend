import React, { useEffect, useMemo, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { colors } from '../../theme/colors';
import { PATH_PLAN_GLASS, PATH_PLAN_HEADER } from '../../constants/pathPlanGlass';
import { Waypoint } from './types';
import {
  buildMissionReportModel,
  generatePDFHTML,
  generateReportCsv,
  type ReportTiming,
} from '../../utils/exportHelpers';
import { buildMissionReportXlsx } from '../../utils/missionReportXlsx';
import { downloadFileToDevice, getMimeType } from '../../utils/downloadHelper';
import type { WaypointUiStatus } from '../../types/missionWaypointStatus';
import type { RawGnssSurveySnapshot } from '../../services/missionApi';

export type MissionReportExportProps = {
  waypoints: Waypoint[];
  statusMap?: Record<
    number,
    {
      reached?: boolean;
      marked?: boolean;
      status?: WaypointUiStatus;
      timestamp?: string;
      pile?: string | number;
      rowNo?: string | number;
      remark?: string;
      // Frozen RAW GNSS survey-truth snapshot (its radial error is the exported GNSS accuracy).
      survey?: RawGnssSurveySnapshot | null;
      // Accuracy fields
      hrms?: number;
      vrms?: number;
      lat_achieved?: number;
      lon_achieved?: number;
      accuracy_level?: string;
      position_error_cm?: number;
    }
  >;
  missionMode?: string | null;
  onExport: () => void;
  onExportComplete?: () => void;
  /** Fetch the canonical backend report before opening the export modal. */
  fetchExportData?: () => Promise<MissionReportExportProps['statusMap'] | null>;
  /** Mission start / finish from the rover's report, for the total mission time. */
  fetchExportTiming?: () => Promise<ReportTiming | null>;
  /** `glass` — compact HUD toolbar; `default` — legacy filled button */
  variant?: 'default' | 'glass';
  /** Hide the built-in button; open the export modal with `openSignal` instead. */
  hideTrigger?: boolean;
  /** Increment to open the export modal from outside (0 / unset = never). */
  openSignal?: number;
};

const MissionReportExport: React.FC<MissionReportExportProps> = ({
  waypoints,
  statusMap = {},
  missionMode,
  onExport,
  onExportComplete,
  fetchExportData,
  fetchExportTiming,
  variant = 'default',
  hideTrigger = false,
  openSignal = 0,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFetchingReport, setIsFetchingReport] = useState(false);
  const [canonicalStatusMap, setCanonicalStatusMap] = useState<
    MissionReportExportProps['statusMap'] | null
  >(null);
  const [reportTiming, setReportTiming] = useState<ReportTiming | null>(null);
  const [exportFormat, setExportFormat] = useState<'excel' | 'pdf'>('excel');
  const [exportMethod, setExportMethod] = useState<'share' | 'save'>('save');
  const [isDownloading, setIsDownloading] = useState(false);
  const [showFilenameDialog, setShowFilenameDialog] = useState(false);
  const [exportFilename, setExportFilename] = useState('mission_report');

  const exportStatusMap = canonicalStatusMap ?? statusMap;

  const openExportModal = async () => {
    if (fetchExportData || fetchExportTiming) {
      setIsFetchingReport(true);
      try {
        const [next, timing] = await Promise.all([
          fetchExportData ? fetchExportData().catch(() => null) : null,
          fetchExportTiming ? fetchExportTiming().catch(() => null) : null,
        ]);
        if (next && Object.keys(next).length > 0) {
          setCanonicalStatusMap(next);
        }
        if (timing) {
          setReportTiming(timing);
        }
      } catch (error) {
        console.warn('[MissionReportExport] Canonical report fetch failed:', error);
      } finally {
        setIsFetchingReport(false);
      }
    }
    setIsModalOpen(true);
  };

  // External open request (e.g. from the Mission tools export sheet).
  useEffect(() => {
    if (openSignal > 0) {
      void openExportModal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);

  // One model feeds the preview below and every exported file.
  const reportModel = useMemo(
    () =>
      buildMissionReportModel({
        waypoints,
        statusMap: exportStatusMap,
        missionMode,
        timing: reportTiming,
      }),
    [waypoints, exportStatusMap, missionMode, reportTiming],
  );
  const {
    totalPoints,
    completedPoints,
    pendingPoints,
    skippedPoints,
    errorPoints,
    successRate,
    totalMissionTime: missionDuration,
  } = reportModel.stats;

  // Fallback share since Expo managed workflow doesn't support SAF
  // Files are saved to app storage and user can share/export via sharing
  const saveToAppStorage = async (
    fileUri: string,
    filename: string,
    mimeType: string,
  ) => {
    try {
      // In Expo managed workflow, files are saved to app's cache directory
      // Users can access via Share menu or file sharing on their device
      return fileUri;
    } catch (err) {
      console.error("[SAVE ERROR]", err);
      throw err;
    }
  };

  // Download file directly to device storage
  const saveToDeviceStorage = async (
    fileUri: string,
    filename: string,
    mimeType: string,
  ) => {
    try {
      const success = await downloadFileToDevice(fileUri, filename, mimeType);
      return success;
    } catch (err) {
      console.error("[DEVICE SAVE ERROR]", err);
      throw err;
    }
  };

  const handleDownload = async () => {
    // Show filename dialog first
    setShowFilenameDialog(true);
  };

  const handleFilenameConfirm = async () => {
    if (!exportFilename.trim()) {
      Alert.alert('Invalid Filename', 'Please enter a filename.');
      return;
    }

    setShowFilenameDialog(false);
    setIsDownloading(true);

    try {
      // Rebuild at export time so "Generated" is the moment of export.
      const model = buildMissionReportModel({
        waypoints,
        statusMap: exportStatusMap,
        missionMode,
        timing: reportTiming,
      });
      const baseName = exportFilename.trim();

      let fileUri: string;
      let filename: string;
      let mimeType: string;
      let formatName: string;

      if (exportFormat === 'excel') {
        try {
          const workbook = await buildMissionReportXlsx(model);
          filename = `${baseName}.xlsx`;
          fileUri = `${FileSystem.documentDirectory}${filename}`;
          await FileSystem.writeAsStringAsync(fileUri, workbook.base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          mimeType =
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          formatName = 'Excel';
          console.log('[Export] Excel file created:', fileUri);
        } catch (xlsxError) {
          // Never lose the export: fall back to the same ten columns as CSV.
          console.warn('[Export] Excel build failed, writing CSV instead:', xlsxError);
          filename = `${baseName}.csv`;
          fileUri = `${FileSystem.documentDirectory}${filename}`;
          await FileSystem.writeAsStringAsync(fileUri, generateReportCsv(model.rows));
          mimeType = 'text/csv';
          formatName = 'CSV';
        }
      } else {
        console.log('[Export] Generating PDF file...');
        filename = `${baseName}.pdf`;
        // expo-print already saves to a shareable location.
        const { uri } = await Print.printToFileAsync({
          html: generatePDFHTML(model),
        });
        fileUri = uri;
        mimeType = 'application/pdf';
        formatName = 'PDF';
        console.log('[Export] PDF file created:', fileUri);
      }

      // Handle export based on selected method
      if (exportMethod === 'save') {
        // SAVE: Open save dialog to save to Downloads/Files
        console.log('[Export] Opening save dialog:', filename);
        try {
          const saved = await saveToDeviceStorage(fileUri, filename, mimeType);

          if (saved) {
            console.log('[Export] Save dialog opened successfully');
            onExport();
            onExportComplete?.();
            setIsModalOpen(false);
          } else {
            // User cancelled - just close modal quietly
            console.log('[Export] User cancelled save dialog');
            setIsModalOpen(false);
          }
        } catch (saveError) {
          console.error('[Export] Save error:', saveError);
          Alert.alert(
            'Save Failed',
            'Could not open save dialog. Try the "Share" option instead.',
            [
              {
                text: 'Use Share Instead',
                onPress: async () => {
                  try {
                    const canShare = await Sharing.isAvailableAsync();
                    if (canShare) {
                      await Sharing.shareAsync(fileUri, {
                        mimeType,
                        dialogTitle: 'Export Mission Report',
                      });
                    }
                  } catch (shareError) {
                    console.error('[Export] Share fallback error:', shareError);
                  }
                },
              },
              { text: 'Cancel', style: 'cancel' },
            ]
          );
        }
      } else {
        // SHARE: Open sharing menu for apps, cloud, email, etc.
        console.log('[Export] Opening share menu for:', filename);
        try {
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(fileUri, {
              mimeType,
              dialogTitle: 'Export Mission Report',
            });

            Alert.alert(
              'File Ready to Share',
              `${formatName} file ready!\n\nFilename: ${filename}`,
            );
          } else {
            Alert.alert(
              'Sharing Not Available',
              `File saved locally.\n\nFilename: ${filename}`,
            );
          }

          onExport();
          onExportComplete?.();
          setIsModalOpen(false);
        } catch (shareError) {
          console.error('[Export] Share error:', shareError);
          // Don't throw - just log and close
          if (
            shareError instanceof Error &&
            !shareError.message.includes('cancel')
          ) {
            Alert.alert(
              'Share Failed',
              'Could not open share dialog. File is saved locally in app cache.',
            );
          }
          setIsModalOpen(false);
        }
      }

      setIsDownloading(false);
    } catch (error) {
      console.error('[Export] Error:', error);
      console.error(
        '[Export] Stack:',
        error instanceof Error ? error.stack : 'No stack trace',
      );
      Alert.alert(
        'Export Error',
        `Failed to generate report: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      setIsDownloading(false);
    }
  };

  return (
    <>
      {/* Export Button */}
      {!hideTrigger && (
      <TouchableOpacity
        style={variant === 'glass' ? styles.exportButtonGlass : styles.exportButton}
        onPress={() => {
          void openExportModal();
        }}
        disabled={isFetchingReport}
        activeOpacity={0.7}
        accessibilityLabel="Export mission report"
      >
        {variant === 'glass' ? (
          <>
            <MaterialCommunityIcons name="file-export-outline" size={14} color={PATH_PLAN_GLASS.cyan} />
            <Text style={styles.exportButtonTextGlass}>Export</Text>
          </>
        ) : (
          <>
            <Text style={styles.exportIcon}>📊</Text>
            <Text style={styles.exportButtonText}>Export Report</Text>
          </>
        )}
      </TouchableOpacity>
      )}

      {/* Export Modal */}
      <Modal
        visible={isModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Export Mission Report</Text>
              <TouchableOpacity
                onPress={() => setIsModalOpen(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Preview Section */}
              <View style={styles.previewSection}>
                <Text style={styles.previewTitle}>Report Preview</Text>
                <View style={styles.previewGrid}>
                  <View style={styles.previewItem}>
                    <Text style={styles.previewLabel}>Total Waypoints:</Text>
                    <Text style={styles.previewValue}>{totalPoints}</Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={styles.previewLabel}>Completed:</Text>
                    <Text style={[styles.previewValue, styles.successText]}>
                      {completedPoints}
                    </Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={styles.previewLabel}>Pending:</Text>
                    <Text style={[styles.previewValue, styles.warningText]}>
                      {pendingPoints}
                    </Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={styles.previewLabel}>Errors:</Text>
                    <Text style={[styles.previewValue, styles.errorText]}>
                      {errorPoints}
                    </Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={styles.previewLabel}>Skipped:</Text>
                    <Text style={[styles.previewValue, styles.warningText]}>
                      {skippedPoints}
                    </Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={styles.previewLabel}>Success Rate:</Text>
                    <Text style={[styles.previewValue, styles.successText]}>
                      {successRate}%
                    </Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={styles.previewLabel}>Total mission time:</Text>
                    <Text style={styles.previewValue}>{missionDuration}</Text>
                  </View>
                </View>
              </View>

              {/* Export Method Selection */}
              <View style={styles.formatSection}>
                <Text style={styles.sectionTitle}>
                  How would you like to export?
                </Text>

                <TouchableOpacity
                  style={[
                    styles.formatOption,
                    exportMethod === 'save' && styles.formatOptionSelected,
                  ]}
                  onPress={() => setExportMethod('save')}
                  disabled={isDownloading}
                >
                  <View style={styles.formatRadio}>
                    {exportMethod === 'save' && (
                      <View style={styles.formatRadioInner} />
                    )}
                  </View>
                  <View style={styles.formatInfo}>
                    <View style={styles.formatHeader}>
                      <Text style={styles.formatIcon}>💾</Text>
                      <Text style={styles.formatTitle}>
                        Save to File Manager
                      </Text>
                    </View>
                    <Text style={styles.formatDescription}>
                      Download directly to your device storage (Downloads folder on Android, Documents on iOS)
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.formatOption,
                    exportMethod === 'share' && styles.formatOptionSelected,
                  ]}
                  onPress={() => setExportMethod('share')}
                  disabled={isDownloading}
                >
                  <View style={styles.formatRadio}>
                    {exportMethod === 'share' && (
                      <View style={styles.formatRadioInner} />
                    )}
                  </View>
                  <View style={styles.formatInfo}>
                    <View style={styles.formatHeader}>
                      <Text style={styles.formatIcon}>📤</Text>
                      <Text style={styles.formatTitle}>Share with Apps</Text>
                    </View>
                    <Text style={styles.formatDescription}>
                      Send to WhatsApp, Email, Google Drive, or any installed
                      app
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Format Selection */}
              <View style={styles.formatSection}>
                <Text style={styles.sectionTitle}>Select Export Format</Text>

                <TouchableOpacity
                  style={[
                    styles.formatOption,
                    exportFormat === 'excel' && styles.formatOptionSelected,
                  ]}
                  onPress={() => setExportFormat('excel')}
                  disabled={isDownloading}
                >
                  <View style={styles.formatRadio}>
                    {exportFormat === 'excel' && (
                      <View style={styles.formatRadioInner} />
                    )}
                  </View>
                  <View style={styles.formatInfo}>
                    <View style={styles.formatHeader}>
                      <Text style={styles.formatIcon}>📊</Text>
                      <Text style={styles.formatTitle}>
                        Excel Format (.xlsx)
                      </Text>
                    </View>
                    <Text style={styles.formatDescription}>
                      Professional report with formatting - opens in
                      Excel/Sheets
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.formatOption,
                    exportFormat === 'pdf' && styles.formatOptionSelected,
                  ]}
                  onPress={() => setExportFormat('pdf')}
                  disabled={isDownloading}
                >
                  <View style={styles.formatRadio}>
                    {exportFormat === 'pdf' && (
                      <View style={styles.formatRadioInner} />
                    )}
                  </View>
                  <View style={styles.formatInfo}>
                    <View style={styles.formatHeader}>
                      <Text style={styles.formatIcon}>📄</Text>
                      <Text style={styles.formatTitle}>PDF Format (.pdf)</Text>
                    </View>
                    <Text style={styles.formatDescription}>
                      Professional printable document - ready to share
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={() => setIsModalOpen(false)}
                  disabled={isDownloading}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.button,
                    styles.downloadButton,
                    (isDownloading || waypoints.length === 0) &&
                      styles.downloadButtonDisabled,
                  ]}
                  onPress={handleDownload}
                  disabled={isDownloading || waypoints.length === 0}
                >
                  {isDownloading ? (
                    <View style={styles.downloadContent}>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.downloadButtonText}>
                        Generating {exportFormat === 'excel' ? 'Excel' : 'PDF'}
                        ...
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.downloadContent}>
                      <Text style={styles.downloadIcon}>
                        {exportMethod === 'save' ? '💾' : '📤'}
                      </Text>
                      <Text style={styles.downloadButtonText}>
                        {exportMethod === 'save' ? 'Save' : 'Share'}{' '}
                        {exportFormat === 'excel' ? 'Excel' : 'PDF'}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Filename input modal */}
      <Modal visible={showFilenameDialog} transparent animationType="fade" onRequestClose={() => setShowFilenameDialog(false)}>
        <View style={styles.filenameModalOverlay}>
          <View style={styles.filenameModalContent}>
            <Text style={styles.filenameModalTitle}>Enter Filename</Text>
            <Text style={styles.filenameHint}>
              {exportFormat === 'excel' && 'Format: Excel (.xlsx)'}
              {exportFormat === 'pdf' && 'Format: PDF (.pdf)'}
            </Text>
            <TextInput
              style={styles.filenameInput}
              placeholder="Enter filename"
              placeholderTextColor="#888"
              value={exportFilename}
              onChangeText={setExportFilename}
              maxLength={50}
            />
            <View style={styles.filenameButtonsRow}>
              <TouchableOpacity style={[styles.filenameButton, styles.confirmBtn]} onPress={handleFilenameConfirm}>
                <Text style={styles.filenameButtonText}>Export</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.filenameButton, styles.cancelBtn]} onPress={() => setShowFilenameDialog(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  exportButton: {
    flexDirection: 'row',
    backgroundColor: colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    gap: 8,
  },
  exportButtonGlass: {
    ...PATH_PLAN_HEADER.actionBtn,
    ...PATH_PLAN_HEADER.actionBtnAccent,
  },
  exportIcon: {
    fontSize: 14,
  },
  exportButtonText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  exportButtonTextGlass: {
    ...PATH_PLAN_HEADER.actionBtnText,
    ...PATH_PLAN_HEADER.actionBtnTextAccent,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#001F3F',
    borderRadius: 12,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.3)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(103, 232, 249, 0.2)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 28,
    color: colors.textSecondary,
    lineHeight: 28,
  },
  previewSection: {
    margin: 20,
    backgroundColor: '#002244',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.2)',
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#67E8F9',
    marginBottom: 12,
  },
  previewGrid: {
    gap: 12,
  },
  previewItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  previewValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  successText: {
    color: '#10B981',
  },
  warningText: {
    color: '#F59E0B',
  },
  errorText: {
    color: '#EF4444',
  },
  formatSection: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  formatOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#002244',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(103, 232, 249, 0.3)',
    marginBottom: 12,
  },
  formatOptionSelected: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  formatRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.textSecondary,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formatRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
  },
  formatInfo: {
    flex: 1,
  },
  formatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  formatIcon: {
    fontSize: 16,
  },
  formatTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  formatDescription: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#003366',
  },
  cancelButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  downloadButton: {
    backgroundColor: '#10B981',
  },
  downloadButtonDisabled: {
    backgroundColor: '#003366',
    opacity: 0.5,
  },
  downloadContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  downloadIcon: {
    fontSize: 16,
  },
  downloadButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  filenameModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  filenameModalContent: {
    backgroundColor: '#001F3F',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.3)',
  },
  filenameModalTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  filenameHint: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 12,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  filenameInput: {
    backgroundColor: '#002244',
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    marginBottom: 16,
    fontSize: 14,
  },
  filenameButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filenameButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtn: {
    backgroundColor: '#10B981',
  },
  cancelBtn: {
    backgroundColor: '#003366',
  },
  filenameButtonText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  cancelBtnText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
});

export default MissionReportExport;
