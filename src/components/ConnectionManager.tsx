import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import TcpSocket from 'react-native-tcp-socket';
import { useTheme } from '../context/ThemeContext';

const DEFAULT_HOST = 'glove.local';
const DEFAULT_PORT = '3333';

/**
 * Parse a sensor line from the ESP32 TCP stream.
 * Accepts both formats:
 *   5-value  "thumb,index,middle,ring,pinky"           (flex only)
 *   9-value  "thumb,index,middle,ring,pinky,qw,qx,qy,qz"  (flex + IMU)
 * Returns the 5 flex values only (IMU forwarding can be added later).
 */
function parseSensorLine(line: string): number[] | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(',');
  if (parts.length !== 5 && parts.length !== 9) return null;
  const values = parts.map(Number);
  if (values.some(isNaN)) return null;
  return values; // return all values (5 flex or 9 flex+IMU)
}

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
  const { colors } = useTheme();

  const [host, setHost]               = useState(DEFAULT_HOST);
  const [port, setPort]               = useState(DEFAULT_PORT);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Socket and line-buffer refs — safe to use inside event callbacks
  const socketRef       = useRef<ReturnType<typeof TcpSocket.createConnection> | null>(null);
  const lineBufferRef   = useRef('');
  const wasConnectedRef = useRef(false); // tracks whether we reached connected state

  // Stable prop refs so closures always see the latest callbacks
  const onDataRef         = useRef(onDataReceived);
  const onConnectedRef    = useRef(onDeviceConnected);
  const onDisconnectedRef = useRef(onDeviceDisconnected);
  useEffect(() => { onDataRef.current         = onDataReceived;     }, [onDataReceived]);
  useEffect(() => { onConnectedRef.current    = onDeviceConnected;  }, [onDeviceConnected]);
  useEffect(() => { onDisconnectedRef.current = onDeviceDisconnected; }, [onDeviceDisconnected]);

  // Destroy socket on unmount
  useEffect(() => {
    return () => { socketRef.current?.destroy(); };
  }, []);

  const cleanupConnection = useCallback((callDisconnectCb: boolean) => {
    socketRef.current?.destroy();
    socketRef.current    = null;
    lineBufferRef.current = '';
    wasConnectedRef.current = false;
    setIsConnected(false);
    setIsConnecting(false);
    if (callDisconnectCb) onDisconnectedRef.current?.();
  }, []);

  const handleConnect = useCallback(() => {
    setStatusError(null);
    const portNum = parseInt(port, 10);
    if (!host.trim() || isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setStatusError('Enter a valid host and port.');
      return;
    }

    setIsConnecting(true);

    const socket = TcpSocket.createConnection(
      { host: host.trim(), port: portNum, tls: false },
      () => {
        // TCP handshake succeeded
        wasConnectedRef.current = true;
        setIsConnected(true);
        setIsConnecting(false);
        setStatusError(null);
        onConnectedRef.current?.(`${host.trim()}:${port}`);
      },
    );

    socket.on('data', (raw: Buffer | string) => {
      const text = typeof raw === 'string' ? raw : raw.toString('utf8');
      lineBufferRef.current += text;
      const lines = lineBufferRef.current.split('\n');
      lineBufferRef.current = lines.pop() ?? '';
      for (const line of lines) {
        const sample = parseSensorLine(line);
        if (sample) onDataRef.current?.(sample);
      }
    });

    socket.on('error', (err: Error) => {
      setStatusError(err.message);
      cleanupConnection(wasConnectedRef.current);
    });

    socket.on('close', () => {
      cleanupConnection(wasConnectedRef.current);
    });

    socketRef.current = socket;
  }, [host, port, cleanupConnection]);

  const handleDisconnect = useCallback(() => {
    cleanupConnection(true);
  }, [cleanupConnection]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>WiFi Connection</Text>
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
              ? `${host.trim()}:${port}`
              : isConnecting
              ? 'Connecting...'
              : 'Disconnected'}
          </Text>
        </View>
      </View>

      {/* Error banner */}
      {statusError ? (
        <View style={[styles.banner, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: '#ef4444' }]}>
          <Text style={styles.bannerTextRed}>{statusError}</Text>
        </View>
      ) : null}

      {/* Host / Port inputs — only shown when not connected */}
      {!isConnected && (
        <View style={styles.inputRow}>
          <View style={styles.hostField}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Host</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.borderColor, color: colors.textPrimary }]}
              value={host}
              onChangeText={setHost}
              placeholder="glove.local"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isConnecting}
            />
          </View>
          <View style={styles.portField}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Port</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.borderColor, color: colors.textPrimary }]}
              value={port}
              onChangeText={setPort}
              placeholder="3333"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              editable={!isConnecting}
            />
          </View>
        </View>
      )}

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
        onPress={isConnected ? handleDisconnect : handleConnect}
        disabled={isConnecting}
      >
        {isConnecting ? (
          <ActivityIndicator color={colors.accentText} size="small" />
        ) : (
          <Text style={[styles.buttonText, { color: isConnected ? '#ef4444' : colors.accentText }]}>
            {isConnected ? 'Disconnect' : 'Connect'}
          </Text>
        )}
      </TouchableOpacity>

      {/* Hint shown only before connecting */}
      {!isConnected && !isConnecting && (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Glove and phone must be on the same WiFi network.{'\n'}
          If <Text style={{ fontStyle: 'italic' }}>glove.local</Text> doesn't resolve, enter the glove's IP address.
        </Text>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container:     { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 16, gap: 10 },
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title:         { fontSize: 16, fontWeight: '600' },
  statusRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot:           { width: 8, height: 8, borderRadius: 4 },
  statusText:    { fontSize: 13 },
  banner:        { padding: 10, borderRadius: 8, borderWidth: 1 },
  bannerTextRed: { color: '#ef4444', fontSize: 12 },
  inputRow:      { flexDirection: 'row', gap: 8 },
  hostField:     { flex: 1 },
  portField:     { width: 80 },
  inputLabel:    { fontSize: 11, marginBottom: 4 },
  input:         { padding: 10, borderRadius: 8, borderWidth: 1, fontSize: 14 },
  button:        { padding: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  buttonText:    { fontSize: 15, fontWeight: '600' },
  hint:          { fontSize: 11, textAlign: 'center', lineHeight: 18 },
});
