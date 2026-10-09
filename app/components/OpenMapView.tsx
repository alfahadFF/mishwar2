import React, { forwardRef, useEffect, useId, useImperativeHandle, useRef } from 'react';
import { Platform, View, Text } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';

// MapLibre v10 requires explicit null-token initialization on native Android/iOS.
if (Platform.OS !== 'web') {
  // The native v10 Android module returns void here, not a Promise.
  // Calling .catch() on that result crashes Hermes during route loading.
  void MapLibreGL.setAccessToken(null);
}

// Unversioned Liberty style: the source resolves to OpenFreeMap's latest weekly OSM tiles.
// Its road, place, and POI labels render Latin plus name:nonlatin (Arabic when tagged in OSM).
const LATEST_STREET_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
function regionZoom(region?: Region) {
  if (!region) return 10;
  const delta = Math.max(0.002, region.latitudeDelta || region.longitudeDelta || 0.05);
  return Math.max(2, Math.min(19, Math.log2(360 / delta)));
}

function cleanId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

export const MapView = forwardRef<any, any>(function OpenMapView(props, forwardedRef) {
  const { style, initialRegion, region, onPress, children, ...nativeProps } = props;
  const cameraRef = useRef<any>(null);
  const firstRegion: Region | undefined = region || initialRegion;

  useImperativeHandle(forwardedRef, () => ({
    animateToRegion(next: Region, duration = 500) {
      cameraRef.current?.setCamera({
        centerCoordinate: [next.longitude, next.latitude],
        zoomLevel: regionZoom(next),
        animationDuration: duration,
      });
    },
  }), []);

  useEffect(() => {
    if (!region) return;
    cameraRef.current?.setCamera({
      centerCoordinate: [region.longitude, region.latitude],
      zoomLevel: regionZoom(region),
      animationDuration: 0,
    });
  }, [region?.latitude, region?.longitude, region?.latitudeDelta, region?.longitudeDelta]);

  if (!firstRegion) return <View style={[style,{alignItems:'center',justifyContent:'center',backgroundColor:'#f8fafc'}]}><Text>حدد موقعك لعرض الخريطة</Text></View>;

  return (
    <MapLibreGL.MapView
      {...nativeProps}
      style={style}
      mapStyle={LATEST_STREET_STYLE_URL}
      attributionEnabled
      onPress={(feature: any) => {
        const coordinates = feature?.geometry?.coordinates;
        if (onPress && Array.isArray(coordinates) && coordinates.length >= 2) {
          onPress({ nativeEvent: { coordinate: { latitude: coordinates[1], longitude: coordinates[0] } } });
        }
      }}
    >
      <MapLibreGL.Camera
        ref={cameraRef}
        defaultSettings={{
          centerCoordinate: [firstRegion.longitude, firstRegion.latitude],
          zoomLevel: regionZoom(firstRegion),
        }}
      />
      {children}
    </MapLibreGL.MapView>
  );
});

// The base map is configured by MapLibre's style URL; kept as a no-op for existing screen markup.
export function UrlTile(_props: any) {
  return null;
}

export function Marker({ coordinate, pinColor = '#2563EB', title, onPress, anchor, children }: any) {
  const reactId = useId();
  const marker = children || (
    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: normalizeColor(pinColor), borderWidth: 3, borderColor: '#fff', elevation: 4 }}>
      <Text accessibilityElementsHidden>{''}</Text>
    </View>
  );
  return (
    <MapLibreGL.PointAnnotation
      id={`marker-${cleanId(reactId)}`}
      coordinate={[coordinate.longitude, coordinate.latitude]}
      title={title}
      anchor={anchor || { x: 0.5, y: 0.5 }}
      onSelected={onPress ? (event: any) => onPress(event) : undefined}
    >
      {marker}
    </MapLibreGL.PointAnnotation>
  );
}

export function Polyline({ coordinates, strokeColor = '#4F46E5', strokeWidth = 4, lineDashPattern, onPress }: any) {
  const reactId = useId();
  const points: number[][] = (coordinates || []).map((point: any) => Array.isArray(point)
    ? [Number(point[1]), Number(point[0])]
    : [Number(point.longitude), Number(point.latitude)]);
  if (points.length < 2 || points.some(([lng, lat]) => !Number.isFinite(lng) || !Number.isFinite(lat))) return null;
  const id = cleanId(reactId);
  const shape = {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: points },
  };
  return (
    <MapLibreGL.ShapeSource id={`line-source-${id}`} shape={shape} onPress={onPress ? (event: any) => onPress(event) : undefined}>
      <MapLibreGL.LineLayer
        id={`line-layer-${id}`}
        style={{
          lineColor: strokeColor,
          lineWidth: strokeWidth,
          ...(lineDashPattern ? { lineDasharray: lineDashPattern } : {}),
        }}
      />
    </MapLibreGL.ShapeSource>
  );
}

function destinationPoint(latitude: number, longitude: number, distance: number, bearing: number) {
  const earthRadius = 6371000;
  const angular = distance / earthRadius;
  const lat1 = latitude * Math.PI / 180;
  const lon1 = longitude * Math.PI / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing));
  const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2));
  return [lon2 * 180 / Math.PI, lat2 * 180 / Math.PI];
}

export function Circle({ center, radius, fillColor = 'rgba(79,70,229,0.08)', strokeColor = 'rgba(79,70,229,0.5)' }: any) {
  const reactId = useId();
  const id = cleanId(reactId);
  const ring = Array.from({ length: 65 }, (_, index) => destinationPoint(center.latitude, center.longitude, radius, (index / 64) * Math.PI * 2));
  const polygon = {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Polygon' as const, coordinates: [ring] },
  };
  return (
    <MapLibreGL.ShapeSource id={`circle-source-${id}`} shape={polygon}>
      <MapLibreGL.FillLayer id={`circle-fill-${id}`} style={{ fillColor, fillOpacity: 0.18 }} />
      <MapLibreGL.LineLayer id={`circle-line-${id}`} style={{ lineColor: strokeColor, lineWidth: 2 }} />
    </MapLibreGL.ShapeSource>
  );
}

function normalizeColor(color: string) {
  const known: Record<string, string> = {
    green: '#16A34A', red: '#DC2626', orange: '#F59E0B', indigo: '#4F46E5', blue: '#2563EB',
  };
  return known[color?.toLowerCase()] || color || '#2563EB';
}
