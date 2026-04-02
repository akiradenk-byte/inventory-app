import { useEffect, useRef, useCallback } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

const SCAN_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.ITF,
]

export default function BarcodeScanner({ onScan, onClose, continuous = false }) {
  const scannerRef = useRef(null)
  const scannedRef = useRef(false)
  const runningRef = useRef(false)

  const safeStop = async () => {
    if (scannerRef.current && runningRef.current) {
      try {
        runningRef.current = false
        await scannerRef.current.stop()
      } catch (e) {
        // 既に停止済みの場合は無視
      }
    }
  }

  const handleDetected = useCallback((decodedText) => {
    if (scannedRef.current) return
    scannedRef.current = true
    if (continuous) {
      // 連続スキャンモード: カメラを止めず、コールバックを呼んで2秒後に次のスキャンを受付
      onScan(decodedText)
      setTimeout(() => { scannedRef.current = false }, 2000)
    } else {
      safeStop().then(() => {
        setTimeout(() => onScan(decodedText), 100)
      })
    }
  }, [onScan, continuous])

  useEffect(() => {
    let mounted = true
    const scanner = new Html5Qrcode('barcode-reader', { formatsToSupport: SCAN_FORMATS })
    scannerRef.current = scanner

    scanner.start(
      { facingMode: { exact: 'environment' } },
      {
        fps: 15,
        qrbox: { width: 280, height: 180 },
        aspectRatio: 1.777778,
        videoConstraints: {
          facingMode: { exact: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      },
      (decodedText) => {
        if (mounted) handleDetected(decodedText)
      },
      () => {}
    ).then(() => {
      runningRef.current = true
    }).catch((err) => {
      console.error('カメラ起動エラー:', err)
    })

    return () => {
      mounted = false
      safeStop()
    }
  }, [handleDetected])

  const handleClose = () => {
    safeStop().then(() => onClose())
  }

  return (
    <div className="modal-bg" style={{ zIndex: 1100 }} onClick={e => { if (e.target.className === 'modal-bg') handleClose() }}>
      <div className="modal" style={{ maxWidth: 360 }}>
        <h2>バーコードをカメラに向けてください</h2>
        <div id="barcode-reader" style={{ marginTop: '1rem', borderRadius: 8, overflow: 'hidden' }}></div>
        <div className="modal-actions" style={{ marginTop: '1rem' }}>
          <button className="btn" onClick={handleClose}>キャンセル</button>
        </div>
      </div>
    </div>
  )
}
