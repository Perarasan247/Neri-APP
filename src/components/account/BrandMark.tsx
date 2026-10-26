import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

const logoSource = require('@/assets/images/icon.png');

/** Neri logo tile: official app icon mark. */
export function BrandMark({ size = 56 }: { size?: number }) {
  const r = Math.round(size * 0.22);
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: r, overflow: 'hidden' },
        styles.shadow,
      ]}
      accessible
      accessibilityLabel="Neri"
    >
      <Image
        source={logoSource}
        style={{ width: size, height: size }}
        contentFit="cover"
        transition={200}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
});
