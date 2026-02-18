# ASL Sign Language Recognition - Mobile App

Android and iOS mobile application for real-time American Sign Language (ASL) recognition using sensor glove technology and cloud-based machine learning.

**Version**: 0.4.0  
**Last Updated**: February 2026

---

## Features

### Current Features
- **ASL Recognition**: Real-time prediction of 15 ASL letters (A, B, C, D, E, F, I, K, O, S, T, V, W, X, Y)
- **Cloud API Integration**: Uses `https://api.ybilgin.com` for ML inference with API key authentication
- **ASL Simulator**: Test predictions without physical glove hardware
- **Continuous Mode**: Build words letter by letter with auto-completion
- **Quick Demo Mode**: Automated word simulation for presentations
- **Prediction History**: View last 20 predictions with confidence scores
- **Haptic Feedback**: Vibration based on prediction confidence
- **Text-to-Speech**: Automatic voice output for letters and words
- **ASL Sign Images**: Visual reference for each letter
- **Multi-language**: English and Turkish interface
- **Theme Support**: Light, dark, and system theme modes
- **Beautiful UI**: Modern, polished interface with smooth animations

### Upcoming Features
- Bluetooth connection to physical glove (hardware in development)
- Offline mode with TensorFlow Lite
- User authentication and cloud sync
- Enhanced statistics and analytics

---

## Tech Stack

- **Framework**: React Native (Expo SDK 51)
- **Language**: TypeScript
- **Navigation**: React Navigation
- **API Client**: Axios
- **Bluetooth**: react-native-ble-plx (prepared, awaiting hardware)
- **Haptics**: expo-haptics
- **TTS**: expo-speech
- **i18n**: react-i18next
- **Build Service**: EAS (Expo Application Services)

---

## Quick Start

### Prerequisites
- Node.js v18 or later
- npm or yarn
- Android Studio (for Android development)
- Xcode (for iOS development, macOS only)
- Expo CLI: `npm install -g expo-cli`

### Installation

1. **Navigate to mobile directory**
   ```bash
   cd mobile
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   # Create .env file (see .env.example)
   # Add your API credentials:
   # EXPO_PUBLIC_API_URL=https://api.ybilgin.com
   # EXPO_PUBLIC_API_KEY=your-api-key-here
   ```

4. **Start development server**
   ```bash
   npm start
   ```

5. **Run on device/emulator**
   ```bash
   # Android
   npm run android
   
   # iOS (macOS only)
   npm run ios
   ```

---

## Building APK

### Development APK (Quick)
```bash
cd android
./gradlew assembleDebug
```
Output: `android/app/build/outputs/apk/debug/app-debug.apk`

### Release APK with EAS
```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo account
eas login

# Build for Android
eas build --platform android --profile preview

# Build for iOS (requires Apple Developer account)
eas build --platform ios --profile preview
```

---

## Usage

### Simulator Mode (No Hardware)
1. Launch app
2. Go to "ASL Simulator" section
3. Tap any letter button (A-Y)
4. App generates 150 synthetic samples
5. Prediction appears with confidence score
6. TTS speaks the letter

### Continuous Mode
1. Enable "Continuous Mode" toggle
2. Simulator sends letters sequentially
3. Word builds in Prediction View
4. After completion, TTS speaks full word
5. Use Clear/Delete/Speak buttons

### Quick Demo
1. Go to "Quick Demo Mode"
2. Enter custom word (using A-Y letters only)
3. Tap "GO"
4. App auto-simulates each letter
5. Speaks detected word at end

### Bluetooth Mode (Future)
1. Ensure Bluetooth is enabled
2. Tap "Scan for Devices"
3. Select "ASL Glove" from list
4. Connect
5. Make ASL signs with glove
6. View real-time predictions

---

## Project Structure

```
mobile/
├── App.tsx                          # Main app entry point
├── src/
│   ├── components/
│   │   ├── ConnectionManager.tsx    # Bluetooth connection
│   │   ├── SimulatorControl.tsx     # Letter simulation
│   │   ├── PredictionView.tsx       # Prediction display
│   │   ├── QuickDemo.tsx            # Auto-demo mode
│   │   ├── PredictionHistory.tsx    # History list
│   │   └── Dropdown.tsx             # Settings dropdown
│   ├── services/
│   │   └── apiService.ts            # Cloud API client
│   ├── context/
│   │   └── ThemeContext.tsx         # Theme management
│   ├── locales/
│   │   ├── en.json                  # English translations
│   │   └── tr.json                  # Turkish translations
│   ├── i18n/
│   │   └── i18n.ts                  # i18n configuration
│   └── assets/
│       └── asl/                     # ASL sign images
├── android/                         # Android native code
├── ios/                             # iOS native code
├── .env                             # Environment variables
├── app.json                         # Expo configuration
├── eas.json                         # EAS Build configuration
└── package.json                     # Dependencies
```

