# Google Play Store Listing — IoT Sign Language

## App Name
IoT Sign Language

## Short Description (80 chars max)
Real-time ASL sign language recognition using a smart sensor glove and ML

## Full Description (4000 chars max)
IoT Sign Language is a Computer Science graduation project that recognizes American Sign Language (ASL) letters in real time using a custom smart glove equipped with flex sensors and a BNO055 IMU sensor.

The smart glove streams sensor data wirelessly via WiFi (ESP32) to your phone. A machine learning model (Random Forest, v5) trained on real glove data predicts the signed letter instantly.

★ FEATURES

• Real-time ASL letter prediction — rolling 50-sample window at 50 Hz
• 3D Digital Twin — a live Unity WebGL hand visualization that mirrors your hand pose
• WiFi glove connectivity — connect to ESP32 glove over your local network
• Continuous word building mode — spell out full words letter by letter
• Quick Demo mode — simulate any word automatically for demonstrations
• Sensor calibration — personalized flex sensor calibration for better accuracy
• ASL reference images — visual guide for each supported letter
• Prediction history — log of recent predictions with confidence scores
• Debug log — real-time API response and sensor data details
• 3 language support — English, Turkish (Türkçe), and German (Deutsch)
• Light and dark theme

★ SUPPORTED ASL LETTERS
A, B, C, D, E, F, I, K, O, S, T, U, V, W, X, Y

★ HOW IT WORKS
1. Connect the smart glove to the same WiFi network as your phone
2. Tap "Connect" and enter the glove's address (default: glove.local:3333)
3. Calibrate the flex sensors for your hand (optional but recommended)
4. Sign a letter — the app predicts and displays it in real time
5. Switch to Continuous mode to build full words

★ TECHNICAL
- ESP32 firmware streams 15-column CSV data (flex + quaternion + IMU)
- Random Forest cascade classifier trained on real glove data
- Unity WebGL 3D twin synchronized via WebView postMessage bridge

This app is part of an IoT graduation project at [University Name], developed by Yiğit Alp Bilgin.

---

## Content Rating Answers
- Violence: No
- Sexual content: No
- Language: No
- Controlled substances: No
- Target age group: Everyone (13+)

## Category
Tools (or Education)

## Tags
sign language, ASL, IoT, smart glove, machine learning, sensor, accessibility

## Privacy Policy URL
https://yigitalp02.github.io/IOT-Sign-Language-Gloves-Mobile-App/PRIVACY_POLICY

---

## Required Screenshots (take these in the app)
1. Main screen showing a predicted letter (e.g. "A") with the ASL image
2. 3D Digital Twin (open the twin and show the hand model)
3. Sensor calibration screen
4. Continuous mode showing a detected word (use Quick Demo with "VISA")
5. Settings showing the 3 language options

## Feature Graphic (1024×500px)
- Dark background matching the app's dark theme
- App name "IoT Sign Language" in large text
- A hand wearing the glove on one side
- The letter prediction UI on the other side
