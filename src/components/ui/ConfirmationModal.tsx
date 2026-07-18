import { useEffect } from 'react'

export interface ConfirmationModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel?: () => void
  isDestructive?: boolean
  showCancel?: boolean
}

export function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel = () => {},
  isDestructive = false,
  showCancel = true,
}: ConfirmationModalProps) {
  
  // Disable body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4 backdrop-blur-xs transition-opacity duration-300">
      {/* Modal Card */}
      <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full text-center space-y-5 border border-gray-100 transform transition-all duration-300 scale-100 animate-scaleIn">
        
        {/* Icon */}
        <div className="flex justify-center">
          {isDestructive ? (
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          )}
        </div>

        {/* Text */}
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-gray-800">{title}</h3>
          <p className="text-base text-gray-500 leading-relaxed px-2">{message}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          {showCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-2xl transition-all duration-200 active:scale-[0.98]"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 text-white text-sm font-semibold rounded-2xl transition-all duration-200 active:scale-[0.98] shadow-sm ${
              isDestructive
                ? 'bg-red-600 hover:bg-red-700 shadow-red-100'
                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
