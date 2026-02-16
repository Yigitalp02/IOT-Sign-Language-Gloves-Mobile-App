import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';

interface QuickDemoProps {
  onSimulateLetter: (letter: string) => void;
  isActive: boolean;
  onStopSimulator: () => void;
  quickDemoCallbackRef: React.MutableRefObject<(() => void) | null>;
  detectedWord: string; // Add this to get the ACTUAL detected word
  onClearWord: () => void; // Add ability to clear word before demo
  onResetWordFinalization?: () => void; // Reset finalization state
  getCurrentWord: () => string; // Get the CURRENT word from ref (not from prop)
}

const QuickDemo: React.FC<QuickDemoProps> = ({ onSimulateLetter, isActive, onStopSimulator, quickDemoCallbackRef, detectedWord, onClearWord, onResetWordFinalization, getCurrentWord }) => {
  const { colors } = useTheme();
  const [customWord, setCustomWord] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [currentLetterIndex, setCurrentLetterIndex] = useState(-1);

  const simulateWord = async (word: string) => {
    const letters = word.toUpperCase().split('').filter(l => l !== ' ');
    const availableLetters = 'ABCDEFIKOSTUVWXY'; // 16 letters (no G H J L M N P Q R Z)
    const validLetters = letters.filter(l => availableLetters.includes(l));
    const skippedLetters = letters.filter(l => !availableLetters.includes(l));
    
    if (skippedLetters.length > 0) {
      alert(`Letters not available in model: ${skippedLetters.join(', ')}\n\nWill simulate: ${validLetters.join('')}`);
    }
    
    if (validLetters.length === 0) {
      alert(`No valid letters to simulate!\n\nAvailable: ${availableLetters.split('').join(' ')}`);
      return;
    }

    // CRITICAL: Clear old word before starting new demo
    console.log('[QuickDemo] Clearing old word before starting new demo');
    onClearWord();
    if (onResetWordFinalization) {
      onResetWordFinalization();
    }
    
    // Wait a tick for the clear to propagate
    await new Promise(resolve => setTimeout(resolve, 100));

    setIsRunning(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    for (let i = 0; i < validLetters.length; i++) {
      setCurrentLetterIndex(i);
      const letter = validLetters[i];
      
      console.log(`[QuickDemo] Starting letter ${i + 1}/${validLetters.length}: ${letter}`);
      
      // Trigger simulation for this letter
      onSimulateLetter(letter);
      
      // Wait for prediction to complete using a Promise that resolves when callback is called
      await new Promise<void>((resolve) => {
        // Safety timeout in case something goes wrong (10 seconds max per letter)
        const timeoutId = setTimeout(() => {
          if (quickDemoCallbackRef.current) {
            console.log(`[QuickDemo] Timeout waiting for ${letter}, moving to next`);
            quickDemoCallbackRef.current = null;
            resolve();
          }
        }, 10000);
        
        // Set up the callback that will be called when prediction completes
        quickDemoCallbackRef.current = () => {
          console.log(`[QuickDemo] Letter ${letter} prediction complete!`);
          clearTimeout(timeoutId); // ← CRITICAL: Cancel the timeout!
          resolve();
        };
      });
      
      // Small pause before next letter for clarity
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setIsRunning(false);
    setCurrentLetterIndex(-1);
    
    // CRITICAL: Stop the simulator after demo completes!
    onStopSimulator();
    
    // Wait a moment for final prediction to complete and word to update
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Get the ACTUAL detected word from the prediction view (using ref for most current value)
    const finalWord = getCurrentWord();
    console.log(`[QuickDemo] Demo complete. Word from prediction view: "${finalWord}"`);
    
    // Speak the word from prediction view!
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (finalWord.length > 0) {
      console.log(`[QuickDemo] Speaking word from prediction view: "${finalWord}"`);
      Speech.speak(finalWord, {
        language: 'en-US',
        rate: 0.8,
      });
    } else {
      console.log('[QuickDemo] WARNING: No word to speak!');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        Quick Demo Mode
      </Text>
      
      <Text style={[styles.description, { color: colors.textSecondary }]}>
        Auto-simulate words for professor demos
      </Text>

      {isRunning && (
        <View style={[styles.runningBanner, { backgroundColor: '#10b981' + '20', borderColor: '#10b981' }]}>
          <Text style={[styles.runningText, { color: '#10b981' }]}>
            Demo Running... (Letter {currentLetterIndex + 1})
          </Text>
        </View>
      )}

      {/* Custom Word */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>
          Enter Word:
        </Text>
        <View style={styles.customRow}>
          <TextInput
            style={[
              styles.customInput,
              { 
                backgroundColor: colors.bgSecondary, 
                borderColor: colors.borderColor, 
                color: colors.textPrimary 
              }
            ]}
            value={customWord}
            onChangeText={(text) => setCustomWord(text.toUpperCase())}
            placeholder="Type word here..."
            placeholderTextColor={colors.textSecondary}
            maxLength={10}
            autoCapitalize="characters"
            editable={!isActive && !isRunning}
          />
          <TouchableOpacity
            style={[
              styles.goButton,
              { 
                backgroundColor: '#10b981',
                opacity: (!customWord.trim() || isActive || isRunning) ? 0.5 : 1
              }
            ]}
            onPress={async () => {
              if (!customWord.trim() || isActive || isRunning) return;
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              simulateWord(customWord.trim());
            }}
            disabled={!customWord.trim() || isActive || isRunning}
          >
            <Text style={styles.goButtonText}>GO</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>
          Available letters: A B C D E F I K O S T U V W X Y
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  description: {
    fontSize: 12,
    marginBottom: 12,
  },
  runningBanner: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    marginBottom: 12,
    alignItems: 'center',
  },
  runningText: {
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  customRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  customInput: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  goButton: {
    paddingHorizontal: 24,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  goButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  helperText: {
    fontSize: 10,
    fontStyle: 'italic',
  },
  infoBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  infoText: {
    fontSize: 11,
    marginBottom: 2,
  },
});

export default QuickDemo;

