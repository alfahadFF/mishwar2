import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Btn } from './DriverUI';

type Props = {
  visible: boolean;
  onClose: () => void;
  onScanned: (value: string) => void;
};

export default function WalletQRScanner({ visible, onClose, onScanned }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const scannedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      scannedRef.current = false;
      setScanned(false);
    }
  }, [visible]);

  const scan = (value: string) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setScanned(true);
    onScanned(value);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.page}>
        <View style={s.header}>
          <Pressable onPress={onClose} hitSlop={10} style={s.close}>
            <Text style={s.closeText}>إغلاق</Text>
          </Pressable>
          <Text style={s.title}>قراءة كود المحفظة</Text>
          <View style={{ width: 54 }} />
        </View>

        {!permission ? (
          <View style={s.permissionBox}><Text style={s.hint}>جارٍ فحص إذن الكاميرا…</Text></View>
        ) : permission.granted ? (
          <View style={s.cameraArea}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scanned ? undefined : result => scan(result.data)}
            />
            <View pointerEvents="none" style={s.overlay}>
              <View style={s.frame} />
              <Text style={s.scanHint}>وجّه الكاميرا إلى كود محفظة مشوار</Text>
            </View>
          </View>
        ) : (
          <View style={s.permissionBox}>
            <Text style={s.hint}>
              نحتاج إذن الكاميرا لمسح كود المحفظة فقط. لن تُلتقط أو تُحفظ أي صورة.
            </Text>
            {permission.canAskAgain ? (
              <Btn label="السماح بالكاميرا" onPress={() => { requestPermission(); }} />
            ) : (
              <Text style={s.hint}>فعّل إذن الكاميرا من إعدادات الجهاز ثم أعد المحاولة.</Text>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0f172a' },
  header: { minHeight: 58, paddingHorizontal: 16, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0f172a' },
  close: { minWidth: 54, paddingVertical: 10 },
  closeText: { color: '#fff', fontWeight: '800', textAlign: 'left' },
  title: { color: '#fff', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  cameraArea: { flex: 1, overflow: 'hidden' },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 250, height: 250, borderWidth: 3, borderColor: '#fff', borderRadius: 24, backgroundColor: 'transparent' },
  scanHint: { marginTop: 20, color: '#fff', fontSize: 14, fontWeight: '800', textAlign: 'center', paddingHorizontal: 24 },
  permissionBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16 },
  hint: { color: '#fff', textAlign: 'center', fontSize: 15, lineHeight: 23 },
});
