import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import TcpSocket from 'react-native-tcp-socket';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';

const DEFAULT_HOST = 'glove.local';
const DEFAULT_PORT = '3333';
const MAX_LOG_LINES = 30;

/**
 * Parse a sensor line from the ESP32 TCP stream.
 * Accepts three formats:
 *   5-value   flex only (legacy)
 *   9-value   flex + quaternion
 *  15-value   flex + quaternion + linear-accel + gyro (current firmware)
 */
function parseSensorLine(line: string): number[] | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(',');
  if (parts.length !== 5 && parts.length !== 9 && parts.length !== 15) return null;
  const values = parts.map(Number);
  if (values.some(isNaN)) return null;
  return values;
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
  const { t } = useTranslation();
  const { colors } = useTheme();

  const [host, setHost]               = useState(DEFAULT_HOST);
  const [port, setPort]               = useState(DEFAULT_PORT);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPaused, setIsPaused]       = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [liveLog, setLiveLog]         = useState<string[]>([]);
  const [logExpanded, setLogExpanded] = useState(true);

  const isPausedRef = useRef(false);

  // Socket and line-buffer refs — safe to use inside event callbacks
  const socketRef       = useRef<ReturnType<typeof TcpSocket.createConnection> | null>(null);
  const lineBufferRef   = useRef('');
  const wasConnectedRef = useRef(false); // tracks whether we reached connected state
  const logScrollRef    = useRef<ScrollView>(null);

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
    isPausedRef.current = false;
    setIsConnected(false);
    setIsConnecting(false);
    setIsPaused(false);
    setLiveLog([]);
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
        const newLogLines: string[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        newLogLines.push(trimmed);
        // Only forward data when not paused
        if (!isPausedRef.current) {
          const sample = parseSensorLine(trimmed);
          if (sample) onDataRef.current?.(sample);
        }
      }
      if (newLogLines.length > 0) {
        setLiveLog(prev => [...newLogLines, ...prev].slice(0, MAX_LOG_LINES));
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

  const handlePauseResume = useCallback(() => {
    setIsPaused(prev => {
      isPausedRef.current = !prev;
      return !prev;
    });
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{t('connection.wifi_title')}</Text>
        <View style={styles.statusRow}>
          <View style={[
            styles.dot,
            {
              backgroundColor: isConnected
                ? (isPaused ? '#fbbf24' : '#34d399')
                : isConnecting ? '#fbbf24'
                : colors.textSecondary,
            },
          ]} />
          <Text style={[
            styles.statusText,
            {
              color: isConnected
                ? (isPaused ? '#fbbf24' : '#34d399')
                : isConnecting ? '#fbbf24'
                : colors.textSecondary,
            },
          ]}>
            {isConnected
              ? (isPaused ? t('connection.paused') : `${host.trim()}:${port}`)
              : isConnecting
              ? t('connection.connecting')
              : t('connection.disconnected')}
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
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('connection.host_label')}</Text>
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
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('connection.port_label')}</Text>
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

      {/* Connect / Disconnect + Pause row */}
      {isConnected ? (
        <View style={styles.buttonRow}>
          {/* Pause / Resume */}
          <TouchableOpacity
            style={[styles.button, styles.buttonFlex, {
              backgroundColor: isPaused ? 'rgba(251,191,36,0.15)' : colors.bgSecondary,
              borderColor:     isPaused ? '#fbbf24' : colors.borderColor,
              borderWidth: 1,
            }]}
            onPress={handlePauseResume}
          >
            <Text style={[styles.buttonText, { color: isPaused ? '#fbbf24' : colors.textSecondary }]}>
              {isPaused ? t('connection.resume') : t('connection.pause')}
            </Text>
          </TouchableOpacity>

          {/* Disconnect */}
          <TouchableOpacity
            style={[styles.button, styles.buttonFlex, {
              backgroundColor: 'rgba(239,68,68,0.1)',
              borderColor: '#ef4444',
              borderWidth: 1,
            }]}
            onPress={handleDisconnect}
          >
            <Text style={[styles.buttonText, { color: '#ef4444' }]}>{t('connection.disconnect_btn')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.button, {
            backgroundColor: colors.accentPrimary,
            opacity: isConnecting ? 0.6 : 1,
          }]}
          onPress={handleConnect}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <ActivityIndicator color={colors.accentText} size="small" />
          ) : (
            <Text style={[styles.buttonText, { color: colors.accentText }]}>{t('connection.connect_btn')}</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Paused banner */}
      {isPaused && (
        <View style={[styles.banner, { backgroundColor: 'rgba(251,191,36,0.1)', borderColor: '#fbbf24' }]}>
          <Text style={[styles.bannerTextRed, { color: '#d97706' }]}>
            {t('connection.paused_banner')}
          </Text>
        </View>
      )}

      {/* Hint shown only before connecting */}
      {!isConnected && !isConnecting && (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {t('connection.wifi_hint_line1')}{'\n'}
          {t('connection.wifi_hint_line2')}
        </Text>
      )}

      {/* Live serial log — visible once connected and data is flowing */}
      {isConnected && (
        <View style={[styles.logContainer, { borderColor: colors.borderColor }]}>
          <TouchableOpacity
            style={styles.logHeaderRow}
            onPress={() => setLogExpanded(e => !e)}
            activeOpacity={0.7}
          >
            <View style={styles.logTitleRow}>
              <View style={[styles.logDot, { backgroundColor: liveLog.length > 0 ? '#10b981' : colors.textSecondary }]} />
              <Text style={[styles.logTitle, { color: colors.textPrimary }]}>{t('connection.live_log_title')}</Text>
            </View>
            <Text style={[styles.logMeta, { color: colors.textSecondary }]}>
              {logExpanded ? '▼' : '▶'}  {liveLog.length > 0 ? t('connection.log_lines', { count: liveLog.length }) : t('connection.log_waiting')}
            </Text>
          </TouchableOpacity>

          {logExpanded && (
            <ScrollView
              ref={logScrollRef}
              style={[styles.logScroll, { backgroundColor: colors.bgPrimary }]}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {liveLog.length === 0 ? (
                <Text style={[styles.logEmpty, { color: colors.textSecondary }]}>
                  {t('connection.live_log_empty')}
                </Text>
              ) : (
                liveLog.map((line, i) => (
                  <Text
                    key={i}
                    style={[
                      styles.logLine,
                      { color: i === 0 ? colors.textPrimary : colors.textSecondary },
                    ]}
                  >
                    {line}
                  </Text>
                ))
              )}
            </ScrollView>
          )}
        </View>
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
  buttonRow:     { flexDirection: 'row', gap: 8 },
  buttonFlex:    { flex: 1 },
  button:        { padding: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  buttonText:    { fontSize: 15, fontWeight: '600' },
  hint:          { fontSize: 11, textAlign: 'center', lineHeight: 18 },
  // Live log
  logContainer:  { borderTopWidth: 1, paddingTop: 10, gap: 6 },
  logHeaderRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logTitleRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logDot:        { width: 7, height: 7, borderRadius: 3.5 },
  logTitle:      { fontSize: 13, fontWeight: '600' },
  logMeta:       { fontSize: 11 },
  logScroll:     { maxHeight: 180, borderRadius: 8, padding: 8, marginTop: 4 },
  logEmpty:      { fontSize: 11, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
  logLine:       { fontSize: 10, fontFamily: 'monospace', lineHeight: 17 },
});
