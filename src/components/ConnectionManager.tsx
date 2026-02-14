import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, PermissionsAndroid, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { BleManager, Device } from 'react-native-ble-plx';

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
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [bleManager] = useState(() => new BleManager());

  useEffect(() => {
    requestPermissions();
    return () => {
      bleManager.destroy();
    };
  }, []);

  const requestPermissions = async () => {
    if (Platform.OS === 'android' && Platform.Version >= 23) {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        
        const allGranted = Object.values(granted).every(
          status => status === PermissionsAndroid.RESULTS.GRANTED
        );
        
        if (!allGranted) {
          Alert.alert(
            t('connection.permission_denied_title'),
            t('connection.permission_denied_message')
          );
        }
      } catch (error) {
        console.error('Permission error:', error);
      }
    }
  };

  const handleScan = async () => {
    setIsScanning(true);
    
    try {
      const state = await bleManager.state();
      if (state !== 'PoweredOn') {
        Alert.alert(
          t('connection.bluetooth_off_title'),
          t('connection.bluetooth_off_message')
        );
        setIsScanning(false);
        return;
      }

      // Scan for devices with "ASL" or "Glove" in name
      bleManager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          console.error('Scan error:', error);
          setIsScanning(false);
          return;
        }

        if (device?.name && (device.name.includes('ASL') || device.name.includes('Glove'))) {
          bleManager.stopDeviceScan();
          handleConnect(device);
        }
      });

      // Stop scanning after 10 seconds
      setTimeout(() => {
        bleManager.stopDeviceScan();
        setIsScanning(false);
      }, 10000);
    } catch (error) {
      console.error('Scan initiation error:', error);
      setIsScanning(false);
    }
  };

  const handleConnect = async (device: Device) => {
    try {
      setIsScanning(false);
      const connected = await device.connect();
      await connected.discoverAllServicesAndCharacteristics();
      
      setConnectedDevice(connected);
      setIsConnected(true);
      onDeviceConnected?.(connected.id);

      // TODO: Subscribe to characteristics when hardware is ready
      // const services = await connected.services();
      // Find sensor data characteristic and monitor it
      
      Alert.alert(
        t('connection.connected_title'),
        t('connection.connected_message', { name: device.name || 'ASL Glove' })
      );
    } catch (error) {
      console.error('Connection error:', error);
      Alert.alert(
        t('connection.error_title'),
        t('connection.error_message')
      );
    }
  };

  const handleDisconnect = async () => {
    if (connectedDevice) {
      try {
        await connectedDevice.cancelConnection();
        setConnectedDevice(null);
        setIsConnected(false);
        onDeviceDisconnected?.();
        
        Alert.alert(
          t('connection.disconnected_title'),
          t('connection.disconnected_message')
        );
      } catch (error) {
        console.error('Disconnection error:', error);
      }
    }
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

      {connectedDevice && (
        <Text style={[styles.deviceName, { color: colors.textSecondary }]}>
          {connectedDevice.name || connectedDevice.id}
        </Text>
      )}

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
