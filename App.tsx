import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, SafeAreaView, Platform, StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';
import './src/i18n/i18n'; // Initialize i18n
import { useTranslation } from 'react-i18next';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import ConnectionManager from './src/components/ConnectionManager';
import Dropdown from './src/components/Dropdown';

function AppContent() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme, colors, isDark } = useTheme();
  const [text, setText] = useState('Hello professor, text-to-speech demo is ready.');
  const [statusMessage, setStatusMessage] = useState('');

  React.useEffect(() => {
    const listVoices = async () => {
      const voices = await Speech.getAvailableVoicesAsync();
      console.log('Available Voices:', voices.map(v => `${v.name} (${v.language})`));
    };
    listVoices();
  }, []);

  const handleSpeak = (language: string) => {
    if (!text.trim()) {
      setStatusMessage(t('status.error_empty'));
      return;
    }

    setStatusMessage(language === 'tr-TR' ? t('status.speaking_tr') : t('status.speaking_en'));

    Speech.speak(text, {
      language,
      onDone: () => setStatusMessage(language === 'tr-TR' ? t('status.success_tr') : t('status.success_en')),
      onError: (e) => setStatusMessage(`Error: ${e}`),
    });
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bgPrimary }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: 'transparent' }]}>
              <Text style={{ color: colors.accentPrimary }}>IoT </Text>
              <Text style={{ color: colors.accentSecondary }}>Sign Language</Text>
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('app.subtitle')}</Text>



            // ... inside AppContent component ...

            <View style={styles.settingsRow}>
              <Dropdown
                label={t('settings.language')}
                value={i18n.language}
                options={[
                  { label: 'English', value: 'en' },
                  { label: 'Türkçe', value: 'tr' },
                ]}
                onSelect={(value) => i18n.changeLanguage(value)}
              />

              <Dropdown
                label={t('settings.theme')}
                value={theme}
                options={[
                  { label: t('settings.light'), value: 'light' },
                  { label: t('settings.dark'), value: 'dark' },
                  { label: t('settings.system'), value: 'system' },
                ]}
                onSelect={(value) => setTheme(value as any)}
              />
            </View>
          </View>

          <View style={[styles.content, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, shadowColor: colors.shadowColor }]}>
            <ConnectionManager />

            <View style={styles.inputSection}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>{t('input.label')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.borderColor, color: colors.textPrimary }]}
                multiline
                numberOfLines={4}
                value={text}
                onChangeText={setText}
                placeholder={t('input.placeholder')}
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.accentPrimary }]}
                onPress={() => handleSpeak('tr-TR')}
              >
                <Text style={[styles.buttonText, { color: colors.accentText }]}>{t('buttons.speak_tr')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.secondaryButton, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}
                onPress={() => handleSpeak('en-US')}
              >
                <Text style={[styles.buttonText, { color: colors.textPrimary }]}>{t('buttons.speak_en')}</Text>
              </TouchableOpacity>
            </View>

            {!!statusMessage && (
              <View style={[styles.statusMessage, { backgroundColor: colors.statusBg, borderColor: colors.borderColor }]}>
                <Text style={{ color: colors.textPrimary, textAlign: 'center' }}>{statusMessage}</Text>
              </View>
            )}
          </View>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>{t('app.footer')}</Text>
            <Text style={[styles.versionText, { color: colors.textSecondary }]}>{t('app.version')}</Text>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  settingsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 16,
    zIndex: 10, // Ensure dropdowns appear on top
  },
  content: {
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
    marginBottom: 24,
  },
  inputSection: {
    gap: 8,
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  secondaryButton: {
    borderWidth: 1,
    elevation: 0,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusMessage: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  footer: {
    alignItems: 'center',
    gap: 8,
  },
  footerText: {
    fontSize: 12,
    textAlign: 'center',
  },
  versionText: {
    fontSize: 10,
    opacity: 0.7,
  },
});
