import { useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

export default function BarcodeScanner({ onScan, onClose }) {
  const scannerRef = useRef(null)

  useEffect(() => {
    const scanner = new Html5Qrcode('barcode-reader')
    scannerRef.current = scanner

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 150 } },
      (decodedText) => {
        onScan(decodedText)
        scanner.stop().catch(() => {})
      },
      () => {}
    ).catch(() => {})

    return () => {
      scanner.stop().catch(() => {})
    }
  }, [onScan])

  return (
    <div className="modal-bg" onClick={e => { if (e.target.className === 'modal-bg') onClose() }}>
      <div className="modal" style={{ maxWidth: 360 }}>
        <h2>バーコードをカメラに向けてください</h2>
        <div id="barcode-reader" style={{ marginTop: '1rem', borderRadius: 8, overflow: 'hidden' }}></div>
        <div className="modal-actions" style={{ marginTop: '1rem' }}>
          <button className="btn" onClick={onClose}>キャンセル</button>
        </div>
      </div>
    </div>
  )
}
