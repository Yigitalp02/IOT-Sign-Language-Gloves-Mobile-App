import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  FlatList,
  Modal,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { BleManager, Device, State } from 'react-native-ble-plx';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';

// ── BLE UUIDs — must match esp32_thermistor_sketch.ino ──────────────────────
const NUS_SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
const NUS_TX_CHAR_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'; // ESP32 → phone

const SCAN_TIMEOUT_MS = 10_000;

// Singleton — one BleManager for the lifetime of the app
const bleManager = new BleManager();

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Decode a base64 string to UTF-8 text (global atob is available in RN ≥ 0.70) */
function b64ToUtf8(b64: string): string {
  try {
    return atob(b64);
  } catch {
    return '';
  }
}

/**
 * Parse a CSV line like "2700,1650,1800,2100,2050" into a 5-element number array.
 * Returns null if the line is malformed.
 */
function parseCsvLine(line: string): number[] | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(',');
  if (parts.length !== 5) return null;
  const values = parts.map(Number);
  if (values.some(isNaN)) return null;
  return values;
}

// ── Component ────────────────────────────────────────────────────────────────

interface ConnectionManagerProps {
  onDeviceConnected?: (deviceId: string) => void;
  onDeviceDisconnected?: () => void;
  onDataReceived?: (data: number[]) => void;
}

