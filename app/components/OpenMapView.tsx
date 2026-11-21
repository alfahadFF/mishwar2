import React, { forwardRef, useEffect, useId, useImperativeHandle, useRef } from 'react';
import { View, Text } from 'react-native';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as NativeMap,
  Marker as NativeMarker,
  ViewAnnotation,
  type Anchor,
  type CameraRef,
} from '@maplibre/maplibre-react-native';

// Vector street style used when a screen explicitly requests streets.
const LATEST_STREET_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const ARCGIS_API_KEY = (process.env.EXPO_PUBLIC_ARCGIS_API_KEY || '').trim();
const ARCGIS_TOKEN = ARCGIS_API_KEY ? encodeURIComponent(ARCGIS_API_KEY) : '';
const ARCGIS_IMAGERY_TILES = ARCGIS_TOKEN
  ? `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${ARCGIS_TOKEN}`
  : 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

// Always show satellite imagery and transparent place/road-name overlays, even when
// no ArcGIS API key is present. ArcGIS requires attribution for all three services.
const ARCGIS_HYBRID_STYLE: any = {
  version: 8,
  sources: {
    'arcgis-world-imagery': {
      type: 'raster',
      tiles: [ARCGIS_IMAGERY_TILES],
      tileSize: 256,
      scheme: 'xyz',
      minzoom: 0,
      maxzoom: 19,
      attribution: 'World Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    },
    'arcgis-world-boundaries-places': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      scheme: 'xyz',
      minzoom: 0,
      maxzoom: 19,
      attribution: 'Place labels © Esri, HERE, Garmin, OpenStreetMap contributors, and the GIS User Community',
    },
    'arcgis-world-transportation': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      scheme: 'xyz',
      minzoom: 0,
      maxzoom: 19,
      attribution: 'Transportation labels © Esri, HERE, Garmin, OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'arcgis-world-imagery',
      type: 'raster',
      source: 'arcgis-world-imagery',
      minzoom: 0,
      maxzoom: 19,
    },
    {
      id: 'arcgis-world-transportation',
      type: 'raster',
      source: 'arcgis-world-transportation',
      minzoom: 0,
      maxzoom: 19,
      paint: { 'raster-opacity': 1, 'raster-fade-duration': 0 },
    },
    {
      id: 'arcgis-world-boundaries-places',
      type: 'raster',
      source: 'arcgis-world-boundaries-places',
      minzoom: 0,
      maxzoom: 19,
      paint: { 'raster-opacity': 1, 'raster-fade-duration': 0 },
    },
  ],
};

type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
function regionZoom(region?: Region) {
  if (!region) return 10;
  const delta = Math.max(0.002, region.latitudeDelta || region.longitudeDelta || 0.05);
  return Math.max(2, Math.min(19, Math.log2(360 / delta)));
}

function cleanId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

function toAnchor(anchor: any): Anchor {
  if (typeof anchor === 'string') return anchor as Anchor;
  if (!anchor || typeof anchor !== 'object') return 'center';

  // Convert the legacy numeric anchor used by the old map wrapper to MapLibre's string form.
  const horizontal = anchor.x <= 0.25 ? 'left' : anchor.x >= 0.75 ? 'right' : '';
  const vertical = anchor.y <= 0.25 ? 'top' : anchor.y >= 0.75 ? 'bottom' : '';
  if (vertical && horizontal) return `${vertical}-${horizontal}` as Anchor;
  return (vertical || horizontal || 'center') as Anchor;
}

