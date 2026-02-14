# IoT Sign Language - Mobile App

Android mobile application for real-time American Sign Language (ASL) recognition using sensor glove technology and cloud-based machine learning.

---

## 🚀 Features

### ✅ Implemented
- **ASL Recognition**: Real-time prediction of 15 ASL letters (A, B, C, D, E, F, I, K, O, S, T, V, W, X, Y)
- **Cloud API Integration**: Uses `https://api.ybilgin.com` for ML inference
- **Simulator Mode**: Test predictions without physical glove
- **Bluetooth Ready**: Prepared for BLE connection to physical glove (hardware pending)
- **Prediction History**: View last 20 predictions with confidence scores
- **Haptic Feedback**: Vibration feedback based on prediction confidence
- **Text-to-Speech**: Speaks predicted letters automatically
- **Multi-language**: English and Turkish support
- **Theme Support**: Light, dark, and system theme modes
- **Beautiful UI**: Modern, polished interface with animations

---

## 📱 Screenshots

The app includes:
- **Connection Manager**: Scan and connect to ASL glove via Bluetooth
- **Simulator Control**: 15 letter buttons to simulate sensor data
- **Prediction View**: Real-time results with confidence, samples, and processing time
- **Prediction History**: Scrollable list of recent predictions
- **Text-to-Speech**: Manual text input with Turkish/English voice output

---

## 🛠️ Tech Stack

- **React Native (Expo)**: Cross-platform mobile framework
- **TypeScript**: Type-safe development
- **Axios**: HTTP client for API calls
- **react-native-ble-plx**: Bluetooth Low Energy support
- **expo-haptics**: Vibration feedback
- **expo-speech**: Text-to-speech
- **i18next**: Internationalization

---

## 🏃 Running the App

### Prerequisites
- Node.js (v18+)
- Android Studio (for Android)
- Xcode (for iOS, macOS only)

### Install Dependencies
```bash
npm install
```

### Run on Android
```bash
npm run android
```

### Run on iOS
```bash
npm run ios
```

### Start Development Server
```bash
npm start
```

---

## 📦 Building APK for Demo

### Debug APK (Quick)
```bash
cd android
.\gradlew assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

### Release APK (Optimized)
```bash
cd android
.\gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

**Note**: For release builds, you need to configure signing keys in `android/app/build.gradle`.

---

## 🔗 API Integration

The app connects to a cloud-based ML API for predictions:

- **Endpoint**: `https://api.ybilgin.com/predict`
- **Model**: Random Forest (15 ASL letters)
- **Response Time**: ~50ms
- **Features**: 25 statistical features from 200 sensor samples

---

## 📱 Bluetooth Connection (Future)

When the physical glove arrives:

1. The app will scan for devices with "ASL" or "Glove" in the name
2. Connect via Bluetooth Low Energy (BLE)
3. Receive real-time sensor data (5 flex sensors)
4. Send 200 samples (4 seconds at 50Hz) to cloud API
5. Display prediction results

**Current Status**: Bluetooth code is ready, waiting for hardware.

---

## 🌐 Simulator Mode

For testing without hardware:

1. Select a letter from the 15-button grid
2. App simulates 200 samples with realistic noise
3. Sends data to cloud API for prediction
4. Displays result with confidence, samples, and time

**Patterns**: Based on real ASL dataset, calibrated to our sensor range (0-1023).

---

## 📊 Model Performance

- **Validation Accuracy**: 70-75% (Leave-One-User-Out)
- **Real-World Confidence**: 85-95% with simulator
- **Best Letters**: W (99%), B (97%), F (97%), V (93%)
- **Challenging Letters**: S (27%), X (30%), C (32%), T (38%)

---

## 🎯 Demo Instructions (for Professor)

1. **Launch App**: Open APK on Android device
2. **Select Language**: Choose English or Turkish
3. **Simulator Mode**: 
   - Tap any letter button (e.g., "A")
   - Watch prediction in real-time
   - See confidence, samples, and processing time
4. **Check History**: Scroll through recent predictions
5. **Text-to-Speech**: Type any text and press "Speak"
6. **Bluetooth Ready**: Show that BLE scanning is implemented (hardware pending)

---

## 📝 Project Structure

```
mobile/
├── App.tsx                          # Main app component
├── src/
│   ├── components/
│   │   ├── ConnectionManager.tsx   # Bluetooth connection
│   │   ├── SimulatorControl.tsx    # Letter simulation
│   │   ├── PredictionView.tsx      # Result display
│   │   ├── PredictionHistory.tsx   # History list
│   │   └── Dropdown.tsx            # Settings dropdown
│   ├── services/
│   │   └── apiService.ts           # Cloud API client
│   ├── context/
│   │   └── ThemeContext.tsx        # Theme management
│   ├── locales/
│   │   ├── en.json                 # English translations
│   │   └── tr.json                 # Turkish translations
│   └── i18n/
│       └── i18n.ts                 # i18n configuration
├── android/                         # Android native code
└── package.json                     # Dependencies
```

---

## 🐛 Troubleshooting

### Build Fails
```bash
cd android
.\gradlew clean
.\gradlew assembleDebug
```

### Metro Bundler Issues
```bash
npx expo start --clear
```

### Bluetooth Permissions
Ensure Android Manifest includes:
- `BLUETOOTH`
- `BLUETOOTH_ADMIN`
- `BLUETOOTH_SCAN`
- `BLUETOOTH_CONNECT`
- `ACCESS_FINE_LOCATION`

---

## 🚀 Future Enhancements

- [ ] Connect to real glove via Bluetooth
- [ ] Add tutorial mode with ASL letter images
- [ ] Export prediction history as CSV
- [ ] Offline mode with TensorFlow Lite
- [ ] Support for more ASL letters (26 total + hand orientation)
- [ ] User authentication and cloud sync
- [ ] Statistics dashboard

---

## 📄 License

MIT License - Part of Computer Science Graduation Project

**Author**: Yiğit Alp Bilgin  
**Version**: 1.0.0  
**Last Updated**: February 2026

