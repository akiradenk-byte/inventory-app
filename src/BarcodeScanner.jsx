import { useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

export default function BarcodeScanner({ onScan, onClose }) {
  const scannerRef = useRef(null)
  const scannedRef = useRef(false)

  useEffect(() => {
    let mounted = true
    const scanner = new Html5Qrcode('barcode-reader')
    scannerRef.current = scanner
    scannedRef.current = false

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 150 } },
      async (decodedText) => {
        if (scannedRef.current) return
        scannedRef.current = true
        try {
          await scanner.stop()
        } catch (_) { /* ignore */ }
        if (mounted) {
          setTimeout(() => onScan(decodedText), 100)
        }
      },
      () => {}
    ).catch(() => {})

    return () => {
      mounted = false
      scanner.stop().catch(() => {})
    }
  }, [onScan])

  const handleClose = async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop()
      }
    } catch (_) { /* ignore */ }
    onClose()
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
