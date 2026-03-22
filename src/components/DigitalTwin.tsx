import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import WebView from 'react-native-webview';
import { useTheme } from '../context/ThemeContext';
import {
  startWebGLServer,
  stopWebGLServer,
  prepareWebGLAssets,
  WEBGL_ORIGIN,
} from '../services/LocalWebGLServer';

// ── Public API exposed via ref ────────────────────────────────────────────────
export interface DigitalTwinRef {
  sendSensorData: (
    flex: number[],
    imu: { x: number; y: number; z: number },
  ) => void;
}

interface DigitalTwinProps {
  onClose?: () => void;
}

type Mode = 'local' | 'remote';

// ── Component ─────────────────────────────────────────────────────────────────
const DigitalTwin = forwardRef<DigitalTwinRef, DigitalTwinProps>(
  ({ onClose }, ref) => {
    const { colors } = useTheme();
    const webViewRef = useRef<WebView>(null);

    const [mode, setMode]             = useState<Mode>('local');
    const [remoteUrl, setRemoteUrl]   = useState('http://192.168.1.100:8787');
    const [loaded, setLoaded]         = useState(false);
    const [isLoading, setIsLoading]   = useState(false);
    const [preparing, setPreparing]   = useState(false); // copying assets
    const [prepareProgress, setProgress] = useState(0);  // 0-5 files
    const [error, setError]           = useState<string | null>(null);
    const [activeUri, setActiveUri]   = useState('');

    // ── Expose sendSensorData ─────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      sendSensorData: (flex, imu) => {
        if (!loaded || !webViewRef.current) return;
        const payload = JSON.stringify({ type: 'sensorData', flex, imu });
        // react-native-webview intercepts window.postMessage and routes it to
        // onMessage (React Native side) instead of Unity's window event listener.
        // dispatchEvent bypasses that interception and fires directly on the page.
        webViewRef.current.injectJavaScript(
          `(function(){window.dispatchEvent(new MessageEvent('message',{data:${payload},origin:window.location.origin}))})();true;`,
        );
      },
    }));

    const handleLoad = async () => {
      setError(null);
      if (mode === 'local') {
        setPreparing(true);
        setProgress(0);
        try {
          const origin = await startWebGLServer(/* uses prepareWebGLAssets internally */);
          setActiveUri(origin);
          setPreparing(false);
          setIsLoading(true);
          setLoaded(true);
        } catch (e: any) {
          setPreparing(false);
          setError(`Server error: ${e?.message ?? String(e)}`);
        }
      } else {
        setActiveUri(remoteUrl.trim());
        setIsLoading(true);
        setLoaded(true);
      }
    };

    const handleUnload = () => {
      if (mode === 'local') stopWebGLServer();
      setLoaded(false);
      setIsLoading(false);
      setPreparing(false);
      setError(null);
      setActiveUri('');
    };

    return (
      <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>3D Digital Twin</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Unity WebGL · Live Hand Pose
            </Text>
          </View>
          {onClose && (
            <TouchableOpacity onPress={() => { handleUnload(); onClose(); }}>
              <Text style={[styles.closeBtn, { color: colors.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Mode tabs */}
        {!loaded && (
          <View style={[styles.tabs, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
            <TouchableOpacity
              style={[styles.tab, mode === 'local' && { backgroundColor: colors.accentPrimary }]}
              onPress={() => setMode('local')}
            >
              <Text style={[styles.tabTxt, { color: mode === 'local' ? colors.accentText : colors.textSecondary }]}>
                📱 Local (Bundled)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, mode === 'remote' && { backgroundColor: colors.accentPrimary }]}
              onPress={() => setMode('remote')}
            >
              <Text style={[styles.tabTxt, { color: mode === 'remote' ? colors.accentText : colors.textSecondary }]}>
                🌐 Remote (Desktop)
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Mode description / remote URL input */}
        {!loaded && mode === 'local' && (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Uses the WebGL build bundled inside the app.{'\n'}
            Works offline — no desktop required.
          </Text>
        )}

        {!loaded && mode === 'remote' && (
          <>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.borderColor,
                  color: colors.textPrimary,
                }]}
                value={remoteUrl}
                onChangeText={setRemoteUrl}
                placeholder="http://192.168.x.x:8787"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Connect to the desktop app's WebGL server over WiFi.
            </Text>
          </>
        )}

        {/* Error */}
        {error && (
          <View style={[styles.banner, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: '#ef4444' }]}>
            <Text style={styles.bannerText}>{error}</Text>
          </View>
        )}

        {/* Load / Unload button */}
        {!loaded ? (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.accentPrimary, opacity: preparing ? 0.6 : 1 }]}
            onPress={handleLoad}
            disabled={preparing || (mode === 'remote' && !remoteUrl.trim())}
          >
            {preparing ? (
              <ActivityIndicator color={colors.accentText} size="small" />
            ) : (
              <Text style={[styles.btnTxt, { color: colors.accentText }]}>Load 3D Twin</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: '#ef4444', borderWidth: 1 }]}
            onPress={handleUnload}
          >
            <Text style={[styles.btnTxt, { color: '#ef4444' }]}>Unload Twin</Text>
          </TouchableOpacity>
        )}

        {/* WebView */}
        {loaded && (
          <View style={styles.webViewWrapper}>
            {isLoading && (
              <View style={[styles.loadingOverlay, { backgroundColor: colors.bgSecondary }]}>
                <ActivityIndicator color={colors.accentPrimary} size="large" />
                <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                  Loading Unity WebGL…{'\n'}This may take 15–30 seconds.
                </Text>
              </View>
            )}
            <WebView
              ref={webViewRef}
              source={{ uri: activeUri }}
              style={styles.webView}
              originWhitelist={['*', 'http://localhost:*']}
              javaScriptEnabled
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              onLoadStart={() => { setIsLoading(true); setError(null); }}
              onLoadEnd={() => setIsLoading(false)}
              onError={e => {
                setIsLoading(false);
                setError(`Load error: ${e.nativeEvent.description}`);
              }}
            />
          </View>
        )}
      </View>
    );
  },
);

export default DigitalTwin;

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:      { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 16, gap: 10 },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title:          { fontSize: 16, fontWeight: '700' },
  subtitle:       { fontSize: 11, marginTop: 2 },
  closeBtn:       { fontSize: 20, padding: 4 },
  tabs:           { flexDirection: 'row', borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  tab:            { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabTxt:         { fontSize: 13, fontWeight: '600' },
  hint:           { fontSize: 11, lineHeight: 17, textAlign: 'center' },
  inputRow:       { flexDirection: 'row' },
  input:          { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, fontSize: 13 },
  banner:         { padding: 10, borderRadius: 8, borderWidth: 1 },
  bannerText:     { color: '#ef4444', fontSize: 12 },
  btn:            { padding: 14, borderRadius: 10, alignItems: 'center' },
  btnTxt:         { fontSize: 15, fontWeight: '600' },
  webViewWrapper: { height: 340, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject, zIndex: 10,
    justifyContent: 'center', alignItems: 'center', gap: 12,
  },
  loadingText:    { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  webView:        { flex: 1 },
});
