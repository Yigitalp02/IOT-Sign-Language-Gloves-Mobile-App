# Privacy Policy — IoT Sign Language

**Last updated: March 2026**

## Overview

IoT Sign Language ("the App") is a graduation project developed by Yiğit Alp Bilgin. This privacy policy explains how the App handles data.

## Data Collection

**The App does not collect, store, or share any personal data.**

Specifically:
- No user accounts or registration required
- No analytics or crash reporting services
- No advertising networks
- No tracking or profiling

## Sensor Data

The App reads flex sensor and IMU data from a Bluetooth/WiFi-connected smart glove worn by the user. This data:
- Is processed locally on the device or sent to a REST API endpoint (`api.ybilgin.com`) solely for sign language letter prediction
- Is never stored persistently on any server
- Is never shared with third parties

## Network Access

The App requires network access to:
1. Connect to the smart glove over your local WiFi network (TCP socket to `glove.local:3333`)
2. Send sensor readings to the prediction API and receive the recognized letter back

No data leaves your device except for the real-time sensor readings sent to the prediction API described above.

## Local Storage

The App stores calibration values (flex sensor baseline and max-bend values) locally on your device only. This data never leaves your device.

## Children's Privacy

The App is not directed at children under 13 and does not knowingly collect data from children.

## Changes to This Policy

This policy may be updated. Any changes will be reflected with an updated date above.

## Contact

For questions about this policy, contact: yigit.alp.bilgin@[your-email-domain]
