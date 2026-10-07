import React, { forwardRef } from 'react';
import { View, Text } from 'react-native';

export const MapView = forwardRef<any, any>(function WebMapPlaceholder({ style, children }, _ref) {
  return (
    <View style={[{ backgroundColor: '#eef2f7', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, style]}>
      <Text style={{ color: '#475569', fontSize: 12, fontWeight: '700' }}>الخريطة متاحة في تطبيق الجوال</Text>
      {children}
    </View>
  );
});

export function UrlTile(_props: any) { return null; }
export function Marker(_props: any) { return null; }
export function Polyline(_props: any) { return null; }
export function Circle(_props: any) { return null; }
