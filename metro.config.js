const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Unity WebGL with Decompression Fallback uses .unityweb for all compressed assets
config.resolver.assetExts.push('unityweb');

module.exports = config;