---

## API Integration

The app communicates with a cloud-based ML API:

- **Base URL**: `https://api.ybilgin.com`
- **Authentication**: API Key (X-API-Key header)
- **Endpoints**:
  - `POST /predict` - Get ASL letter prediction
  - `GET /health` - Check API status
  - `GET /stats` - Get usage statistics

See `API_CONFIG.md` and `ASL-ML-Inference-API/README.md` for details.

---

## Model Performance

Current model statistics:

- **Supported Letters**: 15 (A, B, C, D, E, F, I, K, O, S, T, V, W, X, Y)
- **Validation Accuracy**: 70-75% (Leave-One-User-Out)
- **Real-World Confidence**: 85-95% with calibrated glove
- **Best Performing**: W (99%), B (97%), F (97%), V (93%)
- **Challenging**: S (27%), X (30%), C (32%), T (38%)
- **Inference Time**: <50ms average
- **Sample Requirement**: 150-200 samples per prediction

---

## Troubleshooting

### Build Errors

**Gradle build fails:**
```bash
cd android
./gradlew clean
./gradlew assembleDebug --info
```

**Metro bundler issues:**
```bash
npx expo start --clear
```

**Dependency conflicts:**
```bash
rm -rf node_modules
npm install
```

### Runtime Issues

**API not responding:**
- Check `.env` file has correct API URL and key
- Verify network connection
- Check API status: `curl https://api.ybilgin.com/health`

**Bluetooth permissions (Android):**
Ensure `AndroidManifest.xml` includes:
- `BLUETOOTH`
- `BLUETOOTH_ADMIN`
- `BLUETOOTH_SCAN`
- `BLUETOOTH_CONNECT`
- `ACCESS_FINE_LOCATION`

**TTS not working:**
- Check device volume
- Verify TTS engine installed (Android Settings > Accessibility > Text-to-Speech)
- Try different language

---

## Environment Configuration

### Required Environment Variables

Create `.env` file in mobile root:

```env
# API Configuration
EXPO_PUBLIC_API_URL=https://api.ybilgin.com
EXPO_PUBLIC_API_KEY=your-api-key-here
```

Get API key from project maintainer or generate one following `SECURITY_SETUP.md`.

---

## Testing

### Manual Testing Checklist
- [ ] App launches without errors
- [ ] Theme switching works (light/dark/system)
- [ ] Language switching works (English/Turkish)
- [ ] Simulator generates predictions
- [ ] Predictions show correct confidence
- [ ] TTS speaks letters correctly
- [ ] Haptic feedback vibrates
- [ ] History list updates
- [ ] Continuous mode builds words
- [ ] Quick Demo simulates words
- [ ] API errors display properly

---

## Deployment

### Internal Testing
1. Build debug APK
2. Install on test devices
3. Verify all features work
4. Collect feedback

### Production Release
1. Update version in `package.json` and `app.json`
2. Build release APK with EAS
3. Test on multiple devices
4. Submit to Google Play Store (Android) or App Store (iOS)

---

## Known Issues

1. **Bluetooth scanning**: Implemented but untested (awaiting hardware)
2. **Model accuracy**: Lower than desired for some letters (S, X, C, T)
3. **Offline mode**: Not yet implemented (requires TensorFlow Lite integration)

---

## Future Enhancements

- [ ] Connect to physical glove via Bluetooth
- [ ] Add ASL tutorial mode with images/videos
- [ ] Export prediction history to CSV
- [ ] Offline mode with on-device ML model
- [ ] Support for more ASL letters (requiring IMU data)
- [ ] User accounts and cloud sync
- [ ] Statistics dashboard
- [ ] Custom word builder
- [ ] Social sharing features

---

## Related Projects

- **Desktop App**: `../` - Cross-platform desktop application
- **API Server**: `../ASL-ML-Inference-API/` - Cloud ML inference server
- **Training Tools**: `../iot-sign-glove/` - Data collection and model training

---

## Documentation

- **API_CONFIG.md**: API setup instructions
- **PROJECT_STATE.md**: Complete project documentation
- **DATA_COLLECTION_GUIDE.md**: Data recording best practices

---

## Academic Context

This mobile app is part of a Computer Science graduation project focused on:
- Mobile application development
- Real-time gesture recognition
- Cloud API integration
- Cross-platform development
- User experience design

---

## License

MIT License - Part of Computer Science Graduation Project

**Author**: Yigit Alp Bilgin  
**Year**: 2026

For questions or support, refer to PROJECT_STATE.md or contact the project team.