export default function ConnectionManager({
  onDeviceConnected,
  onDeviceDisconnected,
  onDataReceived,
}: ConnectionManagerProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const [bleState, setBleState]           = useState<State>(State.Unknown);
  const [isScanning, setIsScanning]       = useState(false);
  const [foundDevices, setFoundDevices]   = useState<Device[]>([]);
  const [showModal, setShowModal]         = useState(false);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [isConnecting, setIsConnecting]   = useState(false);
  const [statusError, setStatusError]     = useState<string | null>(null);

  // Subscription handles and partial-line buffer
  const dataSubRef       = useRef<{ remove(): void } | null>(null);
  const disconnectSubRef = useRef<{ remove(): void } | null>(null);
  const scanTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lineBufferRef    = useRef('');

  // Keep prop callbacks in refs so inner closures always see the latest version
  const onDataRef         = useRef(onDataReceived);
  const onConnectedRef    = useRef(onDeviceConnected);
  const onDisconnectedRef = useRef(onDeviceDisconnected);
  useEffect(() => { onDataRef.current         = onDataReceived;     }, [onDataReceived]);
  useEffect(() => { onConnectedRef.current    = onDeviceConnected;  }, [onDeviceConnected]);
  useEffect(() => { onDisconnectedRef.current = onDeviceDisconnected; }, [onDeviceDisconnected]);

  // ── BLE adapter state listener ─────────────────────────────────────────────
  useEffect(() => {
    const sub = bleManager.onStateChange(state => setBleState(state), true);
    return () => sub.remove();
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
      bleManager.stopDeviceScan();
      dataSubRef.current?.remove();
      disconnectSubRef.current?.remove();
    };
  }, []);

  // ── Internal helpers ───────────────────────────────────────────────────────

  const stopScanning = useCallback(() => {
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    bleManager.stopDeviceScan();
    setIsScanning(false);
  }, []);

  const cleanupConnection = useCallback(() => {
    dataSubRef.current?.remove();
    dataSubRef.current = null;
    disconnectSubRef.current?.remove();
    disconnectSubRef.current = null;
    lineBufferRef.current = '';
    setConnectedDevice(null);
    onDisconnectedRef.current?.();
  }, []);

  // ── Permissions (Android) ─────────────────────────────────────────────────
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    try {
      if (Platform.Version >= 31) {
        // Android 12+: need BLUETOOTH_SCAN + BLUETOOTH_CONNECT
        const result = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return (
          result['android.permission.BLUETOOTH_SCAN']   === 'granted' &&
          result['android.permission.BLUETOOTH_CONNECT'] === 'granted'
        );
      } else {
        // Android < 12: only location needed for BLE scan
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        return result === 'granted';
      }
    } catch {
      return false;
    }
  }, []);

  // ── Scan ──────────────────────────────────────────────────────────────────
  const handleScan = useCallback(async () => {
    setStatusError(null);

    if (bleState !== State.PoweredOn) {
      Alert.alert(
        t('connection.bluetooth_off_title'),
        t('connection.bluetooth_off_message'),
      );
      return;
    }

    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      Alert.alert(
        t('connection.permission_denied_title'),
        t('connection.permission_denied_message'),
      );
      return;
    }

    setFoundDevices([]);
    setIsScanning(true);
    setShowModal(true);

    // Filter by NUS service UUID so we only show glove devices
    bleManager.startDeviceScan(
      [NUS_SERVICE_UUID],
      { allowDuplicates: false },
      (err, device) => {
        if (err) {
          setStatusError(err.message);
          stopScanning();
          return;
        }
        if (device) {
          setFoundDevices(prev =>
            prev.find(d => d.id === device.id) ? prev : [...prev, device],
          );
        }
      },
    );

    // Auto-stop after timeout
    scanTimerRef.current = setTimeout(stopScanning, SCAN_TIMEOUT_MS);
  }, [bleState, requestPermissions, stopScanning, t]);

  // ── Connect ───────────────────────────────────────────────────────────────
  const handleConnect = useCallback(async (device: Device) => {
    stopScanning();
    setShowModal(false);
    setIsConnecting(true);
    setStatusError(null);

    try {
      const connected  = await device.connect({ timeout: 10_000 });
      const discovered = await connected.discoverAllServicesAndCharacteristics();

      // Subscribe to TX notifications (sensor data stream from ESP32)
      dataSubRef.current = discovered.monitorCharacteristicForService(
        NUS_SERVICE_UUID,
        NUS_TX_CHAR_UUID,
        (err, characteristic) => {
          if (err) {
            // errorCode 2 = BLE_ERROR_DEVICE_DISCONNECTED
            cleanupConnection();
            return;
          }
          if (!characteristic?.value) return;

          // Decode base64 → UTF-8 and buffer partial lines
          lineBufferRef.current += b64ToUtf8(characteristic.value);
          const lines = lineBufferRef.current.split('\n');
          lineBufferRef.current = lines.pop() ?? ''; // keep incomplete trailing line

          for (const line of lines) {
            const sample = parseCsvLine(line);
            if (sample) onDataRef.current?.(sample);
          }
        },
      );

      // Watch for unexpected disconnections
      disconnectSubRef.current = discovered.onDisconnected(() => {
        cleanupConnection();
      });

      setConnectedDevice(discovered);
      onConnectedRef.current?.(discovered.name ?? discovered.id);

      Alert.alert(
        t('connection.connected_title'),
        t('connection.connected_message', {
          name: discovered.name ?? discovered.id,
        }),
      );
    } catch (err: any) {
      const msg: string = err?.message ?? 'Connection failed';
      setStatusError(msg);
      Alert.alert(t('connection.error_title'), t('connection.error_message'));
    } finally {
      setIsConnecting(false);
    }
  }, [stopScanning, cleanupConnection, t]);

  // ── Disconnect ────────────────────────────────────────────────────────────
  const handleDisconnect = useCallback(async () => {
    try {
      if (connectedDevice) await connectedDevice.cancelConnection();
    } catch { /* ignore — device may already be gone */ }
    cleanupConnection();
    Alert.alert(
      t('connection.disconnected_title'),
      t('connection.disconnected_message'),
    );
  }, [connectedDevice, cleanupConnection, t]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const isConnected = connectedDevice !== null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>

      {/* Header row */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {t('connection.title')}
        </Text>
        <View style={styles.statusRow}>
          <View style={[
            styles.dot,
            {
              backgroundColor: isConnected
                ? '#34d399'
                : isConnecting ? '#fbbf24'
                : colors.textSecondary,
            },
          ]} />
          <Text style={[
            styles.statusText,
            {
              color: isConnected
                ? '#34d399'
                : isConnecting ? '#fbbf24'
                : colors.textSecondary,
            },
          ]}>
            {isConnected
              ? (connectedDevice?.name ?? t('connection.connected'))
              : isConnecting
              ? 'Connecting...'
              : t('connection.disconnected')}
          </Text>
        </View>
      </View>

      {/* Bluetooth off banner */}
      {bleState === State.PoweredOff && (
        <View style={[styles.banner, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: '#ef4444' }]}>
          <Text style={styles.bannerTextRed}>Bluetooth is off — please enable it.</Text>
        </View>
      )}

      {/* Error banner */}
      {statusError ? (
        <View style={[styles.banner, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: '#ef4444' }]}>
          <Text style={styles.bannerTextRed}>{statusError}</Text>
        </View>
      ) : null}

      {/* Connect / Disconnect button */}
      <TouchableOpacity
        style={[
          styles.button,
          {
            backgroundColor: isConnected ? 'rgba(239,68,68,0.1)' : colors.accentPrimary,
            borderColor:     isConnected ? '#ef4444' : 'transparent',
            borderWidth:     isConnected ? 1 : 0,
            opacity: isConnecting ? 0.6 : 1,
          },
        ]}
        onPress={isConnected ? handleDisconnect : handleScan}
        disabled={isConnecting}
      >
        {isConnecting ? (
          <ActivityIndicator
            color={isConnected ? '#ef4444' : colors.accentText}
            size="small"
          />
        ) : (
          <Text style={[
            styles.buttonText,
            { color: isConnected ? '#ef4444' : colors.accentText },
          ]}>
            {isConnected ? t('buttons.disconnect') : t('buttons.connect')}
          </Text>
        )}
      </TouchableOpacity>

      {/* ── Device selection modal ── */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowModal(false); stopScanning(); }}
      >
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>

            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
              Select Glove
            </Text>

            {/* Scanning indicator */}
            {isScanning && (
              <View style={styles.scanRow}>
                <ActivityIndicator color={colors.accentPrimary} size="small" />
                <Text style={[styles.scanText, { color: colors.textSecondary }]}>
                  Scanning for ESP32-GloveASL...
                </Text>
              </View>
            )}

            {/* Device list / empty state */}
            {foundDevices.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {isScanning
                  ? 'Make sure the glove is powered on.'
                  : 'No devices found. Power on the glove and try again.'}
              </Text>
            ) : (
              <FlatList
                data={foundDevices}
                keyExtractor={d => d.id}
                style={styles.deviceList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.deviceRow, { borderColor: colors.borderColor }]}
                    onPress={() => handleConnect(item)}
                  >
                    <Text style={[styles.deviceName, { color: colors.textPrimary }]}>
                      {item.name ?? 'Unknown Device'}
                    </Text>
                    <Text style={[styles.deviceSub, { color: colors.textSecondary }]}>
                      {item.id}{'  ·  '}RSSI {item.rssi ?? '?'} dBm
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}

            <TouchableOpacity
              style={[styles.cancelBtn, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}
              onPress={() => { setShowModal(false); stopScanning(); }}
            >
              <Text style={[styles.buttonText, { color: colors.textPrimary }]}>Cancel</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:    { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 16, gap: 10 },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title:        { fontSize: 16, fontWeight: '600' },
  statusRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot:          { width: 8, height: 8, borderRadius: 4 },
  statusText:   { fontSize: 13 },
  banner:       { padding: 10, borderRadius: 8, borderWidth: 1 },
  bannerTextRed:{ color: '#ef4444', fontSize: 12 },
  button:       { padding: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  buttonText:   { fontSize: 15, fontWeight: '600' },
  // Modal
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:        { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, padding: 20, gap: 12 },
  sheetTitle:   { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  scanRow:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scanText:     { fontSize: 13 },
  emptyText:    { fontSize: 13, textAlign: 'center', paddingVertical: 16 },
  deviceList:   { maxHeight: 300 },
  deviceRow:    { padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  deviceName:   { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  deviceSub:    { fontSize: 11 },
  cancelBtn:    { padding: 14, borderRadius: 10, borderWidth: 1, alignItems: 'center', marginTop: 4 },
});
