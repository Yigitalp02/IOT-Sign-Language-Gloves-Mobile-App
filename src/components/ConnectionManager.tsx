import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
// import { BleManager, Device } from 'react-native-ble-plx'; // Disabled until hardware arrives

interface ConnectionManagerProps {
  onDeviceConnected?: (deviceId: string) => void;
  onDeviceDisconnected?: () => void;
  onDataReceived?: (data: number[]) => void;
}

export default function ConnectionManager({ 
  onDeviceConnected, 
  onDeviceDisconnected,
  onDataReceived 
}: ConnectionManagerProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [isConnected, setIsConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  // Bluetooth functionality disabled until hardware arrives
  const handleScan = () => {
    Alert.alert(
      t('connection.bluetooth_off_title'),
      'Bluetooth will be enabled when physical glove arrives. Use simulator for now!'
    );
  };

  const handleConnect = () => {
    Alert.alert(
      t('connection.bluetooth_off_title'),
      'Bluetooth will be enabled when physical glove arrives. Use simulator for now!'
    );
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    onDeviceDisconnected?.();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{t('connection.title')}</Text>
        <View style={styles.statusContainer}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: isConnected ? '#34d399' : colors.textSecondary,
                shadowColor: isConnected ? '#34d399' : 'transparent',
              },
            ]}
          />
          <Text style={[styles.statusText, { color: isConnected ? '#34d399' : colors.textSecondary }]}>
            {isConnected ? t('connection.connected') : t('connection.disconnected')}
          </Text>
        </View>
      </View>


      <View style={styles.controls}>
        <TouchableOpacity
          style={[
            styles.scanButton, 
            { 
              backgroundColor: isScanning ? colors.accentPrimary : colors.bgSecondary, 
              borderColor: colors.borderColor 
            }
          ]}
          onPress={handleScan}
          disabled={isConnected || isScanning}
        >
          <Text style={[styles.buttonText, { color: isScanning ? colors.accentText : colors.textPrimary }]}>
            {isScanning ? '⟳' : '↻'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.connectButton,
            {
              backgroundColor: isConnected ? 'rgba(239, 68, 68, 0.1)' : colors.accentPrimary,
              borderColor: isConnected ? '#ef4444' : 'transparent',
              borderWidth: isConnected ? 1 : 0,
            },
          ]}
          onPress={isConnected ? handleDisconnect : handleScan}
          disabled={isScanning}
        >
          <Text
            style={[
              styles.buttonText,
              { color: isConnected ? '#ef4444' : colors.accentText, fontWeight: '600' },
            ]}
          >
            {isConnected ? t('buttons.disconnect') : t('buttons.connect')}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.note, { color: colors.textSecondary }]}>
        {t('connection.note')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  statusText: {
    fontSize: 14,
  },
  deviceName: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  controls: {
    flexDirection: 'row',
    gap: 8,
  },
  scanButton: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
  },
  connectButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 16,
  },
  note: {
    fontSize: 10,
    fontStyle: 'italic',
  },
});