export const MapView = forwardRef<any, any>(function OpenMapView(props, forwardedRef) {
  const {
    style,
    initialRegion,
    region,
    onPress,
    children,
    scrollEnabled,
    zoomEnabled,
    basemap = 'hybrid',
    ...nativeProps
  } = props;
  const selectedMapStyle = basemap === 'streets' ? LATEST_STREET_STYLE_URL : ARCGIS_HYBRID_STYLE;
  const cameraRef = useRef<CameraRef>(null);
  const firstRegion: Region | undefined = region || initialRegion;

  useImperativeHandle(forwardedRef, () => ({
    animateToRegion(next: Region, duration = 500) {
      cameraRef.current?.easeTo({
        center: [next.longitude, next.latitude],
        zoom: regionZoom(next),
        duration,
      });
    },
  }), []);

  useEffect(() => {
    if (!region) return;
    cameraRef.current?.jumpTo({
      center: [region.longitude, region.latitude],
      zoom: regionZoom(region),
    });
  }, [region?.latitude, region?.longitude, region?.latitudeDelta, region?.longitudeDelta]);

  if (!firstRegion) {
    return (
      <View style={[style, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }]}>
        <Text>حدد موقعك لعرض الخريطة</Text>
      </View>
    );
  }

  return (
    <NativeMap
      {...nativeProps}
      style={style}
      mapStyle={selectedMapStyle}
      attribution
      dragPan={scrollEnabled}
      touchZoom={zoomEnabled}
      doubleTapZoom={zoomEnabled}
      doubleTapHoldZoom={zoomEnabled}
      onPress={(event: any) => {
        const lngLat = event?.nativeEvent?.lngLat;
        if (onPress && Array.isArray(lngLat) && lngLat.length >= 2) {
          const [longitude, latitude] = lngLat;
          onPress({ nativeEvent: { coordinate: { latitude, longitude } } });
        }
      }}
    >
      <Camera
        ref={cameraRef}
        initialViewState={{
          center: [firstRegion.longitude, firstRegion.latitude],
          zoom: regionZoom(firstRegion),
        }}
      />
      {children}
    </NativeMap>
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
  const lngLat: [number, number] = [coordinate.longitude, coordinate.latitude];
  const id = `marker-${cleanId(reactId)}`;
  const mapAnchor = toAnchor(anchor);

  // ViewAnnotation retains native callout titles; other markers use the interactive Marker API.
  if (title) {
    return (
      <ViewAnnotation
        id={id}
        lngLat={lngLat}
        title={title}
        anchor={mapAnchor}
        onPress={onPress ? (event: any) => onPress(event) : undefined}
      >
        {marker}
      </ViewAnnotation>
    );
  }

  return (
    <NativeMarker
      id={id}
      lngLat={lngLat}
      anchor={mapAnchor}
      onPress={onPress ? (event: any) => onPress(event) : undefined}
    >
      {marker}
    </NativeMarker>
  );
}

export function Polyline({ coordinates, strokeColor = '#4F46E5', strokeWidth = 4, strokeOpacity = 1, lineDashPattern, onPress }: any) {
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
  const paint: Record<string, unknown> = {
    'line-color': strokeColor,
    'line-width': strokeWidth,
    'line-opacity': strokeOpacity,
    ...(lineDashPattern ? { 'line-dasharray': lineDashPattern } : {}),
  };

  return (
    <GeoJSONSource
      id={`line-source-${id}`}
      data={shape}
      onPress={onPress ? (event: any) => {
        event?.stopPropagation?.();
        onPress(event);
      } : undefined}
    >
      <Layer type="line" id={`line-layer-${id}`} layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={paint as any} />
    </GeoJSONSource>
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

export function Circle({ center, radius, strokeColor = '#4F46E5', strokeOpacity = 0.5 }: any) {
  const reactId = useId();
  const latitude = Number(center?.latitude);
  const longitude = Number(center?.longitude);
  const meters = Number(radius);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180 || !Number.isFinite(meters) || meters <= 0) return null;

  const id = cleanId(reactId);
  const ring = Array.from({ length: 64 }, (_, index) => destinationPoint(latitude, longitude, meters, (index / 64) * Math.PI * 2));
  // Close the LineString with an exact copy of its first point and avoid a native
  // Polygon/fill layer on the driver map while retaining the 5 km boundary.
  const coordinates = [...ring, [...ring[0]]];
  if (coordinates.some(([lng, lat]) => !Number.isFinite(lng) || !Number.isFinite(lat))) return null;
  const feature = {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates },
  };

  return (
    <GeoJSONSource id={`circle-source-${id}`} data={feature}>
      <Layer type="line" id={`circle-line-${id}`} paint={{ 'line-color': strokeColor, 'line-width': 2, 'line-opacity': strokeOpacity }} />
    </GeoJSONSource>
  );
}

function normalizeColor(color: string) {
  const known: Record<string, string> = {
    green: '#16A34A', red: '#DC2626', orange: '#F59E0B', indigo: '#4F46E5', blue: '#2563EB',
  };
  return known[color?.toLowerCase()] || color || '#2563EB';
}
